export type BoardThemeId = 'green' | 'wood' | 'blue' | 'slate'

export type BoardPalette = { id: BoardThemeId; label: string; light: string; dark: string }

export const BOARD_THEMES: BoardPalette[] = [
  { id: 'green', label: 'Green', light: '#eeeed2', dark: '#769656' },
  { id: 'wood', label: 'Wood', light: '#f0d9b5', dark: '#b58863' },
  { id: 'blue', label: 'Blue', light: '#dee3e6', dark: '#8ca2ad' },
  { id: 'slate', label: 'Slate', light: '#d9dde3', dark: '#6f7d8c' }
]

export const DEFAULT_BOARD_THEME: BoardThemeId = 'green'

export function normalizeBoardTheme(value: unknown): BoardThemeId {
  return BOARD_THEMES.some((theme) => theme.id === value) ? (value as BoardThemeId) : DEFAULT_BOARD_THEME
}
