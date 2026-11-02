// 휴대폰: 앱을 자판 위에 보이는 영역(visual viewport)에 맞춘다.
// iOS는 자판이 올라와도 화면 높이를 줄이지 않고 페이지 전체를 위로 밀어 커서를 보여준다. 긴 메모를 스크롤한 채 입력하면
// 상단(제목줄·편집 바)이 화면 밖으로 밀려나 버튼이 하나도 안 보였다. 앱 높이를 보이는 영역에 맞추고 민 만큼 되돌려 놓으면
// 상단은 그대로 있고 편집기 안에서만 스크롤된다.

// 이보다 많이 줄면 자판이 올라온 것으로 본다 (px)
const KEYBOARD = 120

export function fitVisualViewport() {
  const vv = window.visualViewport
  if (!vv) return
  const root = document.documentElement
  root.classList.add('fit-viewport')
  const update = () => {
    root.style.setProperty('--vv-height', `${vv.height}px`)
    root.style.setProperty('--vv-top', `${vv.offsetTop}px`)
    // 자판이 올라오면 홈 표시줄 여백이 필요 없다
    root.classList.toggle('keyboard', window.innerHeight - vv.height > KEYBOARD)
  }
  vv.addEventListener('resize', update)
  vv.addEventListener('scroll', update)
  update()
}
