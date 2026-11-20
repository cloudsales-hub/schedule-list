mod settings;
mod watch;

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use settings::{data_file, load_settings_file, resolve_data_dir, save_settings_file, Settings};
use std::time::Duration;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, State, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

mod updater;

/// 앱 전체가 공유하는 상태.
pub struct AppState {
    settings: Mutex<Settings>,
    /// 마지막으로 읽거나 쓴 데이터 파일 내용. 감시 이벤트 중복을 걸러내는 데 쓴다.
    last_seen: Mutex<Option<String>>,
    watcher: Mutex<Option<RecommendedWatcher>>,
    /// 단축키 등록에 실패했을 때의 이유. 위젯이 나중에 켜져도 알 수 있게 보관한다.
    hotkey_error: Mutex<Option<String>>,
    home: PathBuf,
    app_data: PathBuf,
    settings_file: PathBuf,
}

impl AppState {
    fn data_file(&self) -> PathBuf {
        let s = self.settings.lock().unwrap();
        data_file(&resolve_data_dir(&s, &self.home, &self.app_data))
    }
}

#[tauri::command]
fn read_data(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let text = datafile::read_text(&state.data_file())
        .map_err(|e| format!("데이터 파일을 읽지 못했습니다: {e}"))?;
    *state.last_seen.lock().unwrap() = text.clone();
    Ok(text)
}

#[tauri::command]
fn write_data(state: State<'_, AppState>, text: String) -> Result<(), String> {
    // 감시 이벤트가 오기 전에 먼저 맞춰 두어야 자기가 쓴 변경을 다시 알리지 않는다.
    *state.last_seen.lock().unwrap() = Some(text.clone());
    datafile::write_atomic(&state.data_file(), &text)
        .map_err(|e| format!("데이터 파일을 저장하지 못했습니다: {e}"))
}

#[tauri::command]
fn backup_corrupt_data(state: State<'_, AppState>) -> Result<String, String> {
    let backup = datafile::backup_corrupt(&state.data_file())
        .map_err(|e| format!("깨진 데이터 파일을 보관하지 못했습니다: {e}"))?;
    *state.last_seen.lock().unwrap() = None;
    Ok(backup.to_string_lossy().into_owned())
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> Settings {
    state.settings.lock().unwrap().clone()
}

#[tauri::command]
fn save_settings(app: AppHandle, state: State<'_, AppState>, settings: Settings) -> Result<(), String> {
    let mut settings = settings.normalized();
    let (old_hotkey, old_dir) = {
        let old = state.settings.lock().unwrap();
        (old.hotkey.clone(), old.data_dir.clone())
    };

    // 새 단축키가 등록되지 않으면 이전 키를 그대로 쓰고 이유를 알린다.
    if settings.hotkey != old_hotkey {
        match try_register_hotkey(&app, &settings.hotkey) {
            Ok(()) => *state.hotkey_error.lock().unwrap() = None,
            Err(msg) => {
                settings.hotkey = old_hotkey.clone();
                let _ = try_register_hotkey(&app, &old_hotkey);
                *state.hotkey_error.lock().unwrap() = Some(msg.clone());
                let _ = app.emit("hotkey-failed", msg);
            }
        }
    }

    save_settings_file(&state.settings_file, &settings)
        .map_err(|e| format!("설정을 저장하지 못했습니다: {e}"))?;
    let dir_changed = settings.data_dir != old_dir;
    let autostart = settings.autostart;
    *state.settings.lock().unwrap() = settings;
    apply_autostart(&app, autostart);
    let _ = app.emit("settings-changed", ());
    if dir_changed {
        restart_watcher(&app);
        // 각 창이 새 폴더의 파일과 자기 데이터를 합쳐 다시 저장하도록 알린다.
        let _ = app.emit("data-changed", ());
    }
    Ok(())
}

/// 윈도우 시작 시 자동 실행을 설정에 맞춘다. 실패해도 앱 사용에는 지장이 없으므로 무시한다.
fn apply_autostart(app: &AppHandle, enabled: bool) {
    let launcher = app.autolaunch();
    let _ = if enabled { launcher.enable() } else { launcher.disable() };
}

/// 처음 실행할 때 폴더 선택 화면에 미리 채워 줄 OneDrive 안 폴더. OneDrive가 없으면 None.
#[tauri::command]
fn suggested_data_dir(state: State<'_, AppState>) -> Option<String> {
    let onedrive = state.home.join("OneDrive");
    onedrive
        .is_dir()
        .then(|| onedrive.join("일정위젯").to_string_lossy().into_owned())
}

#[tauri::command]
fn get_hotkey_error(state: State<'_, AppState>) -> Option<String> {
    state.hotkey_error.lock().unwrap().clone()
}

/// 빠른 입력창을 가운데에 열고 입력칸을 비운 채 포커스한다. 이미 열려 있어도 다시 포커스한다.
fn open_quick(app: &AppHandle) {
    let Some(win) = app.get_webview_window("quick") else { return };
    let _ = win.center();
    let _ = win.show();
    let _ = win.set_focus();
    let _ = app.emit_to("quick", "quick-open", ());
}

/// 단축키 하나만 등록한다(이전 등록은 모두 해제). 실패하면 사용자에게 보여 줄 문구를 돌려준다.
fn try_register_hotkey(app: &AppHandle, hotkey: &str) -> Result<(), String> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    // 이미 이 앱이 같은 키를 등록해 둔 상태라면 그대로 쓴다(중복 등록 오류로 잘못 알리지 않는다).
    if gs.is_registered(hotkey) {
        return Ok(());
    }
    gs.on_shortcut(hotkey, |app, _shortcut, event| {
        if event.state() == ShortcutState::Pressed {
            open_quick(app);
        }
    })
    .map_err(|e| format!("이미 사용 중인 키입니다. 설정에서 다른 키를 골라 주세요 ({hotkey}: {e})"))
}

