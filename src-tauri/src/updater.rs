//! 새 버전 자동 업데이트. 앱을 켜고 잠시 뒤 GitHub 릴리스의 최신 버전을 확인하고,
//! 새 버전이 있으면 물어본 뒤 내려받아 설치하고 다시 시작한다.

use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::UpdaterExt;

/// 켠 직후에는 네트워크가 아직 안 잡혔을 수 있어 잠시 기다린 뒤 확인하고, 실패하면 한 번 더 시도한다.
const FIRST_DELAY: Duration = Duration::from_secs(20);
const RETRY_DELAY: Duration = Duration::from_secs(120);

pub fn check_in_background(app: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_DELAY);
        if tauri::async_runtime::block_on(check(&app, false)).is_err() {
            std::thread::sleep(RETRY_DELAY);
            let _ = tauri::async_runtime::block_on(check(&app, false));
        }
    });
}

/// 트레이 메뉴의 "업데이트 확인". 결과(최신 버전이거나 실패 이유)를 창으로 알려 준다.
pub fn check_now(app: AppHandle) {
    std::thread::spawn(move || {
        if let Err(e) = tauri::async_runtime::block_on(check(&app, true)) {
            app.dialog()
                .message(format!("업데이트를 확인하지 못했습니다.\n{e}"))
                .title("업데이트")
                .blocking_show();
        }
    });
}

async fn check(app: &AppHandle, manual: bool) -> Result<(), tauri_plugin_updater::Error> {
    let Some(update) = app.updater()?.check().await? else {
        if manual {
            app.dialog()
                .message(format!("최신 버전입니다. (현재 v{})", env!("CARGO_PKG_VERSION")))
                .title("업데이트")
                .blocking_show();
        }
        return Ok(());
    };
    let go = app
        .dialog()
        .message(format!(
            "새 버전 {}이(가) 있습니다. 지금 업데이트할까요?\n(설치가 끝나면 앱이 자동으로 다시 시작됩니다. 일정·메모는 그대로 유지됩니다.)",
            update.version
        ))
        .title("업데이트")
        .buttons(MessageDialogButtons::OkCancelCustom("업데이트".into(), "나중에".into()))
        .blocking_show();
    if go {
        update.download_and_install(|_, _| {}, || {}).await?;
        app.restart();
    }
    Ok(())
}
