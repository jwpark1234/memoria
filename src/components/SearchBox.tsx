interface Props {
  value: string
  onChange: (value: string) => void
  onClose: () => void
  placeholder?: string
  // 휴대폰 목록의 검색칸은 늘 떠 있어서 자판이 저절로 올라오지 않게 끈다
  autoFocus?: boolean
}

export function SearchBox({ value, onChange, onClose, placeholder = '검색 (Esc로 닫기)', autoFocus = true }: Props) {
  return (
    <input
      autoFocus={autoFocus}
      className="search"
      type="search"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    />
  )
}