/// 기본 단축키(Alt+~)를 다른 프로그램이 이미 쓰고 있을 때 대신 시도해 볼 키들.
const FALLBACK_HOTKEYS: [&str; 2] = ["Ctrl+Alt+J", "Ctrl+Alt+M"];
const DEFAULT_HOTKEY: &str = "Alt+Backquote";

/// 설정의 단축키를 등록한다. 실패하면 이유를 보관하고 `hotkey-failed`를 알린다.
/// 기본 키(Alt+~)가 막혀 있으면 대체 키를 찾아 자동으로 바꾼다.
fn register_hotkey(app: &AppHandle) {
    let hotkey = app.state::<AppState>().settings.lock().unwrap().hotkey.clone();
    let result = try_register_hotkey(app, &hotkey);
    let state = app.state::<AppState>();
    match result {
        Ok(()) => *state.hotkey_error.lock().unwrap() = None,
        Err(msg) => {
            if hotkey == DEFAULT_HOTKEY {
                for fb in FALLBACK_HOTKEYS {
                    if try_register_hotkey(app, fb).is_ok() {
                        let notice = format!("Alt+~를 다른 프로그램이 이미 쓰고 있어 {fb} 키로 바꿨습니다. 설정에서 다른 키로 바꿀 수 있습니다.");
                        let updated = {
                            let mut s = state.settings.lock().unwrap();
                            s.hotkey = fb.to_string();
                            s.clone()
                        };
                        let _ = save_settings_file(&state.settings_file, &updated);
                        *state.hotkey_error.lock().unwrap() = Some(notice.clone());
                        let _ = app.emit("hotkey-failed", notice);
                        let _ = app.emit("settings-changed", ());
                        return;
                    }
                }
            }
            *state.hotkey_error.lock().unwrap() = Some(msg.clone());
            let _ = app.emit("hotkey-failed", msg);
        }
    }
}

/// 이미 만들어진 창을 보여 주고 앞으로 가져온다. 없는 창이면 오류를 돌려준다.
#[tauri::command]
fn show_window(app: AppHandle, label: String) -> Result<(), String> {
    if label == "quick" {
        open_quick(&app);
        return Ok(());
    }
    let win = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("'{label}' 창이 없습니다"))?;
    win.show().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())
}

