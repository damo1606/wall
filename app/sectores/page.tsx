"use client"

import { useState, useEffect } from "react"

type EtfData = {
  symbol: string; sector: string; name: string
  currentPrice: number; change1d: number | null
  change52w: number | null; ytdReturn: number | null
}

// Mapeo key de sector → sector Yahoo Finance para buscar el ETF
const ETF_MAP: Record<string, string> = {
  tech:          "Technology",
  financials:    "Financial Services",
  healthcare:    "Healthcare",
  discretionary: "Consumer Discretionary",
  staples:       "Consumer Staples",
  industrials:   "Industrials",
  comms:         "Communication Services",
  energy:        "Energy",
  utilities:     "Utilities",
  realestate:    "Real Estate",
  materials:     "Basic Materials",
}

// Símbolo del ETF de referencia por sector
const ETF_SYMBOL: Record<string, string> = {
  tech: "XLK", financials: "XLF", healthcare: "XLV",
  discretionary: "XLY", staples: "XLP", industrials: "XLI",
  comms: "XLC", energy: "XLE", utilities: "XLU",
  realestate: "XLRE", materials: "XLB",
}

type Company = { symbol: string; name: string; weight: number }

type SectorInfo = {
  key: string
  name: string
  emoji: string
  spWeight: number        // % del S&P 500
  description: string
  moatType: string
  capRange: string
  keyMetrics: { label: string; why: string }[]
  topCompanies: Company[]
  risks: string[]
}

