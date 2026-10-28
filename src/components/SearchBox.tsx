interface Props {
  value: string
  onChange: (value: string) => void
  onClose: () => void
  placeholder?: string
}

export function SearchBox({ value, onChange, onClose, placeholder = '검색 (Esc로 닫기)' }: Props) {
  return (
    <input
      autoFocus
      className="search"
      type="search"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    />
  )
}
