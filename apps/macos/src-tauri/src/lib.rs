mod error;
mod glow;
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
        // The tray's "Open Cuewise" / Dock click do nothing else to recover from
        // this, so a failure here would otherwise be a silent no-op for the user.
        if let Err(e) = window.show() {
            eprintln!("failed to show main window: {e}");
        }
        if let Err(e) = window.set_focus() {
            eprintln!("failed to focus main window: {e}");
        }
        if let Some(route) = hash {
            let _ = window.eval(format!("window.location.hash = '{route}'"));
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
            posture::calibrate_posture,
            glow::show_glow,
            glow::hide_glow
        ])
        .setup(|app| {
            // Initial menu; the webview replaces it with live status (and the
            // Pomodoro/posture actions) via `set_tray_menu` once it loads.
            let open = MenuItem::with_id(app, "show", "Open Cuewise", true, None::<&str>)?;
            let insights = MenuItem::with_id(app, "insights", "View Insights", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Cuewise", true, None::<&str>)?;
            let menu = MenuBuilder::new(app)
                .item(&open)
                .item(&insights)
                .item(&settings)
                .separator()
                .item(&quit)
                .build()?;

            // The tray is the primary way to reveal the window once it's hidden
            // (Dock reopen also does, via `RunEvent::Reopen` below), so a missing
            // bundle icon is a packaging bug worth failing loudly on rather than
            // shipping a tray-less app that's harder to rediscover.
            let icon = app
                .default_window_icon()
                .ok_or("Cuewise's tray icon is missing from the app bundle")?
                .clone();

            let _tray = TrayIconBuilder::with_id(tray::TRAY_ID)
                .icon(icon)
                .tooltip("Cuewise")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => reveal(app, None),
                    "insights" => reveal(app, Some("insights")),
                    // #settings is a deep link: home + the settings modal open.
                    "settings" => reveal(app, Some("settings")),
                    "quit" => app.exit(0),
                    // Everything else is a webview-supplied action id (set_tray_menu
                    // builds those), so relay it — the webview no-ops unknown ids.
                    id => {
                        if let Err(e) = app.emit("tray://action", id.to_string()) {
                            eprintln!("failed to relay tray action {id}: {e}");
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Hide the MAIN window to the tray instead of quitting, so the app stays
            // resident. Scoped by label: glow overlays are closed natively (glow.rs).
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let _ = window.hide();
                    api.prevent_close();
                }
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
