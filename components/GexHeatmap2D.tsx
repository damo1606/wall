"use client";

import type { Heatmap2DData } from "@/app/api/heatmap2d/route";

// ─── Expiration type ──────────────────────────────────────────────────────────

function getExpType(dateStr: string): "quarterly" | "monthly" | "weekly" {
  const d   = new Date(dateStr + "T12:00:00");
  const day = d.getDate();
  const dow = d.getDay();
  const mon = d.getMonth();
  const isThirdFriday = dow === 5 && day >= 15 && day <= 21;
  if (!isThirdFriday) return "weekly";
  return [2, 5, 8, 11].includes(mon) ? "quarterly" : "monthly";
}

const EXP_STYLE = {
  quarterly: { headerBg: "#1a237e", headerColor: "#fff", badge: "TRIM", outline: "#1a237e" },
  monthly:   { headerBg: "#0d47a1", headerColor: "#fff", badge: "MEN",  outline: "#1565c0" },
  weekly:    { headerBg: "transparent", headerColor: "#9e9e9e", badge: "", outline: "none" },
};

// ─── Color helpers ────────────────────────────────────────────────────────────

function gexColor(gex: number, maxAbs: number): string {
  const t = Math.min(Math.abs(gex) / maxAbs, 1);
  const a = (0.12 + t * 0.82).toFixed(2);
  return gex >= 0 ? `rgba(0,168,84,${a})` : `rgba(229,57,53,${a})`;
}

function textColor(gex: number, maxAbs: number): string {
  const t = Math.min(Math.abs(gex) / maxAbs, 1);
  return 0.12 + t * 0.82 > 0.5 ? "#fff" : "#374151";
}

// Skew color: negative = orange (bearish fear), near 0 = gray, positive = blue
function skewColor(skew: number, maxAbs: number): string {
  if (maxAbs === 0) return "rgba(150,150,150,0.3)";
  const t = Math.min(Math.abs(skew) / maxAbs, 1);
  const a = (0.2 + t * 0.8).toFixed(2);
  return skew < 0
    ? `rgba(255,152,0,${a})`   // orange = puts more expensive = bearish hedge
    : `rgba(21,101,192,${a})`; // blue = calls more expensive = unusual bullish
}

function skewLabel(skew: number): string {
  const pct = (skew * 100).toFixed(1);
  return skew > 0 ? `+${pct}%` : `${pct}%`;
}

function skew25dLabel(skew: number): string {
  if (skew === 0) return "—";
  const pct = (skew * 100).toFixed(1);
  return skew > 0 ? `+${pct}%` : `${pct}%`;
}

function fmtGex(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  return `${(v / 1e3).toFixed(0)}K`;
}

function fmtOI(v: number): string {
  return v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(v);
}

