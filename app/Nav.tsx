"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "./ThemeProvider"

type NavPage = { href: string; label: string }

const ACCIONES: NavPage[] = [
  { href: "/screener",     label: "Screener" },
  { href: "/valoracion",   label: "Valoración" },
  { href: "/ciclos",       label: "Ciclos" },
  { href: "/sectores",     label: "Sectores" },
  { href: "/senales",      label: "Señales" },
  { href: "/comparar",     label: "Comparar" },
  { href: "/prospectiva",  label: "Prospectiva" },
  { href: "/diario",       label: "Diario" },
  { href: "/dashboard",    label: "Dashboard" },
]

const INSTITUCIONAL: NavPage[] = [
  { href: "/gex",          label: "GEX" },
  { href: "/gamma-map",    label: "Gamma Map" },
  { href: "/scanner",      label: "Scanner" },
  { href: "/scanner-pro",  label: "Scanner Pro" },
  { href: "/rotacion",     label: "Rotación" },
]

const ACCIONES_PREFIXES    = ACCIONES.map(p => p.href)
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
