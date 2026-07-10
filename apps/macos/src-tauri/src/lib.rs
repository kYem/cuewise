mod scheduler;

use tauri::{
    menu::{MenuBuilder, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, RunEvent, WindowEvent,
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
        .manage(scheduler::SchedulerState::default())
        .invoke_handler(tauri::generate_handler![
            scheduler::schedule_wake,
            scheduler::cancel_wake
        ])
        .setup(|app| {
            let open = MenuItem::with_id(app, "show", "Open Cuewise", true, None::<&str>)?;
            let focus =
                MenuItem::with_id(app, "focus", "Start a Focus Session", true, None::<&str>)?;
            let insights = MenuItem::with_id(app, "insights", "View Insights", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Cuewise", true, None::<&str>)?;
            let menu = MenuBuilder::new(app)
                .item(&open)
                .item(&focus)
                .item(&insights)
                .separator()
                .item(&quit)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Cuewise")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => reveal(app, None),
                    "focus" => reveal(app, Some("pomodoro")),
                    "insights" => reveal(app, Some("insights")),
                    "quit" => app.exit(0),
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