function shortExp(exp: string): string {
  const d = new Date(exp + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GexHeatmap2D({ data }: { data: Heatmap2DData }) {
  const { strikes, expirations, cells, spot, support, resistance, skew25d } = data;

  const cellMap = new Map<string, { gex: number; oi: number; skew: number }>();
  for (const c of cells) {
    cellMap.set(`${c.strike}_${c.expiration}`, { gex: c.gex, oi: c.oi, skew: c.skew });
  }

  const maxAbsGex  = Math.max(...cells.map((c) => Math.abs(c.gex)), 1);
  const maxOI      = Math.max(...cells.map((c) => c.oi), 1);
  const maxAbsSkew = Math.max(...cells.map((c) => Math.abs(c.skew)), 0.001);

  const CELL_W  = 84;
  const CELL_H  = 44;
  const LABEL_W = 72;
  const HDR_H   = 68;
  const expTypes = expirations.map(getExpType);

  return (
    <div className="overflow-auto">

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-4 rounded" style={{ background: "rgba(0,168,84,0.82)" }} />
          GEX+ soporte
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-4 rounded" style={{ background: "rgba(229,57,53,0.82)" }} />
          GEX− resistencia
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-4 rounded" style={{ background: "rgba(255,152,0,0.85)" }} />
          Skew puts caros (cobertura bajista)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-4 rounded" style={{ background: "rgba(21,101,192,0.85)" }} />
          Skew calls caros (sesgo alcista)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-4 rounded" style={{ background: "#1a237e" }} />
          Trimestral
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-4 rounded" style={{ background: "#1565c0" }} />
          Mensual
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${LABEL_W}px repeat(${expirations.length}, ${CELL_W}px)`,
          gap: "2px",
        }}
      >
        {/* Header row */}
        <div
          className="flex items-end justify-end pr-2 pb-1 text-[9px] font-bold tracking-widest text-muted"
          style={{ height: HDR_H }}
        />

        {expirations.map((exp, i) => {
          const style   = EXP_STYLE[expTypes[i]];
          const s25     = skew25d?.[exp] ?? 0;
          const s25Color = s25 < -0.03 ? "#ff9800" : s25 > 0.01 ? "#1565c0" : "#9e9e9e";
          return (
            <div
              key={exp}
              className="flex flex-col items-center justify-end pb-1 text-center"
              style={{
                height: HDR_H,
                background: style.headerBg !== "transparent" ? style.headerBg : undefined,
                borderRadius: "4px 4px 0 0",
                borderTop: style.outline !== "none" ? `3px solid ${style.outline}` : undefined,
              }}
            >
              {style.badge && (
                <div style={{ fontSize: 7, fontWeight: 900, letterSpacing: "0.1em", color: style.headerColor, lineHeight: 1, marginBottom: 2 }}>
                  {style.badge}
                </div>
              )}
              <div style={{ fontSize: 9, fontWeight: 700, color: style.headerColor, lineHeight: 1 }}>
                {shortExp(exp)}
              </div>
              <div style={{ fontSize: 8, color: style.headerColor, opacity: 0.7, lineHeight: 1.3 }}>
                {exp.slice(0, 7)}
              </div>
              {/* 25Δ skew */}
              <div
                title={`25Δ Skew: IV_put25 − IV_call25`}
                style={{
                  marginTop: 3,
                  fontSize: 8,
                  fontWeight: 700,
                  fontFamily: "monospace",
                  color: style.headerBg !== "transparent" ? "#fff" : s25Color,
                  background: style.headerBg !== "transparent" ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.06)",
                  borderRadius: 3,
                  padding: "1px 4px",
                  lineHeight: 1.4,
                }}
              >
                {skew25dLabel(s25)}
              </div>
            </div>
          );
        })}

        {/* Data rows */}
        {strikes.map((strike) => {
          const isSupport    = strike === support;
          const isResistance = strike === resistance;
          const isSpot       = Math.abs(strike - spot) < 0.5;
          const rowBorderColor = isResistance ? "#e53935"
            : isSupport ? "#00a854"
            : isSpot    ? "#f5a623"
            : "transparent";

          return (
            <>
              {/* Strike label */}
              <div
                key={`label_${strike}`}
                className="flex flex-col items-end justify-center pr-2"
                style={{
                  height: CELL_H,
                  borderLeft: `3px solid ${rowBorderColor}`,
                  background: isSpot ? "rgba(245,166,35,0.08)" : undefined,
                }}
              >
                <div className="text-[10px] font-mono font-bold text-subtle">${strike}</div>
                {isResistance && <div className="text-[7px] font-bold text-danger leading-none">RES ▲</div>}
                {isSupport    && <div className="text-[7px] font-bold text-accent leading-none">SUP ▼</div>}
                {isSpot       && <div className="text-[7px] font-bold text-yellow-600 leading-none">SPOT</div>}
              </div>

              {/* Cells */}
              {expirations.map((exp, i) => {
                const cell = cellMap.get(`${strike}_${exp}`);

                if (!cell) {
                  return (
                    <div
                      key={`${strike}_${exp}`}
                      style={{ height: CELL_H, background: "#f5f5f5", borderRadius: 2 }}
                    />
                  );
                }

                const bg    = gexColor(cell.gex, maxAbsGex);
                const fg    = textColor(cell.gex, maxAbsGex);
                const oiPct = Math.max(6, (cell.oi / maxOI) * 100);
                const skewPct = Math.max(6, (Math.abs(cell.skew) / maxAbsSkew) * 100);
                const sColor  = skewColor(cell.skew, maxAbsSkew);

                return (
                  <div
                    key={`${strike}_${exp}`}
                    title={`$${strike} | ${exp} (${expTypes[i]})\nGEX: ${fmtGex(cell.gex)}\nOI: ${fmtOI(cell.oi)}\nSkew: ${skewLabel(cell.skew)}`}
                    style={{
                      height: CELL_H,
                      background: bg,
                      borderRadius: 2,
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 2,
                      outline: expTypes[i] !== "weekly" ? `2px solid ${EXP_STYLE[expTypes[i]].outline}` : undefined,
                      outlineOffset: "-1px",
                    }}
                  >
                    {/* GEX */}
                    <div style={{ color: fg, fontSize: 9, fontFamily: "monospace", fontWeight: 700, lineHeight: 1 }}>
                      {fmtGex(cell.gex)}
                    </div>

                    {/* OI bar — blue */}
                    <div style={{ width: "78%", height: 3, background: "rgba(255,255,255,0.25)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${oiPct}%`, height: "100%", background: "rgba(21,101,192,0.8)", borderRadius: 2 }} />
                    </div>

                    {/* Skew bar — orange/blue */}
                    <div style={{ width: "78%", height: 3, background: "rgba(255,255,255,0.25)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${skewPct}%`, height: "100%", background: sColor, borderRadius: 2 }} />
                    </div>
                  </div>
                );
              })}
            </>
          );
        })}
      </div>

      {/* Bottom labels */}
      <div className="mt-2 flex gap-6 text-[9px] text-muted">
        <span>Barra azul = OI</span>
        <span>Barra naranja = Skew bajista (puts caros)</span>
        <span>Barra azul clara = Skew alcista (calls caros)</span>
      </div>
      <div className="mt-1 text-[9px] text-muted text-center tracking-widest">
        FECHAS DE VENCIMIENTO →
      </div>
    </div>
  );
}
