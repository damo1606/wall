import type { Levels } from "@/types";

interface Props {
  levels: Levels;
  spot: number;
}

const ITEMS = [
  { key: "callWall"   as const, label: "CALL WALL",   hex: "#f04444", desc: "Mayor open interest en calls" },
  { key: "resistance" as const, label: "RESISTENCIA", hex: "#f97316", desc: "GEX más negativo sobre spot" },
  { key: "gammaFlip"  as const, label: "GAMMA FLIP",  hex: "#fbbf24", desc: "GEX acumulado = 0" },
  { key: "support"    as const, label: "SOPORTE",     hex: "#00b85c", desc: "GEX más positivo bajo spot" },
  { key: "putWall"    as const, label: "PUT WALL",    hex: "#3b82f6", desc: "Mayor open interest en puts" },
];

export default function LevelsPanel({ levels, spot }: Props) {
  const allPoints = [
    ...ITEMS.map((i) => ({ label: i.label, value: levels[i.key], hex: i.hex, desc: i.desc, isSpot: false })),
    { label: "SPOT", value: spot, hex: "#8b98b0", desc: "", isSpot: true },
  ].sort((a, b) => b.value - a.value);

  return (
    <div className="bg-card border border-border p-6">
      <div className="text-sm text-muted tracking-widest mb-6 font-semibold">NIVELES INSTITUCIONALES</div>
      <div className="relative pl-8">
        {/* Vertical connecting line */}
        <div className="absolute w-px bg-border" style={{ left: "7px", top: "16px", bottom: "16px" }} />

        <div>
          {allPoints.map((item, i) => {
            const pct = ((item.value - spot) / spot) * 100;
            const nextItem = allPoints[i + 1];
            const gap = nextItem ? item.value - nextItem.value : null;
            const gapPct = gap && spot ? (gap / spot) * 100 : null;

            return (
              <div key={item.label}>
                <div className={`flex items-center gap-4 relative ${item.isSpot ? "py-3" : "py-2"}`}>
                  {/* Dot */}
                  <div
                    className="absolute z-10 rounded-full border-2"
                    style={{
                      left: "-21px",
                      width: item.isSpot ? "18px" : "14px",
                      height: item.isSpot ? "18px" : "14px",
                      top: "50%",
                      transform: `translateY(-50%) ${item.isSpot ? "translateX(-2px)" : ""}`,
                      borderColor: item.hex,
                      background: item.isSpot ? item.hex : "var(--color-card)",
                    }}
                  />

                  {/* Content */}
                  <div
                    className={`flex items-center justify-between w-full ${
                      item.isSpot ? "bg-surface border border-border px-4 py-1.5 rounded" : ""
                    }`}
                  >
                    <div>
                      <span
                        className="text-xs tracking-widest font-bold"
                        style={{ color: item.isSpot ? "var(--color-text)" : item.hex }}
                      >
                        {item.label}
                      </span>
                      {!item.isSpot && (
                        <p className="text-[10px] text-muted mt-0.5">{item.desc}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-6 ml-4">
                      <span className="font-mono font-bold text-sm">${item.value.toFixed(2)}</span>
                      {!item.isSpot && (
                        <span
                          className="font-mono text-xs w-16 text-right tabular-nums"
                          style={{ color: pct >= 0 ? "#f04444" : "#00b85c" }}
                        >
                          {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Gap between levels */}
                {gap !== null && gapPct !== null && gap > 0.01 && (
                  <div className="flex justify-end pr-0 py-0.5">
                    <span className="text-[10px] text-muted font-mono opacity-40">
                      ↕ ${gap.toFixed(2)} · {gapPct.toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
