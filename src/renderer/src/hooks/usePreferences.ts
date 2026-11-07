import { useCallback, useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'

const THEME_KEY = 'studio.theme'
const SOUND_KEY = 'studio.sound'

function readTheme(): Theme {
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
}

export function usePreferences(): {
  theme: Theme
  soundEnabled: boolean
  toggleTheme: () => void
  toggleSound: () => void
} {
  const [theme, setTheme] = useState<Theme>(readTheme)
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => localStorage.getItem(SOUND_KEY) !== 'off')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem(SOUND_KEY, soundEnabled ? 'on' : 'off')
  }, [soundEnabled])

  const toggleTheme = useCallback(() => setTheme((current) => (current === 'dark' ? 'light' : 'dark')), [])
  const toggleSound = useCallback(() => setSoundEnabled((current) => !current), [])

  return { theme, soundEnabled, toggleTheme, toggleSound }
}
