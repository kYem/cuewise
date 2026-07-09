use tauri::{
    menu::{MenuBuilder, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager,
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

/// Build and run the Cuewise desktop app: a main window plus a menu-bar tray with
/// quick actions (open, focus session, insights, quit). The tray is the always-on
/// entry point; the glanceable posture/status widget hangs off it later (ENG-36).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
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
        .run(tauri::generate_context!())
        .expect("error while running Cuewise");
}
