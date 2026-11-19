//! 데이터 파일 읽기·쓰기. Tauri에 의존하지 않아 리눅스에서도 테스트한다.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// 파일 내용을 읽는다. 파일이 없으면 `Ok(None)`.
/// UTF-8이 아닌 깨진 파일도 예외 없이 읽어서(깨진 글자는 대체 문자) 호출한 쪽이 "깨졌다"고 판단하게 한다.
pub fn read_text(path: &Path) -> io::Result<Option<String>> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(String::from_utf8_lossy(&bytes).into_owned())),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}

/// 임시 파일에 먼저 쓰고 이름을 바꿔서, 쓰는 도중에 끊겨도 기존 파일이 깨지지 않게 한다.
/// 폴더가 없으면 만든다.
pub fn write_atomic(path: &Path, text: &str) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut tmp_name = path
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "파일 이름이 없습니다"))?
        .to_os_string();
    tmp_name.push(".tmp");
    let tmp = path.with_file_name(tmp_name);

    let result = (|| {
        let mut f = fs::File::create(&tmp)?;
        io::Write::write_all(&mut f, text.as_bytes())?;
        f.sync_all()?;
        fs::rename(&tmp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

/// 깨진 데이터 파일을 지우지 않고 `<이름>.corrupt-<unix초>.json`으로 이름만 바꿔 보관한다.
/// 같은 이름의 백업이 있으면 숫자를 붙여서 덮어쓰지 않는다.
pub fn backup_corrupt(path: &Path) -> io::Result<PathBuf> {
    let stem = path
        .file_stem()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "파일 이름이 없습니다"))?
        .to_string_lossy()
        .into_owned();
    let ext = path
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let mut n = 0u32;
    loop {
        let suffix = if n == 0 { String::new() } else { format!("-{n}") };
        let candidate = path.with_file_name(format!("{stem}.corrupt-{secs}{suffix}{ext}"));
        if !candidate.exists() {
            fs::rename(path, &candidate)?;
            return Ok(candidate);
        }
        n += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn 없는_파일을_읽으면_none() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("schedule-data.json");
        assert_eq!(read_text(&path).unwrap(), None);
    }

    #[test]
    fn 쓴_내용을_그대로_읽는다_한글_포함() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("schedule-data.json");
        write_atomic(&path, "{\"text\":\"견적서 재확인 — 내일 오전까지\"}").unwrap();
        assert_eq!(
            read_text(&path).unwrap().as_deref(),
            Some("{\"text\":\"견적서 재확인 — 내일 오전까지\"}")
        );
    }

    #[test]
    fn 쓰고_나면_임시_파일이_남지_않는다() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("schedule-data.json");
        write_atomic(&path, "a").unwrap();
        write_atomic(&path, "b").unwrap();
        let names: Vec<String> = fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["schedule-data.json".to_string()]);
    }

    #[test]
    fn 이미_있는_파일을_덮어쓴다() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("schedule-data.json");
        write_atomic(&path, "옛날").unwrap();
        write_atomic(&path, "새것").unwrap();
        assert_eq!(read_text(&path).unwrap().as_deref(), Some("새것"));
    }

    #[test]
    fn 폴더가_없으면_만든다() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("OneDrive").join("일정위젯").join("schedule-data.json");
        write_atomic(&path, "x").unwrap();
        assert_eq!(read_text(&path).unwrap().as_deref(), Some("x"));
    }

    #[test]
    fn utf8이_아닌_깨진_파일도_읽히고_예외를_던지지_않는다() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("schedule-data.json");
        fs::write(&path, [0xff, 0xfe, b'{', 0x80]).unwrap();
        assert!(read_text(&path).unwrap().is_some());
    }

    #[test]
    fn 깨진_파일은_지우지_않고_이름만_바꿔_보관한다() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("schedule-data.json");
        fs::write(&path, "{깨짐").unwrap();

        let backup = backup_corrupt(&path).unwrap();

        assert!(!path.exists(), "원래 경로는 비어 있어야 한다");
        assert_eq!(fs::read_to_string(&backup).unwrap(), "{깨짐");
        assert_eq!(backup.parent().unwrap(), dir.path());
        let name = backup.file_name().unwrap().to_string_lossy().into_owned();
        assert!(name.starts_with("schedule-data.corrupt-"), "{name}");
        assert!(name.ends_with(".json"), "{name}");
    }

    #[test]
    fn 같은_초에_두_번_백업해도_앞의_백업을_덮어쓰지_않는다() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("schedule-data.json");
        fs::write(&path, "첫번째").unwrap();
        let first = backup_corrupt(&path).unwrap();
        fs::write(&path, "두번째").unwrap();
        let second = backup_corrupt(&path).unwrap();

        assert_ne!(first, second);
        assert_eq!(fs::read_to_string(&first).unwrap(), "첫번째");
        assert_eq!(fs::read_to_string(&second).unwrap(), "두번째");
    }
}
