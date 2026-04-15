"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Metodologia1 from "@/components/Metodologia1";
import Metodologia2 from "@/components/Metodologia2";
import Metodologia3 from "@/components/Metodologia3";
import Metodologia4 from "@/components/Metodologia4";
import Metodologia5 from "@/components/Metodologia5";
import Metodologia6 from "@/components/Metodologia6";
import Metodologia7 from "@/components/Metodologia7";

const TABS = ["METODOLOGÍA 1", "METODOLOGÍA 2", "METODOLOGÍA 3", "METODOLOGÍA 4", "METODOLOGÍA 5", "METODOLOGÍA 6", "METODOLOGÍA 7"] as const;
type Tab = (typeof TABS)[number];

const TAB_DESCRIPTIONS: Record<Tab, string> = {
  "METODOLOGÍA 1": "GEX · VANNA · DEALER FLOW",
  "METODOLOGÍA 2": "Z-SCORE GEX + PCR",
  "METODOLOGÍA 3": "CONFLUENCE 3D",
  "METODOLOGÍA 4": "MAPA DE CALOR S/R",
  "METODOLOGÍA 5": "SEÑAL CONSOLIDADA",
  "METODOLOGÍA 6": "RÉGIMEN DE MERCADO",
  "METODOLOGÍA 7": "VEREDICTO FINAL · S/R INSTITUCIONAL · TIMING MULTI-MARCO",
};

const METHODOLOGY_INTROS: Record<Tab, { what: string; how: string; output: string }> = {
  "METODOLOGÍA 1": {
    what: "Perfil de Gamma Exposure (GEX) por strike — cuantifica cuánta gamma acumulan los dealers en cada nivel de precio y en qué dirección deben hedgear.",
    how: "Cuando el mercado cae hacia un strike con GEX positivo alto, los dealers compran para hedgear (soporte mecánico). Cuando sube hacia un strike con GEX negativo, los dealers venden (resistencia mecánica). La Vanna modela cómo cambia el delta con la volatilidad implícita.",
    output: "Niveles clave: Call Wall (mayor OI en calls), Put Wall (mayor OI en puts), Gamma Flip (precio donde el GEX neto cambia de signo), Soporte y Resistencia institucional.",
  },
  "METODOLOGÍA 2": {
    what: "Análisis Z-Score de GEX y Put/Call Ratio por strike — normaliza estadísticamente la exposición gamma e identifica strikes con mayor presión institucional combinada.",
    how: "Cada strike recibe un z-score de su GEX total y su PCR. La suma de ambos z-scores genera un 'Institutional Pressure Score'. Soporte = strike bajo spot con GEX positivo y PCR > 1 (más puts que calls = cobertura bajista institucional). Resistencia = strike sobre spot con GEX negativo y PCR < 1.",
    output: "Soporte y resistencia de máxima presión institucional, perfil de barras de GEX coloreado por z-score, tabla de strikes con scores normalizados.",
  },
  "METODOLOGÍA 3": {
    what: "Confluencia 3D multi-vencimiento — agrega GEX, OI y PCR de todos los vencimientos ponderados por tiempo (DTE), buscando niveles donde convergen múltiples señales.",
    how: "Cada vencimiento contribuye con peso exp(−DTE/45): vencimientos cercanos pesan más. Los tres ejes (GEX, OI total, PCR) se normalizan simultáneamente con z-score. El 'Confluence Score' suma los tres z-scores — cuanto mayor la magnitud, más fuerte el nivel institucional.",
    output: "Soporte y resistencia con mayor confluencia a través de todos los vencimientos disponibles, mapa de calor de scores por strike.",
  },
  "METODOLOGÍA 4": {
    what: "Mapa de calor 2D de Open Interest e IV Skew — visualiza la distribución del posicionamiento institucional a través de todos los strikes y vencimientos simultáneamente.",
    how: "Cada celda (strike × vencimiento) muestra el OI total con intensidad de color proporcional. La capa de IV Skew superpone el diferencial call/put IV por strike. Los vencimientos mensuales y trimestrales se destacan por su mayor concentración de flujo institucional.",
    output: "Mapa de calor interactivo, perfil agregado de OI por strike, curva de IV Skew por vencimiento seleccionado.",
  },
  "METODOLOGÍA 5": {
    what: "Señal consolidada multi-metodología — combina los niveles de M2, M3 y un análisis propio de triple filtro para generar un score direccional y niveles de alta confluencia.",
    how: "Pondera GEX × OI × PCR con tiempo de vencimiento para cada strike. Los niveles de soporte y resistencia de M2 y M3 se comparan con los de M5 — cuando los tres modelos convergen en el mismo precio, la señal es de máxima confianza. El centro de los tres pares S/R vs el spot genera el 'Center Bias' direccional.",
    output: "Score consolidado (−100 a +100), veredicto direccional, niveles de S/R de los tres modelos, convergencia 0–3/3.",
  },
  "METODOLOGÍA 6": {
    what: "Régimen de mercado en tiempo real — determina si el entorno macro actual favorece o invalida los modelos de GEX antes de operar cualquier señal.",
    how: "Cuatro señales independientes: VIX nivel (35%), estructura de plazos VIX/VIX3M (25%), SPY GEX total (30%) y SPY PCR (10%). La velocidad del VIX (+% en 5 días) actúa como detector de pánico anticipado. En PÁNICO o CRISIS las señales de GEX se suspenden automáticamente.",
    output: "Régimen detectado (COMPRESIÓN / TRANSICIÓN / EXPANSIÓN / PÁNICO AGUDO / CRISIS SISTÉMICA), multiplicador sobre el score de M5, Brief Operativo con entrada · objetivo · stop · R/R ajustados por régimen.",
  },
  "METODOLOGÍA 7": {
    what: "Veredicto final consolidado — agrega las seis metodologías en un único score (−100 a +100) ponderado por fiabilidad: M5 (35%), M6 (25%), M2 (20%), M3 (15%), M1 (5%).",
    how: "Cada metodología aporta un score normalizado. El régimen de mercado (M6) actúa como multiplicador global: en COMPRESIÓN amplifica la señal (×1.2), en EXPANSIÓN la reduce (×0.7), en PÁNICO/CRISIS la suspende. Los niveles S/R de M1, M2, M3 y M5 se agrupan por proximidad (±0.5%) para identificar zonas de máxima confluencia institucional.",
    output: "Score unificado y veredicto, tabla de S/R institucional con votos (0-4 metodologías), setups PRIMARY LONG y PRIMARY SHORT, matriz de timing a 4 marcos temporales (intraday / semanal / mensual / trimestral).",
  },
};