/// 위젯이 포커스를 잃었을 때 아래로 내릴지. 빠른 메모창이 떠서 포커스가 넘어간 경우에는
/// 위젯의 위치(맨 위든 바탕화면이든)를 그대로 둔다.
fn should_lower_on_blur(quick_visible: bool) -> bool {
    !quick_visible
}

fn quick_is_visible(app: &AppHandle) -> bool {
    app.get_webview_window("quick").and_then(|w| w.is_visible().ok()).unwrap_or(false)
}

/// 위젯을 바탕화면 쪽(다른 창 아래)으로 내린다.
fn lower_widget(win: &tauri::WebviewWindow) {
    let _ = win.set_always_on_top(false);
    let _ = win.set_always_on_bottom(true);
}

/// 위젯을 맨 앞으로 올린다. 위젯 밖을 누르면(포커스를 잃으면) 다시 아래로 내려가고,
/// 포커스를 못 얻은 경우에도 10초 뒤에는 내려간다.
/// 숨겨져 있거나 화면 밖에 있어도 보이는 자리로 가져온다.
fn peek_widget(app: &AppHandle) {
    let Some(win) = app.get_webview_window("widget") else { return };
    ensure_widget_on_screen(app);
    let _ = win.show();
    let _ = win.unminimize();
    let _ = win.set_always_on_bottom(false);
    let _ = win.set_always_on_top(true);
    let _ = win.set_focus();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(10));
        if !win.is_focused().unwrap_or(false) && should_lower_on_blur(quick_is_visible(win.app_handle())) {
            lower_widget(&win);
        }
    });
}

#[tauri::command]
fn raise_widget(app: AppHandle) {
    peek_widget(&app);
}

