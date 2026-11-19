//! 같은 화면 귀퉁이를 쓰는 다른 위젯 창의 위치. 귀퉁이에 고정할 때 겹치지 않게 비켜 서려고 쓴다.
//! 지금은 Claude Widget(https://github.com/cksrlcks/claude-widget, Windows·macOS)만 본다.

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
pub fn neighbor_widget_rect(window: tauri::WebviewWindow) -> Option<Rect> {
    find(&window)
}

#[cfg(windows)]
fn find(_window: &tauri::WebviewWindow) -> Option<Rect> {
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

/// macOS: 화면에 떠 있는 창 목록에서 앱 이름이 Claude Widget인 창을 찾는다.
/// 창 제목은 화면 기록 권한이 있어야 보이지만, 앱 이름과 위치는 권한 없이 보인다.
/// 위치는 포인트(논리 px)라서 Tauri가 쓰는 물리 px로 바꾼다.
#[cfg(target_os = "macos")]
fn find(window: &tauri::WebviewWindow) -> Option<Rect> {
    use core_foundation::base::{CFType, TCFType};
    use core_foundation::dictionary::CFDictionary;
    use core_foundation::number::CFNumber;
    use core_foundation::string::CFString;
    use core_graphics::geometry::CGRect;
    use core_graphics::window::{
        copy_window_info, kCGNullWindowID, kCGWindowAlpha, kCGWindowBounds, kCGWindowLayer,
        kCGWindowListExcludeDesktopElements, kCGWindowListOptionOnScreenOnly, kCGWindowOwnerName,
    };

    // 메뉴 막대 아이콘(상태 막대 층, 25) 같은 것은 빼고, 위젯 본창(항상 위 = 띄움 층 3)을 고른다
    const STATUS_LAYER: i32 = 25;
    let scale = window.scale_factor().unwrap_or(1.0);
    let list = copy_window_info(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID)?;
    // 창 정보 사전의 키 (OS가 주는 상수)
    let (k_owner, k_layer, k_alpha, k_bounds) = unsafe {
        (
            CFString::wrap_under_get_rule(kCGWindowOwnerName),
            CFString::wrap_under_get_rule(kCGWindowLayer),
            CFString::wrap_under_get_rule(kCGWindowAlpha),
            CFString::wrap_under_get_rule(kCGWindowBounds),
        )
    };
    let mut best: Option<(i32, CGRect)> = None;
    for item in list.iter() {
        let info: CFDictionary<CFString, CFType> = unsafe { CFDictionary::wrap_under_get_rule(*item as _) };
        let owner = info.find(&k_owner).and_then(|v| v.downcast::<CFString>());
        if owner.map(|o| o.to_string()).as_deref() != Some("Claude Widget") {
            continue;
        }
        let layer = info.find(&k_layer).and_then(|v| v.downcast::<CFNumber>()).and_then(|n| n.to_i32()).unwrap_or(0);
        let alpha = info.find(&k_alpha).and_then(|v| v.downcast::<CFNumber>()).and_then(|n| n.to_f64()).unwrap_or(1.0);
        let bounds = info
            .find(&k_bounds)
            .and_then(|v| v.downcast::<CFDictionary>())
            .and_then(|d| CGRect::from_dict_representation(&d));
        let Some(bounds) = bounds else { continue };
        if layer >= STATUS_LAYER || alpha <= 0.0 || bounds.size.width < 1.0 || bounds.size.height < 1.0 {
            continue;
        }
        // 목록은 앞에 있는 창부터다. 층이 더 높은 창(항상 위)이 있으면 그것을 고른다
        if best.as_ref().map_or(true, |(l, _)| layer > *l) {
            best = Some((layer, bounds));
        }
    }
    let (_, r) = best?;
    let px = |v: f64| (v * scale).round() as i32;
    Some(Rect { x: px(r.origin.x), y: px(r.origin.y), width: px(r.size.width), height: px(r.size.height) })
}

#[cfg(not(any(windows, target_os = "macos")))]
fn find(_window: &tauri::WebviewWindow) -> Option<Rect> {
    None
}