interface SearchResult { symbol: string; name: string; exchange: string; type: string; }

function GexContent() {
  const searchParams = useSearchParams();
  const urlTicker = searchParams.get("ticker")?.toUpperCase() ?? "";

  const [activeTab, setActiveTab] = useState<Tab>(urlTicker ? "METODOLOGÍA 7" : "METODOLOGÍA 1");
  const [ticker, setTicker] = useState(urlTicker || "SPY");
  const [companyName, setCompanyName] = useState("");
  const [query, setQuery] = useState(urlTicker || "SPY");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [expiration, setExpiration] = useState("");
  const [expirations, setExpirations] = useState<string[]>([]);
  const [analyzeKey, setAnalyzeKey] = useState(0);
  const [loadingExps, setLoadingExps] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (query.length < 1) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const json = await res.json();
        setSuggestions(json.results ?? []);
        setShowSuggestions(true);
      } catch { setSuggestions([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function selectSuggestion(result: SearchResult) {
    setTicker(result.symbol);
    setCompanyName(result.name);
    setQuery(result.symbol);
    setSuggestions([]);
    setShowSuggestions(false);
  }

  async function handleAnalyze() {
    if (!ticker.trim()) return;
    setLoadingExps(true);
    try {
      const res = await fetch(`/api/expirations?ticker=${ticker}`);
      const json = await res.json();
      if (res.ok && json.expirations?.length > 0) {
        setExpirations(json.expirations);
        const newExp = (!expiration || !json.expirations.includes(expiration)) ? json.expirations[0] : expiration;
        setExpiration(newExp);
        try { localStorage.setItem("wall_gex_last", JSON.stringify({ ticker, expiration: newExp })); } catch {}
      }
    } catch {}
    setLoadingExps(false);
    setAnalyzeKey((k) => k + 1);
  }

  // Auto-analyze when ticker comes from URL; pre-fill from localStorage otherwise
  const autoAnalyzed = useRef(false);
  useEffect(() => {
    if (urlTicker && !autoAnalyzed.current) {
      autoAnalyzed.current = true;
      handleAnalyze();
    } else if (!urlTicker) {
      try {
        const saved = JSON.parse(localStorage.getItem("wall_gex_last") ?? "null");
        if (saved?.ticker) {
          setTicker(saved.ticker);
          setQuery(saved.ticker);
          if (saved.expiration) setExpiration(saved.expiration);
        }
      } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [introOpen, setIntroOpen] = useState(false);

  return (
    <div className="min-h-screen bg-bg text-text">

      {/* Global Controls */}
      <div className="border-b-2 border-accent px-4 sm:px-6 py-3 bg-surface sticky top-11 z-40 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="flex gap-2">
            {/* Search input with autocomplete */}
            <div ref={searchRef} className="relative">
              <input
                className="bg-bg border border-border text-text px-3 py-2 text-sm uppercase tracking-widest w-48 sm:w-56 focus:outline-none focus:border-accent transition-colors"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value.toUpperCase());
                  setTicker(e.target.value.toUpperCase());
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { setShowSuggestions(false); handleAnalyze(); }
                  if (e.key === "Escape") setShowSuggestions(false);
                }}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder="TICKER O EMPRESA"
                maxLength={40}
              />
              {/* Dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 bg-bg border border-border shadow-lg max-h-64 overflow-y-auto">
                  {suggestions.map((s) => (
                    <button
                      key={s.symbol}
                      onMouseDown={() => selectSuggestion(s)}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-surface text-left border-b border-border last:border-0 gap-3"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-bold text-accent shrink-0">{s.symbol}</span>
                        <span className="text-xs text-subtle truncate">{s.name}</span>
                      </div>
                      <span className="text-[10px] text-muted shrink-0">{s.exchange}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => { setShowSuggestions(false); handleAnalyze(); }}
              disabled={loadingExps}
              className="bg-accent text-white px-5 py-2 text-sm font-bold tracking-widest hover:opacity-80 disabled:opacity-40 transition-opacity flex-1 sm:flex-none"
            >
              {loadingExps ? "..." : "ANALIZAR"}
            </button>
          </div>

          {expirations.length > 0 && (
            <select
              className="bg-bg border border-border text-text px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors w-full sm:w-auto"
              value={expiration}
              onChange={(e) => setExpiration(e.target.value)}
            >
              {Object.entries(
                expirations.reduce<Record<string, string[]>>((acc, exp) => {
                  const label = new Date(exp + "T12:00:00").toLocaleString("en-US", {
                    month: "long", year: "numeric",
                  });
                  if (!acc[label]) acc[label] = [];
                  acc[label].push(exp);
                  return acc;
                }, {})
              ).map(([monthLabel, dates]) => (
                <optgroup key={monthLabel} label={monthLabel}>
                  {dates.map((exp) => {
                    const d = new Date(exp + "T12:00:00");
                    const dow = d.getDay();
                    const day = d.getDate();
                    const mon = d.getMonth();
                    const isThirdFri = dow === 5 && day >= 15 && day <= 21;
                    const isQuart = isThirdFri && [2, 5, 8, 11].includes(mon);
                    const isMon = isThirdFri && !isQuart;
                    const suffix = isQuart ? " ★ TRIM" : isMon ? " · MEN" : "";
                    return <option key={exp} value={exp}>{exp}{suffix}</option>;
                  })}
                </optgroup>
              ))}
            </select>
          )}

          {analyzeKey > 0 && (
            <span className="text-xs text-muted hidden sm:block">
              {ticker}{expiration ? ` · ${expiration}` : ""} · {expirations.length} vencimientos
            </span>
          )}
        </div>
      </div>

      {/* Tabs — horizontally scrollable on mobile */}
      <div className="border-b border-border bg-bg overflow-x-auto">
        <div className="flex min-w-max px-2 sm:px-6">
          {TABS.map((tab, i) => {
            const shortLabel = `M${i + 1}`;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 sm:px-5 py-3 text-xs sm:text-sm font-bold tracking-widest border-b-2 transition-colors flex flex-col items-center sm:items-start shrink-0 ${
                  activeTab === tab
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-text"
                }`}
              >
                <span className="sm:hidden">{shortLabel}</span>
                <span className="hidden sm:block">{tab}</span>
                <span className="text-[9px] font-normal tracking-wider opacity-60 hidden sm:block">
                  {TAB_DESCRIPTIONS[tab]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Methodology intro — collapsible on mobile */}
      {(() => {
        const intro = METHODOLOGY_INTROS[activeTab];
        return (
          <div className="bg-surface border-b border-border">
            {/* Mobile toggle */}
            <button
              className="sm:hidden w-full flex items-center justify-between px-4 py-2 text-xs text-muted tracking-widest"
              onClick={() => setIntroOpen((v) => !v)}
            >
              <span>¿QUÉ MIDE {activeTab.replace("METODOLOGÍA", "M")}?</span>
              <span>{introOpen ? "▲" : "▼"}</span>
            </button>
            {/* Content — always visible on sm+, collapsible on mobile */}
            <div className={`${introOpen ? "block" : "hidden"} sm:block px-4 sm:px-6 pb-4 pt-1 sm:pt-4 grid grid-cols-1 sm:grid-cols-3 gap-3`}>
              <div>
                <div className="text-[9px] text-muted tracking-widest font-bold mb-1">QUÉ MIDE</div>
                <div className="text-xs text-subtle leading-relaxed">{intro.what}</div>
              </div>
              <div>
                <div className="text-[9px] text-muted tracking-widest font-bold mb-1">CÓMO FUNCIONA</div>
                <div className="text-xs text-subtle leading-relaxed">{intro.how}</div>
              </div>
              <div>
                <div className="text-[9px] text-muted tracking-widest font-bold mb-1">QUÉ PRODUCE</div>
                <div className="text-xs text-subtle leading-relaxed">{intro.output}</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Content — always mounted to preserve data state when switching tabs */}
      <div className={activeTab === "METODOLOGÍA 1" ? "" : "hidden"}>
        <Metodologia1 ticker={ticker} expiration={expiration} analyzeKey={analyzeKey} companyName={companyName} />
      </div>
      <div className={activeTab === "METODOLOGÍA 2" ? "" : "hidden"}>
        <Metodologia2 ticker={ticker} expiration={expiration} analyzeKey={analyzeKey} companyName={companyName} />
      </div>
      <div className={activeTab === "METODOLOGÍA 3" ? "" : "hidden"}>
        <Metodologia3 ticker={ticker} expiration={expiration} analyzeKey={analyzeKey} companyName={companyName} />
      </div>
      <div className={activeTab === "METODOLOGÍA 4" ? "" : "hidden"}>
        <Metodologia4 ticker={ticker} expiration={expiration} analyzeKey={analyzeKey} companyName={companyName} />
      </div>
      <div className={activeTab === "METODOLOGÍA 5" ? "" : "hidden"}>
        <Metodologia5 ticker={ticker} expiration={expiration} analyzeKey={analyzeKey} companyName={companyName} />
      </div>
      <div className={activeTab === "METODOLOGÍA 6" ? "" : "hidden"}>
        <Metodologia6 ticker={ticker} expiration={expiration} analyzeKey={analyzeKey} companyName={companyName} />
      </div>
      <div className={activeTab === "METODOLOGÍA 7" ? "" : "hidden"}>
        <Metodologia7 ticker={ticker} expiration={expiration} analyzeKey={analyzeKey} companyName={companyName} />
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense>
      <GexContent />
    </Suspense>
  );
}
