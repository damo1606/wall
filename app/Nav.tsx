"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "./ThemeProvider"
import { ACCIONES, ACCIONES_ALL, INSTITUCIONAL, type NavPage } from "./nav-sections"

type SearchResult = { symbol: string; name: string; exchange: string; type: string }

function NavSearch() {
  const router = useRouter()
  const [open, setOpen]       = useState(false)
  const [query, setQuery]     = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef  = useRef<HTMLInputElement>(null)
  const wrapRef   = useRef<HTMLDivElement>(null)
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef  = useRef<AbortController | null>(null)

  const close = useCallback(() => { setOpen(false); setQuery(""); setResults([]) }, [])

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close()
    }
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") close() }
    document.addEventListener("mousedown", handle)
    document.addEventListener("keydown", handleKey)
    return () => { document.removeEventListener("mousedown", handle); document.removeEventListener("keydown", handleKey) }
  }, [close])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  function handleChange(v: string) {
    setQuery(v)
    if (timerRef.current) clearTimeout(timerRef.current)
    abortRef.current?.abort()
    if (!v.trim()) { setResults([]); return }
    timerRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(v)}`, { signal: controller.signal })
        if (res.ok) setResults(await res.json())
      } catch (e) {
        if ((e as Error).name !== "AbortError") setResults([])
      } finally { setLoading(false) }
    }, 300)
  }

  function pick(symbol: string) { router.push(`/empresa/${symbol}`); close() }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800/60 transition-colors"
        title="Buscar acción"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 w-72 z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 shrink-0">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={e => handleChange(e.target.value)}
                placeholder="Símbolo o nombre..."
                className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none"
              />
              {loading && <span className="text-[10px] text-gray-600">...</span>}
            </div>
            {results.length > 0 && (
              <ul className="py-1 max-h-64 overflow-y-auto">
                {results.map(r => (
                  <li key={r.symbol}>
                    <button
                      onClick={() => pick(r.symbol)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-800/60 transition-colors text-left"
                    >
                      <span className="text-sm font-bold text-white w-16 shrink-0">{r.symbol}</span>
                      <span className="text-xs text-gray-400 truncate flex-1">{r.name}</span>
                      <span className="text-[10px] text-gray-600 shrink-0">{r.exchange}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {query.trim() && !loading && results.length === 0 && (
              <div className="px-3 py-3 text-xs text-gray-600">Sin resultados</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const ACCIONES_PREFIXES    = ACCIONES_ALL.map(p => p.href)
const INSTITUCIONAL_PREFIXES = INSTITUCIONAL.map(p => p.href)

function isInSection(path: string, prefixes: string[]) {
  return prefixes.some(p => path === p || path.startsWith(p + "/"))
}

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="11" height="11"
    viewBox="0 0 24 24"
    fill="none" stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round"
    className={`transition-transform ${open ? "rotate-180" : ""}`}
  >
    <path d="m6 9 6 6 6-6"/>
  </svg>
)

function NavDropdown({
  label,
  pages,
  active,
  pathname,
  accentActive,
  accentHover,
}: {
  label: string
  pages: NavPage[]
  active: boolean
  pathname: string
  accentActive: string
  accentHover: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
          active ? accentActive : `text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 ${accentHover}`
        }`}
      >
        {label}
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-44 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 py-1">
          {pages.map(p => {
            const isActive = pathname === p.href || pathname.startsWith(p.href + "/")
            return (
              <Link
                key={p.href}
                href={p.href}
                onClick={() => setOpen(false)}
                className={`block px-4 py-2 text-sm font-medium transition-colors ${
                  isActive ? accentActive : `text-gray-400 hover:text-gray-100 hover:bg-gray-800/60`
                }`}
              >
                {p.label}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link href={href} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
      active ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/60"
    }`}>
      {label}
    </Link>
  )
}

export function Nav() {
  const path = usePathname()
  const { theme, toggle } = useTheme()

  const inAcciones     = isInSection(path, ACCIONES_PREFIXES)
  const inInstitucional = isInSection(path, INSTITUCIONAL_PREFIXES)
  const inPortafolio   = path === "/portafolio" || path.startsWith("/portafolio/") || path === "/gex/portafolio"
  const inMacroFX      = path === "/macro-fx" || path.startsWith("/macro-fx/")

  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-6 py-2.5">
      <div className="flex gap-1 flex-wrap items-center">

        <Link href="/" className="px-3 py-1.5 rounded-lg text-sm font-black text-white mr-2 hover:bg-gray-800/60 transition-colors">
          WALL
        </Link>

        <NavDropdown
          label="Acciones"
          pages={ACCIONES}
          active={inAcciones}
          pathname={path}
          accentActive="bg-blue-900/60 text-blue-200"
          accentHover=""
        />

        <NavDropdown
          label="Institucional"
          pages={INSTITUCIONAL}
          active={inInstitucional}
          pathname={path}
          accentActive="bg-emerald-900/60 text-emerald-200"
          accentHover=""
        />

        <NavLink href="/portafolio" label="Portafolio" active={inPortafolio} />
        <NavLink href="/macro-fx"   label="Macro FX"   active={inMacroFX} />

        <NavSearch />

        <button
          onClick={toggle}
          title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          className="ml-auto p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800/60 transition-colors"
        >
          {theme === "dark" ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
            </svg>
          )}
        </button>

      </div>
    </nav>
  )
}
