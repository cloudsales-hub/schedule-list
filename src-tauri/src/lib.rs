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
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

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
    let settings = settings.normalized();
    save_settings_file(&state.settings_file, &settings)
        .map_err(|e| format!("설정을 저장하지 못했습니다: {e}"))?;
    *state.settings.lock().unwrap() = settings;
    restart_watcher(&app);
    register_hotkey(&app);
    Ok(())
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

/// 설정의 단축키를 (다시) 등록한다. 실패하면 이유를 보관하고 `hotkey-failed`를 알린다.
fn register_hotkey(app: &AppHandle) {
    let hotkey = app.state::<AppState>().settings.lock().unwrap().hotkey.clone();
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let result = gs.on_shortcut(hotkey.as_str(), |app, _shortcut, event| {
        if event.state() == ShortcutState::Pressed {
            open_quick(app);
        }
    });
    let state = app.state::<AppState>();
    match result {
        Ok(()) => *state.hotkey_error.lock().unwrap() = None,
        Err(e) => {
            let msg = format!("이미 사용 중인 키입니다. 설정에서 다른 키를 골라 주세요 ({hotkey}: {e})");
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

/// 위젯을 5초간 맨 앞으로 올렸다가 다시 바탕화면 위치(맨 아래)로 내린다.
fn peek_widget(app: &AppHandle) {
    let Some(win) = app.get_webview_window("widget") else { return };
    let _ = win.show();
    let _ = win.set_always_on_bottom(false);
    let _ = win.set_always_on_top(true);
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(5));
        let _ = win.set_always_on_top(false);
        let _ = win.set_always_on_bottom(true);
    });
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&quit])?;
    let mut builder = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("일정·할일 위젯")
        .on_menu_event(|app, event| {
            if event.id.as_ref() == "quit" {
                app.exit(0);
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

/// 저장된 위치가 없는 첫 실행이면 위젯을 화면 오른쪽 위에 놓는다.
fn place_widget_first_time(app: &AppHandle) {
    let state_file = app.path().app_config_dir().map(|d| d.join(".window-state.json"));
    if matches!(&state_file, Ok(f) if f.exists()) {
        return;
    }
    let Some(win) = app.get_webview_window("widget") else { return };
    let Ok(Some(monitor)) = win.primary_monitor() else { return };
    let Ok(size) = win.outer_size() else { return };
    let margin = (24.0 * monitor.scale_factor()) as i32;
    let x = monitor.position().x + monitor.size().width as i32 - size.width as i32 - margin;
    let y = monitor.position().y + margin;
    let _ = win.set_position(PhysicalPosition::new(x, y));
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
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
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
            restart_watcher(app.handle());
            register_hotkey(app.handle());
            setup_tray(app.handle())?;
            place_widget_first_time(app.handle());
            Ok(())
        })
        // 대시보드를 닫아도 앱은 계속 실행한다. 숨기기만 한다.
        .on_window_event(|window, event| {
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
            get_hotkey_error
        ])
        .run(tauri::generate_context!())
        .expect("앱을 실행하지 못했습니다");
}
