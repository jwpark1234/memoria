mod mouse;
mod neighbor;
mod oauth;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WindowEvent,
};

fn show_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// 트레이 아이콘을 누를 때마다 위젯을 숨기거나 다시 띄운다.
fn toggle_main(app: &AppHandle) {
    let Some(win) = app.get_webview_window("main") else {
        return;
    };
    if win.is_visible().unwrap_or(false) && !win.is_minimized().unwrap_or(false) {
        let _ = win.hide();
    } else {
        show_main(app);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        // 트레이에 숨어 있을 때 앱을 또 실행하면 새로 띄우지 않고 기존 창을 보여준다.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_opener::init())
        // 새 버전 확인·설치(GitHub Releases의 latest.json)와 설치 후 재시작
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let toggle = MenuItem::with_id(app, "toggle", "열기/숨기기", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle, &quit])?;

            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().cloned().expect("앱 아이콘이 없습니다"))
                .tooltip("Memoria")
                .menu(&menu)
                .show_menu_on_left_click(false) // 왼쪽 클릭 = 열기/숨기기, 오른쪽 클릭 = 메뉴
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => toggle_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                // Linux(AppIndicator)는 클릭 이벤트가 없어서 메뉴로만 동작한다.
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_main(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        // 메인 창을 닫으면(Alt+F4 등) 종료하지 않고 트레이로 숨긴다. 종료는 트레이 메뉴에서.
        // 따로 띄운 메모 창(note-*)은 그냥 닫힌다.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() != "main" {
                    return;
                }
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![oauth::google_sign_in, neighbor::neighbor_widget_rect, mouse::mouse_left_down])
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|_app, _event| {
        // macOS: 창을 숨긴 뒤 Dock 아이콘을 누르면 다시 보여준다.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = _event {
            show_main(_app);
        }
    });
}