const SECTORS: SectorInfo[] = [
  {
    key: "tech",
    name: "Tecnología",
    emoji: "💻",
    spWeight: 31,
    description: "El sector más grande del S&P 500. Domina el índice con empresas de software, semiconductores y hardware. Sus negocios son asset-light — generan márgenes extraordinarios porque el costo marginal de replicar software es casi cero.",
    moatType: "Switching costs + Network effects",
    capRange: "10–20 años",
    keyMetrics: [
      { label: "ROIC", why: "El driver principal — software requiere poco capital para crecer" },
      { label: "Gross Margin", why: "> 65% indica pricing power real y modelo escalable" },
      { label: "FCF Margin", why: "Cuánto cash real queda después de operar — debe ser > 20%" },
      { label: "Rule of 40", why: "Revenue growth + FCF margin > 40% = SaaS saludable" },
      { label: "R&D / Revenue", why: "Inversión en innovación — bajo = cosechando, alto = construyendo" },
    ],
    topCompanies: [
      { symbol: "AAPL",  name: "Apple",             weight: 7.0 },
      { symbol: "MSFT",  name: "Microsoft",          weight: 6.5 },
      { symbol: "NVDA",  name: "Nvidia",             weight: 5.5 },
      { symbol: "AVGO",  name: "Broadcom",           weight: 1.5 },
      { symbol: "CRM",   name: "Salesforce",         weight: 0.7 },
      { symbol: "ADBE",  name: "Adobe",              weight: 0.6 },
      { symbol: "AMD",   name: "AMD",                weight: 0.6 },
      { symbol: "QCOM",  name: "Qualcomm",           weight: 0.5 },
      { symbol: "TXN",   name: "Texas Instruments",  weight: 0.5 },
      { symbol: "INTU",  name: "Intuit",             weight: 0.5 },
    ],
    risks: ["Disrupción por IA generativa", "Regulación antimonopolio", "Ciclos de semiconductores"],
  },
  {
    key: "financials",
    name: "Servicios Financieros",
    emoji: "🏦",
    spWeight: 13,
    description: "Bancos, aseguradoras, gestoras de activos y procesadores de pago. Su moat viene de la escala, la regulación que bloquea nuevos entrantes, y la red de distribución construida en décadas. Gross margin no aplica — se usan métricas propias del sector.",
    moatType: "Escala + Regulación + Red de distribución",
    capRange: "10–20 años",
    keyMetrics: [
      { label: "ROE",            why: "La métrica principal en bancos — > 12% es bueno, > 18% excepcional" },
      { label: "ROA",            why: "< 1% normal en bancos, > 1.5% muy bueno (sin trampa de apalancamiento)" },
      { label: "P/Book",         why: "Bancos se valoran vs su valor en libros — < 1.5x = razonable" },
      { label: "Eficiencia",     why: "Gastos / ingresos — < 55% = banco bien gestionado" },
      { label: "Net Margin",     why: "Sustituto del gross margin — > 20% indica solidez operativa" },
    ],
    topCompanies: [
      { symbol: "BRK-B", name: "Berkshire Hathaway", weight: 1.8 },
      { symbol: "JPM",   name: "JPMorgan Chase",     weight: 1.5 },
      { symbol: "V",     name: "Visa",               weight: 1.2 },
      { symbol: "MA",    name: "Mastercard",         weight: 0.9 },
      { symbol: "BAC",   name: "Bank of America",    weight: 0.7 },
      { symbol: "WFC",   name: "Wells Fargo",        weight: 0.6 },
      { symbol: "GS",    name: "Goldman Sachs",      weight: 0.5 },
      { symbol: "MS",    name: "Morgan Stanley",     weight: 0.4 },
      { symbol: "BLK",   name: "BlackRock",          weight: 0.4 },
      { symbol: "AXP",   name: "American Express",   weight: 0.4 },
    ],
    risks: ["Ciclos de crédito", "Tasas de interés", "Regulación creciente post-crisis"],
  },
  {
    key: "healthcare",
    name: "Salud / Biotech",
    emoji: "🧬",
    spWeight: 12,
    description: "Farmacéuticas, biotecnología, dispositivos médicos y aseguradoras de salud. El moat más poderoso del sector es la patente — exclusividad legal sobre un medicamento durante 7–20 años. Después del vencimiento, los genéricos destruyen el precio.",
    moatType: "Patentes + Aprobación regulatoria (FDA/EMA)",
    capRange: "7–20 años (vida de patente)",
    keyMetrics: [
      { label: "Gross Margin",   why: "Farma > 65% protegida por patente. Genéricos caen a 30-40%" },
      { label: "R&D / Revenue",  why: "Pipeline futuro — bajo R&D = cosechando patentes existentes" },
      { label: "Operating Margin", why: "> 20% indica ventaja competitiva real más allá de la patente" },
      { label: "ROIC",           why: "Mide si la inversión en I+D genera retornos superiores al capital" },
      { label: "P/E Forward",    why: "Se valora por earnings futuros del pipeline, no del pasado" },
    ],
    topCompanies: [
      { symbol: "LLY",   name: "Eli Lilly",        weight: 1.5 },
      { symbol: "UNH",   name: "UnitedHealth",     weight: 1.4 },
      { symbol: "JNJ",   name: "Johnson & Johnson", weight: 0.9 },
      { symbol: "ABBV",  name: "AbbVie",           weight: 0.8 },
      { symbol: "MRK",   name: "Merck",            weight: 0.7 },
      { symbol: "TMO",   name: "Thermo Fisher",    weight: 0.6 },
      { symbol: "ABT",   name: "Abbott Labs",      weight: 0.5 },
      { symbol: "DHR",   name: "Danaher",          weight: 0.5 },
      { symbol: "AMGN",  name: "Amgen",            weight: 0.4 },
      { symbol: "PFE",   name: "Pfizer",           weight: 0.4 },
    ],
    risks: ["Vencimiento de patentes (patent cliff)", "Fracasos en FDA", "Control de precios gubernamental"],
  },
  {
    key: "discretionary",
    name: "Consumo Discrecional",
    emoji: "🛍️",
    spWeight: 11,
    description: "Empresas cuyos productos los consumidores compran cuando tienen dinero extra — autos, ropa, restaurantes, viajes, retail no esencial. Muy sensible al ciclo económico. El moat viene de la marca y la experiencia del cliente, no de patentes.",
    moatType: "Marca + Experiencia del cliente + Efectos de red",
    capRange: "5–15 años",
    keyMetrics: [
      { label: "Gross Margin",     why: "Mide el poder de la marca — marcas premium tienen > 45%" },
      { label: "Revenue Growth",   why: "Sector cíclico — crecer en recesión es señal de moat real" },
      { label: "Operating Margin", why: "Eficiencia operativa — retailers eficientes > 10%" },
      { label: "ROIC",             why: "Especialmente importante — capital intensivo en retail físico" },
      { label: "FCF Yield",        why: "Cuánto cash genera vs lo que pagas — > 5% es atractivo" },
    ],
    topCompanies: [
      { symbol: "AMZN",  name: "Amazon",            weight: 3.5 },
      { symbol: "TSLA",  name: "Tesla",             weight: 1.5 },
      { symbol: "HD",    name: "Home Depot",        weight: 0.8 },
      { symbol: "MCD",   name: "McDonald's",        weight: 0.5 },
      { symbol: "BKNG",  name: "Booking Holdings",  weight: 0.4 },
      { symbol: "NKE",   name: "Nike",              weight: 0.4 },
      { symbol: "TJX",   name: "TJX Companies",     weight: 0.4 },
      { symbol: "LOW",   name: "Lowe's",            weight: 0.4 },
      { symbol: "SBUX",  name: "Starbucks",         weight: 0.3 },
      { symbol: "ORLY",  name: "O'Reilly Auto",     weight: 0.3 },
    ],
    risks: ["Recesiones económicas", "Competencia e-commerce", "Cambio en hábitos del consumidor"],
  },
  {
    key: "comms",
    name: "Comunicaciones",
    emoji: "📡",
    spWeight: 9,
    description: "Medios digitales, redes sociales, streaming, telecomunicaciones y videojuegos. Google y Meta dominan el sector. Sus moats vienen de efectos de red masivos — cuantos más usuarios, más valioso el producto, más difícil de replicar.",
    moatType: "Network effects + Switching costs + Contenido exclusivo",
    capRange: "10–25 años",
    keyMetrics: [
      { label: "Gross Margin",      why: "> 55% en plataformas digitales — costo marginal casi cero" },
      { label: "ROIC",              why: "Google/Meta generan ROIC > 25% — negocios asset-light puros" },
      { label: "Revenue Growth",    why: "Network effects = crecimiento acelerado cuando la red madura" },
      { label: "Operating Margin",  why: "> 25% indica ventaja competitiva sostenida en plataforma" },
      { label: "FCF Margin",        why: "Plataformas maduras deben generar > 25% FCF margin" },
    ],
    topCompanies: [
      { symbol: "GOOGL", name: "Alphabet (Clase A)",  weight: 2.0 },
      { symbol: "META",  name: "Meta Platforms",      weight: 2.5 },
      { symbol: "GOOG",  name: "Alphabet (Clase C)",  weight: 1.8 },
      { symbol: "NFLX",  name: "Netflix",             weight: 0.8 },
      { symbol: "TMUS",  name: "T-Mobile",            weight: 0.4 },
      { symbol: "DIS",   name: "Walt Disney",         weight: 0.4 },
      { symbol: "CMCSA", name: "Comcast",             weight: 0.4 },
      { symbol: "VZ",    name: "Verizon",             weight: 0.3 },
      { symbol: "T",     name: "AT&T",                weight: 0.3 },
      { symbol: "CHTR",  name: "Charter Communications", weight: 0.2 },
    ],
    risks: ["Regulación de plataformas", "IA generativa vs publicidad", "Saturación de streaming"],
  },
  {
    key: "industrials",
    name: "Industrial",
    emoji: "⚙️",
    spWeight: 8,
    description: "Manufactura, defensa, aeroespacial, logística y maquinaria. Negocios intensivos en capital con ciclos largos. El moat viene de la escala operativa, contratos a largo plazo y la complejidad de replicar procesos industriales acumulados en décadas.",
    moatType: "Cost advantage + Escala + Contratos a largo plazo",
    capRange: "5–15 años",
    keyMetrics: [
      { label: "ROIC",              why: "El driver clave — debe superar el costo de capital (~8-10%)" },
      { label: "Operating Margin",  why: "> 12% excelente para industrial — escala y eficiencia operativa" },
      { label: "Asset Turnover",    why: "Revenue / Activos — eficiencia en usar activos intensivos" },
      { label: "Deuda/EBITDA",      why: "Negocios cíclicos no deben tener deuda > 2.5x EBITDA" },
      { label: "Backlog",           why: "Órdenes futuras confirmadas — visibilidad de ingresos 1-3 años" },
    ],
    topCompanies: [
      { symbol: "GE",    name: "GE Aerospace",      weight: 0.6 },
      { symbol: "ETN",   name: "Eaton",             weight: 0.4 },
      { symbol: "CAT",   name: "Caterpillar",       weight: 0.5 },
      { symbol: "HON",   name: "Honeywell",         weight: 0.5 },
      { symbol: "RTX",   name: "Raytheon Technologies", weight: 0.4 },
      { symbol: "LMT",   name: "Lockheed Martin",   weight: 0.4 },
      { symbol: "DE",    name: "Deere & Company",   weight: 0.3 },
      { symbol: "UPS",   name: "UPS",               weight: 0.3 },
      { symbol: "BA",    name: "Boeing",            weight: 0.3 },
      { symbol: "PH",    name: "Parker Hannifin",   weight: 0.3 },
    ],
    risks: ["Ciclos económicos", "Costos de materias primas", "Disrupción por automatización"],
  },
  {
    key: "staples",
    name: "Consumo Básico",
    emoji: "🛒",
    spWeight: 6,
    description: "Productos que se compran siempre — comida, bebidas, cuidado personal, tabaco. La demanda es inelástica: en recesión los consumidores reducen gastos discrecionales, pero siguen comprando Coca-Cola y Tide. CAP extraordinariamente largo por el hábito del consumidor.",
    moatType: "Marca + Distribución masiva + Hábito del consumidor",
    capRange: "20–50 años",
    keyMetrics: [
      { label: "Gross Margin",      why: "Indica pricing power de la marca — > 40% excelente en sector" },
      { label: "Dividend Growth",   why: "Sector conocido por dividendos crecientes sostenidos décadas" },
      { label: "FCF Margin",        why: "Negocios maduros deben generar FCF abundante y predecible" },
      { label: "Deuda/EBITDA",      why: "< 2x conservador — deuda alta en sector estable = riesgo" },
      { label: "Revenue estabilidad", why: "Crecimiento bajo pero predecible vale más que crecimiento volátil" },
    ],
    topCompanies: [
      { symbol: "WMT",   name: "Walmart",           weight: 1.0 },
      { symbol: "COST",  name: "Costco",            weight: 0.9 },
      { symbol: "PG",    name: "Procter & Gamble",  weight: 0.8 },
      { symbol: "KO",    name: "Coca-Cola",         weight: 0.6 },
      { symbol: "PEP",   name: "PepsiCo",           weight: 0.5 },
      { symbol: "PM",    name: "Philip Morris",     weight: 0.4 },
      { symbol: "MDLZ",  name: "Mondelez",          weight: 0.2 },
      { symbol: "CL",    name: "Colgate-Palmolive", weight: 0.2 },
      { symbol: "STZ",   name: "Constellation Brands", weight: 0.2 },
      { symbol: "GIS",   name: "General Mills",     weight: 0.1 },
    ],
    risks: ["Inflación de materias primas", "Presión de marcas blancas", "Cambio hacia productos saludables"],
  },
  {
    key: "energy",
    name: "Energía",
    emoji: "⛽",
    spWeight: 4,
    description: "Petróleo, gas natural y energías alternativas. El negocio es inherentemente cíclico — el precio del commodity determina los márgenes más que la gestión. El moat real está en quién tiene los recursos más baratos de extraer (costo de producción más bajo).",
    moatType: "Recursos naturales + Integración vertical + Escala",
    capRange: "Variable — ciclo commodity",
    keyMetrics: [
      { label: "FCF a precio normalizado", why: "FCF en ciclo medio de petróleo (~$65/barril), no en pico" },
      { label: "Deuda/EBITDA",    why: "Sector cíclico — deuda alta en precio bajo = quiebra" },
      { label: "Breakeven",       why: "A qué precio de barril genera FCF positivo — < $45 es excelente" },
      { label: "Dividend Coverage", why: "¿Puede mantener el dividendo con petróleo a $50?" },
      { label: "ROIC normalizado", why: "ROIC en ciclo medio — no en pico de precios" },
    ],
    topCompanies: [
      { symbol: "XOM",   name: "ExxonMobil",          weight: 1.2 },
      { symbol: "CVX",   name: "Chevron",             weight: 0.7 },
      { symbol: "COP",   name: "ConocoPhillips",      weight: 0.4 },
      { symbol: "EOG",   name: "EOG Resources",       weight: 0.3 },
      { symbol: "SLB",   name: "SLB (Schlumberger)",  weight: 0.2 },
      { symbol: "MPC",   name: "Marathon Petroleum",  weight: 0.2 },
      { symbol: "PSX",   name: "Phillips 66",         weight: 0.2 },
      { symbol: "VLO",   name: "Valero Energy",       weight: 0.2 },
      { symbol: "OXY",   name: "Occidental Petroleum", weight: 0.2 },
      { symbol: "HES",   name: "Hess Corporation",    weight: 0.1 },
    ],
    risks: ["Transición energética", "Volatilidad del precio del barril", "Regulación ambiental"],
  },
  {
    key: "utilities",
    name: "Utilities",
    emoji: "⚡",
    spWeight: 2.5,
    description: "Electricidad, gas y agua distribuidos bajo concesión regulada. El Estado les garantiza un monopolio local a cambio de tarifas controladas. ROIC estructuralmente bajo por activos intensivos, pero flujos extremadamente predecibles y dividendos estables.",
    moatType: "Efficient scale + Concesión regulada por el Estado",
    capRange: "20–40 años (duración de la concesión)",
    keyMetrics: [
      { label: "Dividend Coverage",  why: "FCF / dividendo — debe ser > 1.3x para ser sostenible" },
      { label: "Deuda/EBITDA",       why: "Sector intensivo — < 4x aceptable, > 6x peligroso" },
      { label: "Rate Base Growth",   why: "Crecimiento de la base tarifaria regulada — proxy del crecimiento" },
      { label: "Operating Margin",   why: "> 20% en utilities reguladas indica gestión eficiente" },
      { label: "Dividend Yield",     why: "Se comporta como bono — se compara vs tasa libre de riesgo" },
    ],
    topCompanies: [
      { symbol: "NEE",   name: "NextEra Energy",            weight: 0.6 },
      { symbol: "SO",    name: "Southern Company",          weight: 0.3 },
      { symbol: "DUK",   name: "Duke Energy",               weight: 0.3 },
      { symbol: "SRE",   name: "Sempra",                    weight: 0.2 },
      { symbol: "AEP",   name: "American Electric Power",   weight: 0.2 },
      { symbol: "EXC",   name: "Exelon",                    weight: 0.2 },
      { symbol: "PCG",   name: "PG&E",                      weight: 0.1 },
      { symbol: "XEL",   name: "Xcel Energy",               weight: 0.1 },
      { symbol: "WEC",   name: "WEC Energy Group",          weight: 0.1 },
      { symbol: "ED",    name: "Consolidated Edison",       weight: 0.1 },
    ],
    risks: ["Subida de tasas (compiten con bonos)", "Inversión masiva en renovables", "Riesgo regulatorio tarifario"],
  },
  {
    key: "realestate",
    name: "Inmobiliario",
    emoji: "🏢",
    spWeight: 2.5,
    description: "REITs (Real Estate Investment Trusts) — vehículos obligados por ley a distribuir el 90% de sus ingresos como dividendos. Su valor viene de la ubicación, los contratos de arrendamiento a largo plazo y la dificultad de replicar activos físicos premium.",
    moatType: "Ubicación + Contratos de arrendamiento + Escala",
    capRange: "15–30 años",
    keyMetrics: [
      { label: "FFO (Funds from Operations)", why: "El equivalente al FCF en REITs — más preciso que el EPS" },
      { label: "Dividend Yield",  why: "Obligados a pagar 90% de ingresos — yield > 4% típico" },
      { label: "Deuda/EBITDA",    why: "REITs usan mucho apalancamiento — < 6x es conservador" },
      { label: "Occupancy Rate",  why: "Tasa de ocupación > 95% indica activos de alta calidad" },
      { label: "P/FFO",           why: "Equivalente al P/E para REITs — < 15x es razonable" },
    ],
    topCompanies: [
      { symbol: "PLD",   name: "Prologis",            weight: 0.3 },
      { symbol: "AMT",   name: "American Tower",      weight: 0.3 },
      { symbol: "EQIX",  name: "Equinix",             weight: 0.3 },
      { symbol: "WELL",  name: "Welltower",           weight: 0.2 },
      { symbol: "SPG",   name: "Simon Property Group", weight: 0.2 },
      { symbol: "CCI",   name: "Crown Castle",        weight: 0.2 },
      { symbol: "PSA",   name: "Public Storage",      weight: 0.2 },
      { symbol: "O",     name: "Realty Income",       weight: 0.2 },
      { symbol: "DLR",   name: "Digital Realty",      weight: 0.1 },
      { symbol: "SBAC",  name: "SBA Communications",  weight: 0.1 },
    ],
    risks: ["Subida de tasas de interés", "Vacancia en oficinas post-COVID", "Refinanciamiento de deuda"],
  },
  {
    key: "materials",
    name: "Materiales",
    emoji: "⛏️",
    spWeight: 2.5,
    description: "Químicos, metales, minería y materiales de construcción. Negocios altamente cíclicos y sensibles al precio de los commodities. El moat real es acceso privilegiado a recursos naturales o tecnología química que no puede replicarse fácilmente.",
    moatType: "Cost advantage + Acceso a recursos + Tecnología química",
    capRange: "Variable — ciclo commodity",
    keyMetrics: [
      { label: "ROIC normalizado", why: "ROIC en ciclo medio — no en pico de precios de commodities" },
      { label: "Gross Margin",     why: "Químicos especializados > 35% indica diferenciación real" },
      { label: "Deuda/EBITDA",     why: "Sector cíclico — deuda > 3x es peligrosa en contracción" },
      { label: "Operating Margin", why: "> 15% en materiales es excelente — indica diferenciación" },
      { label: "FCF a ciclo medio", why: "¿Genera FCF positivo cuando el commodity está bajo?" },
    ],
    topCompanies: [
      { symbol: "LIN",   name: "Linde",               weight: 0.5 },
      { symbol: "SHW",   name: "Sherwin-Williams",     weight: 0.3 },
      { symbol: "APD",   name: "Air Products",         weight: 0.2 },
      { symbol: "ECL",   name: "Ecolab",               weight: 0.2 },
      { symbol: "FCX",   name: "Freeport-McMoRan",     weight: 0.2 },
      { symbol: "NUE",   name: "Nucor",                weight: 0.1 },
      { symbol: "PPG",   name: "PPG Industries",       weight: 0.1 },
      { symbol: "NEM",   name: "Newmont",              weight: 0.1 },
      { symbol: "DOW",   name: "Dow Inc.",             weight: 0.1 },
      { symbol: "ALB",   name: "Albemarle",            weight: 0.1 },
    ],
    risks: ["Ciclo global de commodities", "China como mayor consumidor", "Regulación ambiental en minería"],
  },
]

