"use client";

import type { AggStrikeData } from "@/types";

function cellGex(v: number, maxAbs: number) {
  const t = Math.min(Math.abs(v) / maxAbs, 1);
  const a = (0.12 + t * 0.78).toFixed(2);
  return v >= 0 ? `rgba(0,168,84,${a})` : `rgba(229,57,53,${a})`;
}
function cellOI(v: number, maxOI: number) {
  const t = Math.min(v / maxOI, 1);
  return `rgba(21,101,192,${(0.08 + t * 0.82).toFixed(2)})`;
}
function cellPcr(v: number) {
  const dev = Math.min(Math.abs(v - 1) / 1.5, 1);
  const a   = (0.12 + dev * 0.78).toFixed(2);
  return v > 1 ? `rgba(0,168,84,${a})` : `rgba(229,57,53,${a})`;
}
function cellConf(v: number, maxAbs: number) {
  const t = Math.min(Math.abs(v) / maxAbs, 1);
  const a = (0.12 + t * 0.78).toFixed(2);
  return v >= 0 ? `rgba(0,168,84,${a})` : `rgba(229,57,53,${a})`;
}
function textOnDark(alpha: number) {
  return alpha > 0.5 ? "#fff" : "#374151";
}

export default function ProximityHeatmap({
  strikes,
  spot,
  support,
  resistance,
}: {
  strikes: AggStrikeData[];
  spot: number;
  support: number;
  resistance: number;
}) {
  const sorted    = [...strikes].sort((a, b) => b.strike - a.strike);
  const maxOI     = Math.max(...strikes.map((s) => s.totalOI), 1);
  const maxGexAb  = Math.max(...strikes.map((s) => Math.abs(s.totalGEX)), 1);
  const maxConfAb = Math.max(...strikes.map((s) => Math.abs(s.confluenceScore)), 1);

  const COL = "flex items-center justify-center text-[10px] font-mono rounded h-10 transition-all";
  const HDR = "flex items-center justify-center text-[9px] font-bold tracking-widest text-muted h-7";

  return (
    <div className="overflow-x-auto">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-5 mb-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-4 rounded" style={{ background: "rgba(229,57,53,0.82)" }} />
          Acercándose a resistencia
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-4 rounded bg-yellow-400" />
          Spot actual
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-4 rounded" style={{ background: "rgba(0,168,84,0.82)" }} />
          Acercándose a soporte
        </span>
        <span className="flex items-center gap-1.5 ml-auto">
          <span className="inline-block w-4 h-4 rounded" style={{ background: "rgba(21,101,192,0.72)" }} />
          Open Interest
        </span>
      </div>

      {/* Column headers */}
      <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: "72px 1fr 64px 64px 64px 64px 56px" }}>
        <div className={HDR}>STRIKE</div>
        <div className={HDR}>PROXIMIDAD AL SPOT</div>
        <div className={HDR}>GEX</div>
        <div className={HDR}>OI</div>
        <div className={HDR}>PCR</div>
        <div className={HDR}>CONF</div>
        <div className={HDR}>±%</div>
      </div>

      {/* Rows */}
      <div className="space-y-[3px]">
        {sorted.map((s) => {
          const isSupport     = s.strike === support;
          const isResistance  = s.strike === resistance;
          const isSpot        = Math.abs(s.strike - spot) < 0.5;
          const distPct       = Math.abs(s.strike - spot) / spot * 100;
          const proxIntensity = Math.max(0, 1 - distPct / 15);
          const proxAlpha     = 0.1 + proxIntensity * 0.85;
          const proxBg = isSpot
            ? "rgba(245,166,35,0.95)"
            : s.strike > spot
            ? `rgba(229,57,53,${proxAlpha.toFixed(2)})`
            : `rgba(0,168,84,${proxAlpha.toFixed(2)})`;
          const rowBorder = isResistance ? "2px solid #e53935"
            : isSupport                  ? "2px solid #00a854"
            : isSpot                     ? "2px solid #f5a623"
            : "1px solid #f0f0f0";

          return (
            <div
              key={s.strike}
              className="grid gap-1 items-stretch"
              style={{ gridTemplateColumns: "72px 1fr 64px 64px 64px 64px 56px", border: rowBorder, borderRadius: "4px" }}
            >
              {/* Strike label */}
              <div className="flex items-center justify-end pr-2 h-10">
                <div className="text-right">
                  <div className="text-xs font-mono font-bold text-subtle">${s.strike}</div>
                  {isResistance && <div className="text-[8px] font-bold text-danger leading-none">RES ▲</div>}
                  {isSupport    && <div className="text-[8px] font-bold text-accent leading-none">SUP ▼</div>}
                  {isSpot       && <div className="text-[8px] font-bold text-yellow-600 leading-none">SPOT ◆</div>}
                </div>
              </div>

              {/* Proximity bar */}
              <div className="flex items-center px-1 h-10">
                <div className="w-full h-6 bg-surface rounded overflow-hidden relative">
                  <div
                    className="h-full rounded transition-all duration-500"
                    style={{ width: `${Math.max(4, proxIntensity * 100)}%`, background: proxBg }}
                  />
                  <span
                    className="absolute inset-0 flex items-center px-2 text-[10px] font-mono"
                    style={{ color: proxIntensity > 0.5 ? "#fff" : "#374151" }}
                  >
                    {distPct < 0.1 ? "← SPOT →" : `${distPct.toFixed(2)}% del spot`}
                  </span>
                </div>
              </div>

              {/* GEX */}
              <div className={COL} style={{ background: cellGex(s.totalGEX, maxGexAb), color: textOnDark(0.12 + Math.min(Math.abs(s.totalGEX)/maxGexAb, 1) * 0.78) }}>
                {(s.totalGEX / 1e9).toFixed(1)}B
              </div>

              {/* OI */}
              <div className={COL} style={{ background: cellOI(s.totalOI, maxOI), color: textOnDark(0.08 + Math.min(s.totalOI/maxOI, 1) * 0.82) }}>
                {(s.totalOI / 1e3).toFixed(0)}K
              </div>

              {/* PCR */}
              <div className={COL} style={{ background: cellPcr(s.weightedPCR), color: textOnDark(0.12 + Math.min(Math.abs(s.weightedPCR - 1) / 1.5, 1) * 0.78) }}>
                {s.weightedPCR.toFixed(2)}
              </div>

              {/* Confluence */}
              <div className={COL} style={{ background: cellConf(s.confluenceScore, maxConfAb), color: textOnDark(0.12 + Math.min(Math.abs(s.confluenceScore)/maxConfAb, 1) * 0.78) }}>
                {s.confluenceScore.toFixed(2)}
              </div>

              {/* Distance % */}
              <div
                className="flex items-center justify-center text-[10px] font-mono font-bold h-10"
                style={{ color: isSpot ? "#f5a623" : s.strike > spot ? "#e53935" : "#00a854" }}
              >
                {s.strike > spot ? "+" : s.strike < spot ? "-" : ""}{distPct.toFixed(1)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
