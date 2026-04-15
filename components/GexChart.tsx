"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
  ResponsiveContainer,
} from "recharts";
import type { GexPoint, Levels } from "@/types";

interface Props {
  data: GexPoint[];
  spot: number;
  levels: Levels;
}

const fmtB = (v: number) => `${(v / 1e9).toFixed(2)}B`;

export default function GexChart({ data, spot, levels }: Props) {
  const visible = data.filter(
    (d) => d.strike >= spot * 0.87 && d.strike <= spot * 1.13
  );

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={visible} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis
          dataKey="strike"
          tick={{ fill: "var(--color-subtle)", fontSize: 10 }}
          tickFormatter={(v) => `$${v}`}
        />
        <YAxis
          tick={{ fill: "var(--color-subtle)", fontSize: 10 }}
          tickFormatter={fmtB}
          width={60}
        />
        <Tooltip
          contentStyle={{
            background: "var(--color-card)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text)",
            fontSize: 12,
          }}
          formatter={(v: number) => [fmtB(v), "GEX"]}
          labelFormatter={(l) => `Strike: $${l}`}
        />
        <ReferenceLine
          x={spot}
          stroke="var(--color-text)"
          strokeWidth={2}
          label={{ value: "SPOT", fill: "var(--color-text)", fontSize: 9, position: "top" }}
        />
        <ReferenceLine
          x={levels.callWall}
          stroke="#ff1744"
          strokeDasharray="4 4"
          label={{ value: "CW", fill: "#ff1744", fontSize: 9 }}
        />
        <ReferenceLine
          x={levels.putWall}
          stroke="#448aff"
          strokeDasharray="4 4"
          label={{ value: "PW", fill: "#448aff", fontSize: 9 }}
        />
        <ReferenceLine
          x={levels.gammaFlip}
          stroke="#ffd740"
          strokeDasharray="4 4"
          label={{ value: "GF", fill: "#ffd740", fontSize: 9 }}
        />
        <Bar dataKey="gex" radius={[2, 2, 0, 0]}>
          {visible.map((entry, i) => (
            <Cell key={i} fill={entry.gex >= 0 ? "#00e676" : "#ff1744"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
