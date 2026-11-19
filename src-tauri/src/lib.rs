mod settings;
mod watch;

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use settings::{data_file, load_settings_file, resolve_data_dir, save_settings_file, Settings};
use tauri::{AppHandle, Emitter, Manager, State};

/// 앱 전체가 공유하는 상태.
pub struct AppState {
    settings: Mutex<Settings>,
    /// 마지막으로 읽거나 쓴 데이터 파일 내용. 감시 이벤트 중복을 걸러내는 데 쓴다.
    last_seen: Mutex<Option<String>>,
    watcher: Mutex<Option<RecommendedWatcher>>,
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
    Ok(())
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
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .setup(|app| {
            let home = app.path().home_dir().unwrap_or_default();
            let app_data = app.path().app_data_dir()?;
            let settings_file = app.path().app_config_dir()?.join("settings.json");
            let settings = load_settings_file(&settings_file);
            app.manage(AppState {
                settings: Mutex::new(settings),
                last_seen: Mutex::new(None),
                watcher: Mutex::new(None),
                home,
                app_data,
                settings_file,
            });
            restart_watcher(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_data,
            write_data,
            backup_corrupt_data,
            get_settings,
            save_settings
        ])
        .run(tauri::generate_context!())
        .expect("앱을 실행하지 못했습니다");
}
