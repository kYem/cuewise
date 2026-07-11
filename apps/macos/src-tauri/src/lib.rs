mod posture;
mod scheduler;
mod tray;

use tauri::{
    menu::{MenuBuilder, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, RunEvent, WindowEvent,
};

/// Show + focus the main window, optionally routing the hash-routed UI to a page.
fn reveal(app: &AppHandle, hash: Option<&str>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
        if let Some(route) = hash {
            let _ = window.eval(&format!("window.location.hash = '{route}'"));
        }
    }
}

/// Build and run the Cuewise desktop app. It stays resident like a menu-bar
/// companion: the window's close button hides to the tray (so nudges keep
/// firing), the tray offers quick actions, and re-opening from the Dock reveals
/// the window again. Actually quitting is "Quit Cuewise" in the tray or Cmd-Q.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .manage(scheduler::SchedulerState::default())
        .manage(posture::PostureState::default())
        .invoke_handler(tauri::generate_handler![
            scheduler::schedule_wake,
            scheduler::cancel_wake,
            tray::set_tray_title,
            tray::set_tray_menu,
            posture::start_posture,
            posture::stop_posture,
            posture::calibrate_posture
        ])
        .setup(|app| {
            // Initial menu; the webview replaces it with live status (and the
            // Pomodoro actions) via `set_tray_menu` once it loads.
            let open = MenuItem::with_id(app, "show", "Open Cuewise", true, None::<&str>)?;
            let insights = MenuItem::with_id(app, "insights", "View Insights", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Cuewise", true, None::<&str>)?;
            let menu = MenuBuilder::new(app)
                .item(&open)
                .item(&insights)
                .separator()
                .item(&quit)
                .build()?;

            let _tray = TrayIconBuilder::with_id(tray::TRAY_ID)
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Cuewise")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => reveal(app, None),
                    "insights" => reveal(app, Some("insights")),
                    "quit" => app.exit(0),
                    // Pomodoro controls live in the webview store; relay the click.
                    "pause" | "resume" | "start" => {
                        let _ = app.emit("tray://action", event.id.as_ref().to_string());
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Hide to the tray instead of quitting so the app stays resident and
            // keeps firing nudges. Tray "Quit Cuewise" / Cmd-Q still exit.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Cuewise")
        .run(|app, event| {
            // Re-opening from the Dock reveals the hidden window.
            if let RunEvent::Reopen { .. } = event {
                reveal(app, None);
            }
        });
}
