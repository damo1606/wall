import Link from "next/link"

const SECTIONS = [
  {
    title: "Acciones",
    description: "Valoración fundamental con scoring por sector y ciclo macroeconómico. Encuentra empresas de calidad a descuento.",
    href: "/screener",
    cta: "→ Screener",
    sublinks: [
      { href: "/screener",     label: "Screener" },
      { href: "/valoracion",   label: "Valoración" },
      { href: "/ciclos",       label: "Ciclos" },
      { href: "/sectores",     label: "Sectores" },
      { href: "/senales",      label: "Señales" },
      { href: "/comparar",     label: "Comparar" },
    ],
    accent: "blue",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
        <polyline points="16 7 22 7 22 13"/>
      </svg>
    ),
  },
  {
    title: "Institucional",
    description: "Exposición gamma (GEX), flujo de dealers y soportes/resistencias opcionales en 7 metodologías M1–M7.",
    href: "/gex",
    cta: "→ GEX",
    sublinks: [
      { href: "/gex",          label: "GEX" },
      { href: "/gamma-map",    label: "Gamma Map" },
      { href: "/scanner",      label: "Scanner" },
      { href: "/scanner-pro",  label: "Scanner Pro" },
      { href: "/rotacion",     label: "Rotación" },
    ],
    accent: "emerald",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/>
        <path d="M8 21h8M12 17v4"/>
        <path d="M7 8h2v5H7zM11 10h2v3h-2zM15 6h2v7h-2z"/>
      </svg>
    ),
  },
  {
    title: "Portafolio",
    description: "Seguimiento de posiciones, balance por activo y alertas de precio en tiempo real.",
    href: "/portafolio",
    cta: "→ Portafolio",
    sublinks: [
      { href: "/portafolio",   label: "Posiciones" },
      { href: "/dashboard",    label: "Dashboard" },
      { href: "/diario",       label: "Diario" },
      { href: "/prospectiva",  label: "Prospectiva" },
    ],
    accent: "violet",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2"/>
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
        <line x1="12" y1="12" x2="12" y2="16"/>
        <line x1="10" y1="14" x2="14" y2="14"/>
      </svg>
    ),
  },
  {
    title: "Macro FX",
    description: "Análisis forex con COT (Commitment of Traders) y datos macroeconómicos FRED de la Reserva Federal.",
    href: "/macro-fx",
    cta: "→ Macro FX",
    sublinks: [
      { href: "/macro-fx",     label: "Resumen COT" },
      { href: "/ciclos",       label: "Ciclos macro" },
    ],
    accent: "amber",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    ),
  },
]

const ACCENT_STYLES = {
  blue:    { card: "border-blue-900 hover:border-blue-700",       icon: "text-blue-400 bg-blue-950",    title: "text-blue-300",   sub: "text-blue-600 hover:text-blue-300", btn: "bg-blue-700 hover:bg-blue-600 text-white" },
  emerald: { card: "border-emerald-900 hover:border-emerald-700", icon: "text-emerald-400 bg-emerald-950", title: "text-emerald-300", sub: "text-emerald-700 hover:text-emerald-400", btn: "bg-emerald-700 hover:bg-emerald-600 text-white" },
  violet:  { card: "border-violet-900 hover:border-violet-700",   icon: "text-violet-400 bg-violet-950",  title: "text-violet-300",  sub: "text-violet-600 hover:text-violet-300", btn: "bg-violet-700 hover:bg-violet-600 text-white" },
  amber:   { card: "border-amber-900 hover:border-amber-700",     icon: "text-amber-400 bg-amber-950",   title: "text-amber-300",   sub: "text-amber-600 hover:text-amber-300", btn: "bg-amber-700 hover:bg-amber-600 text-white" },
}

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-5xl mx-auto px-6 py-16">

        <div className="mb-14 text-center">
          <h1 className="text-5xl font-black text-white tracking-tight">Wall</h1>
          <p className="text-gray-500 mt-3 text-lg">Plataforma de análisis de inversiones</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {SECTIONS.map(s => {
            const a = ACCENT_STYLES[s.accent as keyof typeof ACCENT_STYLES]
            return (
              <div key={s.title} className={`bg-gray-900 border rounded-2xl p-8 transition-colors flex flex-col ${a.card}`}>

                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl mb-5 ${a.icon}`}>
                  {s.icon}
                </div>

                <h2 className={`text-xl font-black mb-2 ${a.title}`}>{s.title}</h2>
                <p className="text-gray-400 text-sm leading-relaxed mb-6">{s.description}</p>

                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-8">
                  {s.sublinks.map(l => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className={`text-xs font-medium transition-colors ${a.sub}`}
                    >
                      {l.label}
                    </Link>
                  ))}
                </div>

                <div className="mt-auto">
                  <Link href={s.href} className={`inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-bold transition-colors ${a.btn}`}>
                    {s.cta}
                  </Link>
                </div>

              </div>
            )
          })}
        </div>

      </div>
    </main>
  )
}
