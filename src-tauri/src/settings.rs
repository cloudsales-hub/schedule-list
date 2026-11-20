//! 앱 설정(이 PC에만 저장, 동기화 대상 아님)과 데이터 파일 위치 계산.

use serde::{Deserialize, Serialize};
use std::io;
use std::path::{Path, PathBuf};

const DEFAULT_HOTKEY: &str = "Alt+Backquote";
/// 예전 버전의 기본 키. 윈도우가 먼저 가져가 동작하지 않아 새 기본 키로 바꾼다.
const OLD_DEFAULT_HOTKEY: &str = "Super+J";
const DEFAULT_BANNER_HEIGHT: u32 = 320;
const ALLOWED_BANNER_HEIGHTS: [u32; 3] = [160, 240, 320];
const DATA_FILE_NAME: &str = "schedule-data.json";
const ONEDRIVE_SUBFOLDER: &str = "일정위젯";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Tauri 표기. 예: "Alt+Backquote" (화면에는 "Alt+~"로 보인다)
    pub hotkey: String,
    pub data_dir: Option<String>,
    pub autostart: bool,
    /// 비우면 기본 그림을 쓴다
    pub banner_path: Option<String>,
    /// 160 | 240 | 320
    pub banner_height: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            hotkey: DEFAULT_HOTKEY.to_string(),
            data_dir: None,
            autostart: true,
            banner_path: None,
            banner_height: DEFAULT_BANNER_HEIGHT,
        }
    }
}

impl Settings {
    /// 허용되지 않는 값을 기본값으로 바로잡는다.
    pub fn normalized(mut self) -> Settings {
        if !ALLOWED_BANNER_HEIGHTS.contains(&self.banner_height) {
            self.banner_height = DEFAULT_BANNER_HEIGHT;
        }
        if self.hotkey.trim().is_empty() || self.hotkey == OLD_DEFAULT_HOTKEY {
            self.hotkey = DEFAULT_HOTKEY.to_string();
        }
        self
    }
}

/// 사용자가 고른 폴더 > `<홈>/OneDrive/일정위젯`(OneDrive 폴더가 있을 때) > 앱 데이터 폴더.
pub fn resolve_data_dir(settings: &Settings, home: &Path, app_data: &Path) -> PathBuf {
    if let Some(dir) = settings.data_dir.as_deref() {
        if !dir.trim().is_empty() {
            return PathBuf::from(dir);
        }
    }
    let onedrive = home.join("OneDrive");
    if onedrive.is_dir() {
        return onedrive.join(ONEDRIVE_SUBFOLDER);
    }
    app_data.to_path_buf()
}

pub fn data_file(dir: &Path) -> PathBuf {
    dir.join(DATA_FILE_NAME)
}

/// 설정 파일이 없거나 깨졌으면 기본값으로 시작한다.
pub fn load_settings_file(path: &Path) -> Settings {
    let text = match datafile::read_text(path) {
        Ok(Some(t)) => t,
        _ => return Settings::default(),
    };
    serde_json::from_str::<Settings>(&text)
        .map(Settings::normalized)
        .unwrap_or_default()
}

