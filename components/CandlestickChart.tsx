"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  LineStyle,
  IChartApi,
  CrosshairMode,
} from "lightweight-charts";
import type { Levels } from "@/types";

interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface Props {
  candles: Candle[];
  levels: Levels;
  spot: number;
}

const LEVELS = [
  { key: "callWall",   label: "CALL WALL",   color: "#e53935" },
  { key: "resistance", label: "RESISTANCE",  color: "#f97316" },
  { key: "gammaFlip",  label: "GAMMA FLIP",  color: "#f9a825" },
  { key: "support",    label: "SUPPORT",     color: "#00a854" },
  { key: "putWall",    label: "PUT WALL",    color: "#1565c0" },
] as const;

export default function CandlestickChart({ candles, levels, spot }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

    const bg      = isDark ? "#1d232b" : "#f9f9f9";
    const grid    = isDark ? "#2c3545" : "#eeeeee";
    const border  = isDark ? "#2c3545" : "#e0e0e0";
    const txtColor = isDark ? "#8b98b0" : "#616161";

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 480,
      layout: {
        background: { type: ColorType.Solid, color: bg },
        textColor: txtColor,
        fontSize: 13,
      },
      grid: {
        vertLines: { color: grid },
        horzLines: { color: grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: border,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: border,
        timeVisible: true,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
    });

    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#00a854",
      downColor: "#e53935",
      borderUpColor: "#00a854",
      borderDownColor: "#e53935",
      wickUpColor: "#00a854",
      wickDownColor: "#e53935",
    });

    candleSeries.setData(candles);

    // Support / Resistance zones — shade between support and resistance
    const upper = Math.max(levels.resistance, levels.callWall);
    const lower = Math.min(levels.support, levels.putWall);

    // Add each key level as a dashed price line
    for (const lvl of LEVELS) {
      candleSeries.createPriceLine({
        price: levels[lvl.key],
        color: lvl.color,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: lvl.label,
      });
    }

    // Current spot price
    candleSeries.createPriceLine({
      price: spot,
      color: "#9e9e9e",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: "SPOT",
    });

    chart.timeScale().fitContent();

    // Hide TradingView attribution logo
    const hideAttribution = () => {
      containerRef.current?.querySelectorAll("a").forEach((a) => {
        (a as HTMLElement).style.display = "none";
      });
    };
    hideAttribution();
    const attrObserver = new MutationObserver(hideAttribution);
    if (containerRef.current) {
      attrObserver.observe(containerRef.current, { childList: true, subtree: true });
    }

    const observer = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      attrObserver.disconnect();
      chart.remove();
    };
  }, [candles, levels, spot, isDark]);

  return (
    <div>
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-4">
        {LEVELS.map((lvl) => (
          <div key={lvl.key} className="flex items-center gap-2">
            <div
              className="w-6 h-0.5 border-t-2 border-dashed"
              style={{ borderColor: lvl.color }}
            />
            <span className="text-xs text-subtle font-semibold">{lvl.label}</span>
            <span className="text-xs text-muted">${levels[lvl.key].toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
