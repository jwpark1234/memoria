import { FONT_SIZE_LABEL, FONT_SIZES, setFontSize, useFontSize } from '../lib/fontSize'

/** 설정 메뉴의 글자 크기 줄: 5칸 슬라이더. 양끝의 작은 "가"·큰 "가"로 방향을 보여준다. */
export function FontSizeRow() {
  const size = useFontSize()
  const step = FONT_SIZES.indexOf(size)
  return (
    <label className="menu-row font-size-row">
      <span>글자</span>
      <span className="ga" style={{ fontSize: FONT_SIZES[0] }} aria-hidden>
        가
      </span>
      <input
        type="range"
        min={0}
        max={FONT_SIZES.length - 1}
        step={1}
        list="font-size-ticks"
        value={step}
        onChange={(e) => setFontSize(FONT_SIZES[Number(e.target.value)])}
        aria-valuetext={FONT_SIZE_LABEL[size]}
        title={FONT_SIZE_LABEL[size]}
      />
      <datalist id="font-size-ticks">
        {FONT_SIZES.map((_, i) => (
          <option key={i} value={i} />
        ))}
      </datalist>
      <span className="ga" style={{ fontSize: FONT_SIZES[FONT_SIZES.length - 1] }} aria-hidden>
        가
      </span>
      <span className="value">{FONT_SIZE_LABEL[size]}</span>
    </label>
  )
}
