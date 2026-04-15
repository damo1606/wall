"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

interface Props {
  prices: number[];
  flows: number[];
  spot: number;
  gammaFlip: number;
}

const fmtB = (v: number) => `${(v / 1e9).toFixed(2)}B`;

export default function DealerFlowChart({ prices, flows, spot, gammaFlip }: Props) {
  const chartData = prices.map((p, i) => ({
    price: p,
    flow: flows[i],
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis
          dataKey="price"
          tick={{ fill: "var(--color-subtle)", fontSize: 10 }}
          tickFormatter={(v) => `$${v}`}
        />
        <YAxis tick={{ fill: "var(--color-subtle)", fontSize: 10 }} tickFormatter={fmtB} width={60} />
        <Tooltip
          contentStyle={{
            background: "var(--color-card)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text)",
            fontSize: 12,
          }}
          formatter={(v: number) => [fmtB(v), "Dealer Flow"]}
          labelFormatter={(l) => `Price: $${l}`}
        />
        <ReferenceLine y={0} stroke="var(--color-border)" />
        <ReferenceLine
          x={spot}
          stroke="var(--color-text)"
          strokeWidth={2}
          label={{ value: "SPOT", fill: "var(--color-text)", fontSize: 9, position: "top" }}
        />
        <ReferenceLine
          x={gammaFlip}
          stroke="#ffd740"
          strokeDasharray="4 4"
          label={{ value: "GF", fill: "#ffd740", fontSize: 9 }}
        />
        <Line
          type="monotone"
          dataKey="flow"
          stroke="#00e676"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "#00e676" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
