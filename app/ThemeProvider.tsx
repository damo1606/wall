"use client"

import { createContext, useCallback, useContext, useSyncExternalStore } from "react"

type Theme = "dark" | "light"

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
})

// ── Store externo del tema (localStorage + clase en <html>) ──────────────────
// useSyncExternalStore reemplaza el patrón "leer localStorage al montar":
// el servidor siempre ve "dark" (getServerSnapshot) y el cliente se sincroniza
// justo después de hidratar, sin setState síncrono en un efecto ni hydration
// mismatch. La clase inicial en <html> la aplica el script inline de layout.tsx.
const themeListeners = new Set<() => void>()

function subscribeTheme(cb: () => void) {
  themeListeners.add(cb)
  return () => { themeListeners.delete(cb) }
}

let themeCache: Theme | null = null

function readTheme(): Theme {
  if (themeCache === null) {
    try {
      themeCache = localStorage.getItem("theme") === "light" ? "light" : "dark"
    } catch {
      themeCache = "dark"
    }
  }
  return themeCache
}

function readThemeServer(): Theme {
  return "dark"
}

function writeTheme(next: Theme) {
  themeCache = next
  localStorage.setItem("theme", next)
  document.documentElement.classList.toggle("light", next === "light")
  themeListeners.forEach(cb => cb())
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, readThemeServer)

  const toggle = useCallback(() => {
    writeTheme(readTheme() === "dark" ? "light" : "dark")
  }, [])

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>
}

export const useTheme = () => useContext(ThemeCtx)
