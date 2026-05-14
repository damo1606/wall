// Fuente única de verdad para la navegación.
// Tanto el dropdown del Nav (app/Nav.tsx) como las cards del home (app/page.tsx)
// leen de aquí — agregar una ruta nueva en un solo lugar las sincroniza.

export type NavPage = { href: string; label: string }

export const ACCIONES: NavPage[] = [
  { href: "/screener",     label: "Screener" },
  { href: "/valoracion",   label: "Valoración" },
  { href: "/ciclos",       label: "Ciclos" },
  { href: "/sectores",     label: "Sectores" },
  { href: "/senales",      label: "Señales" },
  { href: "/comparar",     label: "Comparar" },
  { href: "/prospectiva",  label: "Prospectiva" },
  { href: "/diario",       label: "Diario" },
  { href: "/dashboard",    label: "Dashboard" },
  { href: "/cadenas",      label: "Cadenas" },
]

export const INSTITUCIONAL: NavPage[] = [
  { href: "/sore",          label: "SORE" },
  { href: "/backtest",      label: "Backtest" },
  { href: "/track-record",  label: "Track Record" },
  { href: "/gex",           label: "GEX" },
  { href: "/gamma-map",     label: "Gamma Map" },
  { href: "/scanner",       label: "Scanner" },
  { href: "/scanner-pro",   label: "Scanner Pro" },
  { href: "/rotacion",      label: "Rotación" },
  { href: "/data-quality",  label: "Data Quality" },
]

export const PORTAFOLIO: NavPage[] = [
  { href: "/portafolio",   label: "Posiciones" },
  { href: "/dashboard",    label: "Dashboard" },
  { href: "/diario",       label: "Diario" },
  { href: "/prospectiva",  label: "Prospectiva" },
]

export const MACRO_FX: NavPage[] = [
  { href: "/macro-fx",     label: "Resumen COT" },
  { href: "/ciclos",       label: "Ciclos macro" },
]
