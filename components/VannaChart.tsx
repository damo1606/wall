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
import type { VannaPoint } from "@/types";

interface Props {
  data: VannaPoint[];
  spot: number;
}

export default function VannaChart({ data, spot }: Props) {
  const visible = data.filter(
    (d) => d.strike >= spot * 0.87 && d.strike <= spot * 1.13
  );

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={visible} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis
          dataKey="strike"
          tick={{ fill: "var(--color-subtle)", fontSize: 10 }}
          tickFormatter={(v) => `$${v}`}
        />
        <YAxis tick={{ fill: "var(--color-subtle)", fontSize: 10 }} width={50} />
        <Tooltip
          contentStyle={{
            background: "var(--color-card)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text)",
            fontSize: 12,
          }}
          formatter={(v: number) => [v.toFixed(0), "Vanna"]}
          labelFormatter={(l) => `Strike: $${l}`}
        />
        <ReferenceLine y={0} stroke="var(--color-border)" />
        <ReferenceLine
          x={spot}
          stroke="var(--color-text)"
          strokeWidth={2}
          label={{ value: "SPOT", fill: "var(--color-text)", fontSize: 9, position: "top" }}
        />
        <Bar dataKey="vanna" radius={[2, 2, 0, 0]}>
          {visible.map((entry, i) => (
            <Cell key={i} fill={entry.vanna >= 0 ? "#448aff" : "#ff6d00"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
