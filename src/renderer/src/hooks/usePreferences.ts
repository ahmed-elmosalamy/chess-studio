import { useCallback, useEffect, useState } from 'react'
import { normalizeBoardTheme, type BoardThemeId } from '../components/board/boardThemes.ts'
import { parseRailPreference } from '../ui/layout.ts'

export type Theme = 'dark' | 'light'

const THEME_KEY = 'studio.theme'
const SOUND_KEY = 'studio.sound'
const BOARD_KEY = 'studio.boardTheme'
const COORDS_KEY = 'studio.coords'
const RAIL_KEY = 'studio.rail'

function readTheme(): Theme {
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
}

function readBoardTheme(): BoardThemeId {
  return normalizeBoardTheme(localStorage.getItem(BOARD_KEY))
}

function readCoordinates(): boolean {
  return localStorage.getItem(COORDS_KEY) !== 'off'
}

export function usePreferences(): {
  theme: Theme
  soundEnabled: boolean
  boardTheme: BoardThemeId
  showCoordinates: boolean
  railOpen: boolean
  toggleTheme: () => void
  toggleSound: () => void
  setBoardTheme: (theme: BoardThemeId) => void
  toggleCoordinates: () => void
  toggleRail: () => void
} {
  const [theme, setTheme] = useState<Theme>(readTheme)
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => localStorage.getItem(SOUND_KEY) !== 'off')
  const [boardTheme, setBoardThemeState] = useState<BoardThemeId>(readBoardTheme)
  const [showCoordinates, setShowCoordinates] = useState<boolean>(readCoordinates)
  const [railOpen, setRailOpen] = useState<boolean>(() => parseRailPreference(localStorage.getItem(RAIL_KEY)))

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.board = boardTheme
    localStorage.setItem(BOARD_KEY, boardTheme)
  }, [boardTheme])

  useEffect(() => {
    localStorage.setItem(SOUND_KEY, soundEnabled ? 'on' : 'off')
  }, [soundEnabled])

  useEffect(() => {
    localStorage.setItem(COORDS_KEY, showCoordinates ? 'on' : 'off')
  }, [showCoordinates])

  useEffect(() => {
    localStorage.setItem(RAIL_KEY, railOpen ? 'open' : 'closed')
  }, [railOpen])

  const toggleTheme = useCallback(() => setTheme((current) => (current === 'dark' ? 'light' : 'dark')), [])
  const toggleSound = useCallback(() => setSoundEnabled((current) => !current), [])
  const setBoardTheme = useCallback((next: BoardThemeId) => setBoardThemeState(normalizeBoardTheme(next)), [])
  const toggleCoordinates = useCallback(() => setShowCoordinates((current) => !current), [])
  const toggleRail = useCallback(() => setRailOpen((current) => !current), [])

  return { theme, soundEnabled, boardTheme, showCoordinates, railOpen, toggleTheme, toggleSound, setBoardTheme, toggleCoordinates, toggleRail }
}
