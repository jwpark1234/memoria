import type { CSSProperties } from 'react'
import type { NoteColor } from '../lib/notes'

export const noteStyle = (color: NoteColor) => ({ '--note': `var(--note-${color})` }) as CSSProperties
