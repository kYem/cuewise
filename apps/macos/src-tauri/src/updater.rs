//! Tray-triggered update check. No background install: ad-hoc signed updates make
//! macOS re-ask for the camera, which shouldn't happen unprompted.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_updater::UpdaterExt;

static CHECKING: AtomicBool = AtomicBool::new(false);

/// Check the release feed and, if newer, install and relaunch. Repeat clicks
/// while a check is running are ignored.
pub fn check_for_updates(app: &AppHandle) {
    if CHECKING.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = check_and_install(&app).await {
            eprintln!("update check failed: {e}");
            notify(&app, "Couldn't check for updates", "Try again later.");
        }
        CHECKING.store(false, Ordering::SeqCst);
    });
}

async fn check_and_install(app: &AppHandle) -> tauri_plugin_updater::Result<()> {
    let Some(update) = app.updater()?.check().await? else {
        notify(app, "Cuewise is up to date", "");
        return Ok(());
    };
    notify(
        app,
        &format!("Updating to Cuewise {}", update.version),
        "Cuewise restarts when the update is installed.",
    );
    update.download_and_install(|_, _| {}, || {}).await?;
    app.restart();
}

fn notify(app: &AppHandle, title: &str, body: &str) {
    if let Err(e) = app.notification().builder().title(title).body(body).show() {
        eprintln!("failed to show update notification: {e}");
    }
}
