import { FONT_SIZE_LABEL, FONT_SIZES, setFontSize, useFontSize } from '../lib/fontSize'

/** 글자 크기 고르기: 크기별 "가" */
export function FontSizePicker() {
  const size = useFontSize()
  return (
    <div className="segment font-sizes">
      {FONT_SIZES.map((s) => (
        <button
          key={s}
          className={s === size ? 'on' : ''}
          onClick={() => setFontSize(s)}
          title={FONT_SIZE_LABEL[s]}
          aria-label={`글자 ${FONT_SIZE_LABEL[s]}`}
          style={{ fontSize: s - 2 }}
        >
          가
        </button>
      ))}
    </div>
  )
}