function WeightBar({ value, max = 35 }: { value: number; max?: number }) {
  return (
    <div className="w-full bg-gray-800 rounded-full h-1.5">
      <div
        className="h-1.5 rounded-full bg-blue-500"
        style={{ width: `${(value / max) * 100}%` }}
      />
    </div>
  )
}

function pct(v: number | null) {
  if (v === null) return "—"
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`
}
function pctColor(v: number | null) {
  if (v === null) return "text-gray-600"
  if (v >= 15)   return "text-emerald-400"
  if (v >= 5)    return "text-green-400"
  if (v >= 0)    return "text-yellow-400"
  if (v >= -10)  return "text-orange-400"
  return "text-red-400"
}
function interpretation(change52w: number | null, ytd: number | null): string {
  if (change52w === null) return "Sin datos disponibles."
  if (change52w >= 25)  return "Sector en tendencia alcista fuerte — el mercado lo está priorizando."
  if (change52w >= 10)  return "Rendimiento sólido en los últimos 12 meses — por encima del promedio."
  if (change52w >= 0)   return "Rendimiento positivo moderado — en línea con el mercado."
  if (change52w >= -10) return "Ligera caída — posible consolidación o rotación saliente."
  if (change52w >= -20) return "Sector bajo presión — flujos saliendo hacia otros sectores."
  return "Sector en corrección significativa — posible oportunidad o deterioro estructural."
}

export default function Sectores() {
  const [active, setActive] = useState("tech")
  const [etfs,   setEtfs]   = useState<EtfData[]>([])
  const [loading, setLoading] = useState(true)
  const [etfError, setEtfError] = useState(false)

  function fetchEtfs() {
    setLoading(true)
    setEtfError(false)
    fetch("/api/sectors-etf")
      .then(r => r.json())
      .then(d => { if (d?.etfs) setEtfs(d.etfs); else setEtfError(true) })
      .catch(() => setEtfError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchEtfs() }, [])

  const sector  = SECTORS.find(s => s.key === active)!
  const etfData = etfs.find(e => e.sector === ETF_MAP[active]) ?? null

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">

      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-5">
        <div className="max-w-6xl mx-auto flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Sectores del S&P 500</h1>
            <p className="text-gray-400 text-sm mt-1">11 sectores GICS — métricas clave, tipo de moat, CAP y empresas principales</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {SECTORS.map(s => {
            const etf = etfs.find(e => e.sector === ETF_MAP[s.key])
            const c52 = etf?.change52w ?? null
            return (
              <button
                key={s.key}
                onClick={() => setActive(s.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  active === s.key
                    ? "bg-blue-600 text-white"
                    : "bg-gray-900 text-gray-400 hover:text-gray-200 border border-gray-800"
                }`}
              >
                <span>{s.emoji}</span>
                <span>{s.name}</span>
                {c52 !== null ? (
                  <span className={`text-xs font-bold ${active === s.key ? "text-blue-100" : pctColor(c52)}`}>
                    {pct(c52)}
                  </span>
                ) : (
                  <span className={`text-xs ${active === s.key ? "text-blue-200" : "text-gray-600"}`}>
                    {s.spWeight}%
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Contenido del sector */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Columna izquierda: descripción + moat */}
          <div className="lg:col-span-2 space-y-4">

            {/* Descripción */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">{sector.emoji}</span>
                <div>
                  <h2 className="text-xl font-bold text-white">{sector.name}</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-500">Peso en S&P 500:</span>
                    <span className="text-sm font-bold text-blue-400">{sector.spWeight}%</span>
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">{sector.description}</p>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Tipo de moat</div>
                  <div className="text-sm text-blue-300 font-medium">{sector.moatType}</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">CAP estimado</div>
                  <div className="text-sm text-yellow-300 font-medium">{sector.capRange}</div>
                </div>
              </div>
            </div>

            {/* Resumen de números reales — ETF sectorial */}
            <div className={`rounded-xl border p-5 ${
              etfData?.change52w != null && etfData.change52w >= 10
                ? "bg-green-950/20 border-green-900/40"
                : etfData?.change52w != null && etfData.change52w < -10
                ? "bg-red-950/20 border-red-900/40"
                : "bg-gray-900 border-gray-800"
            }`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                  Rendimiento real — ETF {ETF_SYMBOL[active]}
                </h3>
                {loading && <span className="text-xs text-gray-600 animate-pulse">Cargando...</span>}
                {!loading && !etfData && <span className="text-xs text-gray-600">Sin datos</span>}
              </div>

              {etfData ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="bg-gray-900/70 rounded-lg px-3 py-2.5">
                      <div className="text-[10px] text-gray-600 mb-0.5">Precio actual</div>
                      <div className="text-base font-bold font-mono text-white">
                        ${etfData.currentPrice.toFixed(2)}
                      </div>
                    </div>
                    <div className="bg-gray-900/70 rounded-lg px-3 py-2.5">
                      <div className="text-[10px] text-gray-600 mb-0.5">Hoy</div>
                      <div className={`text-base font-bold font-mono ${pctColor(etfData.change1d)}`}>
                        {pct(etfData.change1d)}
                      </div>
                    </div>
                    <div className="bg-gray-900/70 rounded-lg px-3 py-2.5">
                      <div className="text-[10px] text-gray-600 mb-0.5">Últimos 12 meses</div>
                      <div className={`text-base font-bold font-mono ${pctColor(etfData.change52w)}`}>
                        {pct(etfData.change52w)}
                      </div>
                    </div>
                    <div className="bg-gray-900/70 rounded-lg px-3 py-2.5">
                      <div className="text-[10px] text-gray-600 mb-0.5">YTD {new Date().getFullYear()}</div>
                      <div className={`text-base font-bold font-mono ${pctColor(etfData.ytdReturn)}`}>
                        {pct(etfData.ytdReturn)}
                      </div>
                    </div>
                  </div>

                  {/* Barra visual de rendimiento 52w */}
                  {etfData.change52w !== null && (
                    <div className="mb-3">
                      <div className="flex justify-between text-[10px] text-gray-600 mb-1">
                        <span>-30%</span><span>0%</span><span>+30%</span>
                      </div>
                      <div className="relative w-full h-2 bg-gray-800 rounded-full">
                        {/* Centro */}
                        <div className="absolute left-1/2 top-0 w-px h-full bg-gray-600" />
                        {/* Barra de rendimiento */}
                        <div
                          className={`absolute top-0 h-full rounded-full ${
                            etfData.change52w >= 0 ? "bg-green-500" : "bg-red-500"
                          }`}
                          style={{
                            left:  etfData.change52w >= 0 ? "50%" : `${Math.max(50 + (etfData.change52w / 30) * 50, 0)}%`,
                            width: `${Math.min(Math.abs(etfData.change52w) / 30 * 50, 50)}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Interpretación */}
                  <p className="text-xs text-gray-400 leading-relaxed border-t border-gray-800 pt-3">
                    <strong className="text-gray-300">Lectura: </strong>
                    {interpretation(etfData.change52w, etfData.ytdReturn)}
                    {etfData.change52w !== null && etfData.ytdReturn !== null && (
                      <span className="text-gray-600">
                        {" "}El ETF {ETF_SYMBOL[active]} acumula {pct(etfData.ytdReturn)} en lo que va del año
                        y {pct(etfData.change52w)} en los últimos 12 meses.
                      </span>
                    )}
                  </p>
                </>
              ) : !loading ? (
                <div className="text-xs text-gray-600 flex items-center gap-3">
                  <span>No se pudo cargar el análisis del ETF {ETF_SYMBOL[active]}.</span>
                  <button onClick={fetchEtfs} className="text-blue-400 hover:text-blue-300 underline transition-colors">Reintentar</button>
                </div>
              ) : null}
            </div>

            {/* Métricas clave */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
                Métricas clave para este sector
              </h3>
              <div className="space-y-3">
                {sector.keyMetrics.map((m, i) => (
                  <div key={i} className="flex gap-3 py-2 border-b border-gray-800/60 last:border-0">
                    <div className="w-5 h-5 rounded-full bg-blue-900 text-blue-300 text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">
                      {i + 1}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">{m.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{m.why}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Riesgos */}
            <div className="bg-gray-900 border border-red-900/30 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-3">
                Riesgos estructurales del sector
              </h3>
              <div className="flex flex-wrap gap-2">
                {sector.risks.map((r, i) => (
                  <span key={i} className="text-xs bg-red-950/50 border border-red-900/40 text-red-300 px-3 py-1 rounded-full">
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Columna derecha: top 10 empresas */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
              Top 10 por peso en S&P 500
            </h3>
            <div className="space-y-3">
              {sector.topCompanies.map((c, i) => (
                <div key={c.symbol}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-700 w-4 text-right">{i + 1}</span>
                      <span className="font-mono text-sm font-bold text-white">{c.symbol}</span>
                      <span className="text-xs text-gray-500 truncate max-w-[120px]">{c.name}</span>
                    </div>
                    <span className="text-xs text-blue-400 font-mono shrink-0">{c.weight.toFixed(1)}%</span>
                  </div>
                  <WeightBar value={c.weight} />
                </div>
              ))}
            </div>

            <div className="mt-5 pt-4 border-t border-gray-800">
              <p className="text-xs text-gray-600 leading-relaxed">
                Pesos aproximados dentro del S&P 500 total. Las 10 empresas listadas representan la mayor parte de la capitalización del sector.
              </p>
            </div>
          </div>

        </div>
      </div>
    </main>
  )
}
