//! 같은 화면 귀퉁이를 쓰는 다른 위젯 창의 위치. 귀퉁이에 고정할 때 겹치지 않게 비켜 서려고 쓴다.
//! 지금은 Claude Widget(https://github.com/cksrlcks/claude-widget, Windows 전용)만 본다.

use serde::Serialize;

/// 화면 좌표(물리 px)
#[derive(Serialize)]
pub struct Rect {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

/// 다른 위젯 창이 떠 있으면 그 창이 보이는 영역, 없으면 None
#[tauri::command]
pub fn neighbor_widget_rect() -> Option<Rect> {
    find()
}

#[cfg(windows)]
fn find() -> Option<Rect> {
    use windows_sys::Win32::Foundation::RECT;
    use windows_sys::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
    use windows_sys::Win32::UI::WindowsAndMessaging::{FindWindowW, IsIconic, IsWindowVisible};

    let title: Vec<u16> = "Claude Widget\0".encode_utf16().collect();
    unsafe {
        let hwnd = FindWindowW(std::ptr::null(), title.as_ptr());
        if hwnd.is_null() || IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 {
            return None;
        }
        // GetWindowRect는 보이지 않는 테두리까지 포함하므로, 실제로 그려지는 영역을 DWM에서 받는다.
        let mut r: RECT = std::mem::zeroed();
        let ok = DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS as _,
            &mut r as *mut RECT as *mut _,
            std::mem::size_of::<RECT>() as u32,
        );
        (ok == 0).then(|| Rect { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top })
    }
}

#[cfg(not(windows))]
fn find() -> Option<Rect> {
    None
}
