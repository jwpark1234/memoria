const thisYear = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' })
const withYear = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' })

// 날짜만 표시한다. 올해면 연도는 생략 (10. 28. / 2025. 3. 4.)
export const formatDate = (ms: number) =>
  (new Date(ms).getFullYear() === new Date().getFullYear() ? thisYear : withYear).format(ms)