/// 위젯을 화면 오른쪽 위로 옮긴다.
fn move_widget_to_top_right(app: &AppHandle) {
    let Some(win) = app.get_webview_window("widget") else { return };
    let Ok(Some(monitor)) = win.primary_monitor() else { return };
    let Ok(size) = win.outer_size() else { return };
    let margin = (24.0 * monitor.scale_factor()) as i32;
    let x = monitor.position().x + monitor.size().width as i32 - size.width as i32 - margin;
    let y = monitor.position().y + margin;
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

/// 위젯이 어느 모니터 안에도 없으면(모니터를 뺐거나 해상도가 바뀐 경우) 오른쪽 위로 옮긴다.
fn ensure_widget_on_screen(app: &AppHandle) {
    let Some(win) = app.get_webview_window("widget") else { return };
    let Ok(pos) = win.outer_position() else { return };
    let Ok(size) = win.outer_size() else { return };
    let (cx, cy) = (pos.x + size.width as i32 / 2, pos.y + 40);
    let visible = win.available_monitors().map(|ms| {
        ms.iter().any(|m| {
            let (mx, my) = (m.position().x, m.position().y);
            cx >= mx && cx < mx + m.size().width as i32 && cy >= my && cy < my + m.size().height as i32
        })
    });
    if !matches!(visible, Ok(true)) {
        move_widget_to_top_right(app);
    }
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "위젯 보이기", true, None::<&str>)?;
    let reset = MenuItem::with_id(app, "reset", "위젯 위치 초기화", true, None::<&str>)?;
    let dash = MenuItem::with_id(app, "dashboard", "대시보드 열기", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &reset, &dash, &quit])?;
    let mut builder = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("일정·할일 위젯")
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "quit" => app.exit(0),
                "show" => peek_widget(app),
                "reset" => {
                    move_widget_to_top_right(app);
                    peek_widget(app);
                }
                "dashboard" => {
                    if let Some(w) = app.get_webview_window("dashboard") {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                peek_widget(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

/// 저장된 위치가 없는 첫 실행이면 위젯을 화면 오른쪽 위에 놓고, 저장된 위치가 화면 밖이면 바로잡는다.
fn place_widget_first_time(app: &AppHandle) {
    let state_file = app.path().app_config_dir().map(|d| d.join(".window-state.json"));
    if matches!(&state_file, Ok(f) if f.exists()) {
        ensure_widget_on_screen(app);
    } else {
        move_widget_to_top_right(app);
    }
}

/// 현재 데이터 폴더를 감시한다. 폴더가 바뀌면 다시 호출해서 감시 대상을 바꾼다.
fn restart_watcher(app: &AppHandle) {
    let state = app.state::<AppState>();
    let file = state.data_file();
    let Some(dir) = file.parent().map(|p| p.to_path_buf()) else {
        return;
    };
    let _ = fs::create_dir_all(&dir);

    let handle = app.clone();
    let watched_name = file.file_name().map(|n| n.to_os_string());
    let watched_file = file.clone();
    let watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        if !event.paths.iter().any(|p| p.file_name() == watched_name.as_deref()) {
            return;
        }
        let current = datafile::read_text(&watched_file).ok().flatten();
        let state = handle.state::<AppState>();
        let changed = {
            let mut seen = state.last_seen.lock().unwrap();
            watch::should_emit(&mut seen, &current)
        };
        if changed {
            let _ = handle.emit("data-changed", ());
        }
    });

    if let Ok(mut w) = watcher {
        if w.watch(&dir, RecursiveMode::NonRecursive).is_ok() {
            *state.watcher.lock().unwrap() = Some(w);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 앱이 두 번 뜨지 않게 한다. (이후 Task에서 기존 창을 앞으로 가져오도록 확장)
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| peek_widget(app)))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                // 빠른 입력창과 대시보드는 항상 숨긴 채로 시작해야 하므로 위치·보임 상태를 기억하지 않는다.
                .with_denylist(&["quick", "dashboard"])
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let home = app.path().home_dir().unwrap_or_default();
            let app_data = app.path().app_data_dir()?;
            let settings_file = app.path().app_config_dir()?.join("settings.json");
            let settings = load_settings_file(&settings_file);
            app.manage(AppState {
                settings: Mutex::new(settings),
                last_seen: Mutex::new(None),
                watcher: Mutex::new(None),
                hotkey_error: Mutex::new(None),
                home,
                app_data,
                settings_file,
            });
            // 창은 상태를 등록한 뒤에 만든다. 먼저 뜨면 화면이 명령을 부를 때 상태가 없어 오류가 난다.
            for cfg in app.config().app.windows.iter() {
                tauri::WebviewWindowBuilder::from_config(app.handle(), cfg)?.build()?;
            }
            restart_watcher(app.handle());
            register_hotkey(app.handle());
            let autostart = app.state::<AppState>().settings.lock().unwrap().autostart;
            apply_autostart(app.handle(), autostart);
            setup_tray(app.handle())?;
            place_widget_first_time(app.handle());
            updater::check_in_background(app.handle().clone());
            Ok(())
        })
        // 대시보드를 닫아도 앱은 계속 실행한다. 숨기기만 한다.
        .on_window_event(|window, event| {
            // 위젯을 끌어 옮기거나 크기를 바꾸면 바로 저장해 두어, 껐다 켜도 같은 자리에 뜬다.
            // 위젯 밖을 눌러 포커스를 잃으면 다시 다른 창 아래로 내린다.
            if let (true, WindowEvent::Focused(false)) = (window.label() == "widget", event) {
                if should_lower_on_blur(quick_is_visible(window.app_handle())) {
                    if let Some(w) = window.app_handle().get_webview_window("widget") {
                        lower_widget(&w);
                    }
                }
            }
            if window.label() == "widget" && matches!(event, WindowEvent::Moved(_) | WindowEvent::Resized(_)) {
                let _ = window.app_handle().save_window_state(StateFlags::all());
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "dashboard" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            read_data,
            write_data,
            backup_corrupt_data,
            get_settings,
            save_settings,
            show_window,
            get_hotkey_error,
            raise_widget,
            suggested_data_dir
        ])
        .run(tauri::generate_context!())
        .expect("앱을 실행하지 못했습니다");
}

#[cfg(test)]
mod tests {
    use super::should_lower_on_blur;

    #[test]
    fn 빠른_메모창이_떠_있으면_위젯_위치를_바꾸지_않는다() {
        assert!(!should_lower_on_blur(true));
    }

    #[test]
    fn 다른_곳을_눌러_포커스를_잃으면_바탕화면_쪽으로_내린다() {
        assert!(should_lower_on_blur(false));
    }
}