pub fn save_settings_file(path: &Path, settings: &Settings) -> io::Result<()> {
    let text = serde_json::to_string_pretty(settings)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    datafile::write_atomic(path, &text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn 기본값() {
        let s = Settings::default();
        assert_eq!(s.hotkey, "Alt+Backquote");
        assert_eq!(s.data_dir, None);
        assert!(s.autostart);
        assert_eq!(s.banner_path, None);
        assert_eq!(s.banner_height, 320);
    }

    #[test]
    fn json_필드_이름은_camel_case() {
        let json = serde_json::to_string(&Settings::default()).unwrap();
        assert!(json.contains("\"dataDir\""), "{json}");
        assert!(json.contains("\"bannerHeight\":320"), "{json}");
        assert!(json.contains("\"bannerPath\""), "{json}");
    }

    #[test]
    fn 일부만_있는_json은_나머지를_기본값으로_채운다() {
        let s: Settings = serde_json::from_str("{\"hotkey\":\"Alt+Z\"}").unwrap();
        assert_eq!(s.hotkey, "Alt+Z");
        assert_eq!(s.banner_height, 320);
        assert!(s.autostart);
    }

    #[test]
    fn 허용되지_않는_배너_높이는_320으로_바로잡는다() {
        for ok in [160, 240, 320] {
            let s = Settings { banner_height: ok, ..Settings::default() }.normalized();
            assert_eq!(s.banner_height, ok);
        }
        let s = Settings { banner_height: 999, ..Settings::default() }.normalized();
        assert_eq!(s.banner_height, 320);
    }

    #[test]
    fn 빈_단축키는_기본값으로_바로잡는다() {
        let s = Settings { hotkey: "  ".into(), ..Settings::default() }.normalized();
        assert_eq!(s.hotkey, "Alt+Backquote");
    }

    #[test]
    fn 예전_기본_키_win_j는_새_기본_키로_바꾼다() {
        let s = Settings { hotkey: "Super+J".into(), ..Settings::default() }.normalized();
        assert_eq!(s.hotkey, "Alt+Backquote");
        let kept = Settings { hotkey: "Ctrl+Alt+J".into(), ..Settings::default() }.normalized();
        assert_eq!(kept.hotkey, "Ctrl+Alt+J");
    }

    #[test]
    fn 저장돼_있던_win_j_설정도_읽을_때_바뀐다() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, "{\"hotkey\":\"Super+J\"}").unwrap();
        assert_eq!(load_settings_file(&path).hotkey, "Alt+Backquote");
    }

    #[test]
    fn 사용자가_고른_폴더가_있으면_그것을_쓴다() {
        let home = tempdir().unwrap();
        let app = tempdir().unwrap();
        let s = Settings { data_dir: Some("D:\\내폴더".into()), ..Settings::default() };
        assert_eq!(resolve_data_dir(&s, home.path(), app.path()), PathBuf::from("D:\\내폴더"));
    }

    #[test]
    fn 폴더가_비어_있고_원드라이브가_있으면_원드라이브_일정위젯_폴더() {
        let home = tempdir().unwrap();
        let app = tempdir().unwrap();
        fs::create_dir(home.path().join("OneDrive")).unwrap();
        let s = Settings::default();
        assert_eq!(
            resolve_data_dir(&s, home.path(), app.path()),
            home.path().join("OneDrive").join("일정위젯")
        );
    }

    #[test]
    fn 원드라이브가_없으면_앱_데이터_폴더() {
        let home = tempdir().unwrap();
        let app = tempdir().unwrap();
        let s = Settings::default();
        assert_eq!(resolve_data_dir(&s, home.path(), app.path()), app.path().to_path_buf());
    }

    #[test]
    fn 빈_문자열_폴더는_고르지_않은_것으로_본다() {
        let home = tempdir().unwrap();
        let app = tempdir().unwrap();
        let s = Settings { data_dir: Some("".into()), ..Settings::default() };
        assert_eq!(resolve_data_dir(&s, home.path(), app.path()), app.path().to_path_buf());
    }

    #[test]
    fn 데이터_파일_이름() {
        assert_eq!(
            data_file(Path::new("C:\\x")),
            Path::new("C:\\x").join("schedule-data.json")
        );
    }

    #[test]
    fn 설정을_저장하고_다시_읽는다() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let s = Settings { hotkey: "Alt+Z".into(), banner_height: 240, ..Settings::default() };
        save_settings_file(&path, &s).unwrap();
        assert_eq!(load_settings_file(&path), s);
    }

    #[test]
    fn 설정_파일이_없거나_깨져도_기본값으로_시작한다() {
        let dir = tempdir().unwrap();
        let missing = dir.path().join("none.json");
        assert_eq!(load_settings_file(&missing), Settings::default());
        let broken = dir.path().join("broken.json");
        fs::write(&broken, "{깨짐").unwrap();
        assert_eq!(load_settings_file(&broken), Settings::default());
    }
}
