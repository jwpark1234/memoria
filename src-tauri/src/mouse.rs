//! 창 끌기가 끝났는지(왼쪽 버튼을 놓았는지) 확인한다. OS가 창 끌기를 맡는 동안 웹뷰는 마우스를 놓는 것을 못 본다.

#[tauri::command]
pub fn mouse_left_down() -> bool {
    pressed()
}

#[cfg(windows)]
fn pressed() -> bool {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
    unsafe { GetAsyncKeyState(VK_LBUTTON as i32) as u16 & 0x8000 != 0 }
}

// 다른 OS는 알 수 없으니 놓은 것으로 본다 (창이 멈추면 끌기가 끝난 것으로 처리)
#[cfg(not(windows))]
fn pressed() -> bool {
    false
}
