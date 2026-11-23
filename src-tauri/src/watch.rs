//! 데이터 파일 감시. 앱이 직접 쓴 변경과 같은 내용의 중복 이벤트는 무시한다.

/// 마지막으로 본 내용(`seen`)과 현재 내용이 다를 때만 true를 돌려주고 `seen`을 갱신한다.
/// 앱이 스스로 쓴 파일은 쓰는 쪽에서 `seen`을 먼저 맞춰 두므로 여기서 걸러진다.
pub fn should_emit(seen: &mut Option<String>, current: &Option<String>) -> bool {
    if seen == current {
        return false;
    }
    *seen = current.clone();
    true
}

/// 파일을 쓴 창(`writer`)을 뺀 나머지 창의 이름. 창마다 따로 저장소를 갖고 있어서,
/// 한 창이 저장하면 다른 창에 알려 줘야 목록이 바로 바뀐다.
pub fn other_labels(labels: &[String], writer: &str) -> Vec<String> {
    labels.iter().filter(|l| l.as_str() != writer).cloned().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 쓴_창을_뺀_나머지_창에만_알린다() {
        let labels = vec!["widget".to_string(), "quick".to_string(), "settings".to_string()];
        assert_eq!(other_labels(&labels, "quick"), vec!["widget".to_string(), "settings".to_string()]);
        assert_eq!(other_labels(&labels, "unknown").len(), 3);
        assert!(other_labels(&["quick".to_string()], "quick").is_empty());
    }

    #[test]
    fn 처음_보는_내용이면_알린다() {
        let mut seen = None;
        assert!(should_emit(&mut seen, &Some("a".to_string())));
        assert_eq!(seen.as_deref(), Some("a"));
    }

    #[test]
    fn 같은_내용이_다시_오면_알리지_않는다() {
        let mut seen = Some("a".to_string());
        assert!(!should_emit(&mut seen, &Some("a".to_string())));
    }

    #[test]
    fn 내용이_바뀌면_알린다() {
        let mut seen = Some("a".to_string());
        assert!(should_emit(&mut seen, &Some("b".to_string())));
        assert_eq!(seen.as_deref(), Some("b"));
    }

    #[test]
    fn 파일이_사라지면_알린다() {
        let mut seen = Some("a".to_string());
        assert!(should_emit(&mut seen, &None));
        assert_eq!(seen, None);
    }

    #[test]
    fn 없는_상태가_계속되면_알리지_않는다() {
        let mut seen = None;
        assert!(!should_emit(&mut seen, &None));
    }
}
