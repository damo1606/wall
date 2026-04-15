"use client";

import { useState, useEffect, useRef } from "react";

const STORAGE_KEY = "sore-portafolios-v2";
const MAX_PORTFOLIOS = 8;

interface Portfolio {
  id: string;
  name: string;
  tickers: string[];
  createdAt: string;
}

interface SearchResult { symbol: string; name: string; exchange: string; }

function createPortfolio(name: string): Portfolio {
  return {
    id: Date.now().toString(),
    name,
    tickers: [],
    createdAt: new Date().toISOString(),
  };
}

export default function PortafolioPage() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const searchRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Load from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: Portfolio[] = JSON.parse(saved);
        setPortfolios(parsed);
        setActiveId(parsed[0]?.id ?? "");
      } else {
        const first = createPortfolio("PORTAFOLIO 1");
        setPortfolios([first]);
        setActiveId(first.id);
      }
    } catch {
      const first = createPortfolio("PORTAFOLIO 1");
      setPortfolios([first]);
      setActiveId(first.id);
    }
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (portfolios.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolios));
    }
  }, [portfolios]);

  // Debounced autocomplete
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

  // Focus name input when editing
  useEffect(() => {
    if (editingName) nameRef.current?.focus();
  }, [editingName]);

  const active = portfolios.find((p) => p.id === activeId) ?? null;

  function addPortfolio() {
    if (portfolios.length >= MAX_PORTFOLIOS) return;
    const p = createPortfolio(`PORTAFOLIO ${portfolios.length + 1}`);
    setPortfolios((prev) => [...prev, p]);
    setActiveId(p.id);
  }

  function deletePortfolio(id: string) {
    if (!confirm("¿Eliminar este portafolio?")) return;
    const updated = portfolios.filter((p) => p.id !== id);
    setPortfolios(updated);
    setActiveId(updated[0]?.id ?? "");
    if (updated.length === 0) {
      const first = createPortfolio("PORTAFOLIO 1");
      setPortfolios([first]);
      setActiveId(first.id);
    }
  }

  function updateActive(fn: (p: Portfolio) => Portfolio) {
    setPortfolios((prev) => prev.map((p) => (p.id === activeId ? fn(p) : p)));
  }

  function addTicker(symbol: string) {
    const s = symbol.toUpperCase().trim();
    if (!s || active?.tickers.includes(s)) return;
    updateActive((p) => ({ ...p, tickers: [...p.tickers, s] }));
    setQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
  }

  function removeTicker(symbol: string) {
    updateActive((p) => ({ ...p, tickers: p.tickers.filter((t) => t !== symbol) }));
  }

  function saveName() {
    const name = nameInput.trim().toUpperCase();
    if (name) updateActive((p) => ({ ...p, name }));
    setEditingName(false);
  }

  return (
    <div className="min-h-screen bg-bg text-text">

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {/* Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-black tracking-[0.3em] text-accent mb-1">PORTAFOLIOS</h1>
          <p className="text-xs text-muted tracking-widest">Hasta {MAX_PORTFOLIOS} portafolios · Haz clic en un ticker para analizarlo</p>
        </div>

        {/* Portfolio tabs */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
          {portfolios.map((p) => (
            <button
              key={p.id}
              onClick={() => setActiveId(p.id)}
              className={`shrink-0 px-4 py-2 text-xs font-bold tracking-widest border transition-colors ${
                p.id === activeId
                  ? "border-accent text-accent bg-accent/10"
                  : "border-border text-muted hover:text-accent hover:border-accent"
              }`}
            >
              {p.name}
              <span className="ml-2 opacity-50">{p.tickers.length}</span>
            </button>
          ))}
          {portfolios.length < MAX_PORTFOLIOS && (
            <button
              onClick={addPortfolio}
              className="shrink-0 px-4 py-2 text-xs font-bold tracking-widest border border-dashed border-border text-muted hover:text-accent hover:border-accent transition-colors"
            >
              + NUEVO
            </button>
          )}
          {portfolios.length >= MAX_PORTFOLIOS && (
            <span className="text-xs text-muted opacity-50 ml-2 shrink-0">Máximo {MAX_PORTFOLIOS} portafolios</span>
          )}
        </div>

        {/* Active portfolio */}
        {active && (
          <div className="bg-card border border-border">

            {/* Portfolio header */}
            <div className="border-b border-border px-6 py-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {editingName ? (
                  <input
                    ref={nameRef}
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value.toUpperCase())}
                    onBlur={saveName}
                    onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                    className="bg-bg border border-accent text-text px-3 py-1 text-sm font-bold tracking-widest focus:outline-none w-48"
                    maxLength={24}
                  />
                ) : (
                  <button
                    onClick={() => { setNameInput(active.name); setEditingName(true); }}
                    className="text-sm font-black tracking-widest text-text hover:text-accent transition-colors"
                    title="Doble clic para renombrar"
                  >
                    {active.name}
                  </button>
                )}
                <span className="text-xs text-muted">
                  {active.tickers.length} ticker{active.tickers.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-muted hidden sm:block">Clic en el nombre para editar</span>
                <button
                  onClick={() => deletePortfolio(active.id)}
                  className="text-xs text-muted border border-border px-3 py-1 tracking-widest hover:text-danger hover:border-danger transition-colors"
                >
                  ELIMINAR
                </button>
              </div>
            </div>

            {/* Add ticker input */}
            <div className="px-6 py-4 border-b border-border">
              <div className="flex gap-3">
                <div ref={searchRef} className="relative flex-1">
                  <input
                    className="w-full bg-bg border border-border text-text px-4 py-2.5 text-sm uppercase tracking-widest focus:outline-none focus:border-accent transition-colors"
                    value={query}
                    onChange={(e) => setQuery(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { suggestions.length > 0 ? addTicker(suggestions[0].symbol) : addTicker(query); }
                      if (e.key === "Escape") setShowSuggestions(false);
                    }}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    placeholder="AGREGAR TICKER..."
                    maxLength={40}
                  />
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-50 bg-bg border border-border shadow-lg max-h-56 overflow-y-auto">
                      {suggestions.map((s) => (
                        <button
                          key={s.symbol}
                          onMouseDown={() => addTicker(s.symbol)}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface text-left border-b border-border last:border-0 gap-3"
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
                  onClick={() => { suggestions.length > 0 ? addTicker(suggestions[0].symbol) : addTicker(query); }}
                  className="bg-accent text-white px-5 py-2.5 text-sm font-bold tracking-widest hover:opacity-80 transition-opacity shrink-0"
                >
                  + AGREGAR
                </button>
              </div>
            </div>

            {/* Tickers grid */}
            <div className="p-6">
              {active.tickers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted">
                  <div className="w-12 h-12 border border-border flex items-center justify-center text-2xl text-border">◈</div>
                  <p className="text-xs tracking-widest">PORTAFOLIO VACÍO — AGREGA TICKERS ARRIBA</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {active.tickers.map((t) => (
                      <div key={t} className="border border-border p-3 flex items-center justify-between group hover:border-accent transition-colors">
                        <a
                          href={`/?ticker=${t}`}
                          className="text-sm font-black tracking-widest text-accent hover:underline"
                        >
                          {t}
                        </a>
                        <button
                          onClick={() => removeTicker(t)}
                          className="text-muted hover:text-danger transition-colors text-xs opacity-0 group-hover:opacity-100 ml-2"
                          title="Eliminar"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 flex gap-3">
                    <a href="/" className="text-xs text-muted border border-border px-4 py-2 tracking-widest hover:text-accent hover:border-accent transition-colors">
                      IR AL ANÁLISIS
                    </a>
                    <button
                      onClick={() => { if (confirm("¿Eliminar todos los tickers?")) updateActive((p) => ({ ...p, tickers: [] })); }}
                      className="text-xs text-muted border border-border px-4 py-2 tracking-widest hover:text-danger hover:border-danger transition-colors"
                    >
                      LIMPIAR
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
