"use client";

import { useState } from "react";
import { formatCount } from "@/lib/creators-shared";

export interface Point {
  day: string; // YYYY-MM-DD
  value: number;
}

const H = 180;
const PAD = { top: 12, right: 8, bottom: 22, left: 44 };

function shortDay(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  return isNaN(d.getTime()) ? day : d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Tooltip rendered in HTML above the SVG so text stays crisp and wraps. */
function Tooltip({ x, W, label, value }: { x: number; W: number; label: string; value: string }) {
  const leftPct = (x / W) * 100;
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/[0.1] bg-popover px-2.5 py-1.5 text-xs shadow-lg"
      style={{ left: `clamp(48px, ${leftPct}%, calc(100% - 48px))` }}
    >
      <p className="text-muted-foreground">{label}</p>
      <p className="font-semibold text-foreground">{value}</p>
    </div>
  );
}

/** Compact ticks, but exact numbers when the range is narrow (e.g. 2,099 → 2,130). */
function fmtTick(v: number, range: number) {
  return Math.abs(v) >= 100_000 && range >= 10_000 ? formatCount(v) : Math.round(v).toLocaleString();
}

function Axes({ min, max, ticks, W }: { min: number; max: number; ticks: number[]; W: number }) {
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min || 1)) * (H - PAD.top - PAD.bottom);
  return (
    <g className="text-muted-foreground">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={t === 0 ? 0.35 : 0.12} strokeWidth={1} />
          <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="currentColor">{fmtTick(t, max - min)}</text>
        </g>
      ))}
    </g>
  );
}

function XLabels({ data, xAt }: { data: Point[]; xAt: (i: number) => number }) {
  if (!data.length) return null;
  const idx = data.length <= 2 ? data.map((_, i) => i) : [0, Math.floor((data.length - 1) / 2), data.length - 1];
  return (
    <g className="text-muted-foreground">
      {idx.map((i) => (
        <text key={i} x={xAt(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} fontSize={10} fill="currentColor">
          {shortDay(data[i].day)}
        </text>
      ))}
    </g>
  );
}

/** Single-series bars; supports negative values (drawn down from the zero line). */
export function BarChart({ data, unit, colorClass, label, width: W = 600 }: { data: Point[]; unit: string; colorClass: string; label: string; width?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const maxV = Math.max(0, ...data.map((d) => d.value));
  const minV = Math.min(0, ...data.map((d) => d.value));
  const max = niceMax(maxV);
  const min = minV < 0 ? -niceMax(-minV) : 0;
  const innerW = W - PAD.left - PAD.right;
  const slot = innerW / Math.max(1, data.length);
  const barW = Math.max(2, Math.min(28, slot - 2)); // 2px surface gap between bars
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min || 1)) * (H - PAD.top - PAD.bottom);
  const xAt = (i: number) => PAD.left + slot * i + slot / 2;
  const ticks = min < 0 ? [min, 0, max] : [0, max / 2, max];
  const r = Math.min(4, barW / 2);

  return (
    <div className="relative" role="img" aria-label={label}>
      {hover !== null && data[hover] && (
        <Tooltip x={xAt(hover)} W={W} label={shortDay(data[hover].day)} value={`${data[hover].value > 0 && min < 0 ? "+" : ""}${data[hover].value.toLocaleString()} ${unit}`} />
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" onMouseLeave={() => setHover(null)}>
        <Axes min={min} max={max} ticks={ticks} W={W} />
        <g className={colorClass}>
          {data.map((d, i) => {
            if (d.value === 0) return null;
            const x = xAt(i) - barW / 2;
            const y0 = y(0);
            const y1 = y(d.value);
            const top = Math.min(y0, y1);
            const h = Math.max(1, Math.abs(y1 - y0));
            const rr = Math.min(r, h);
            // Rounded only on the data end; flat on the baseline.
            const path = d.value > 0
              ? `M${x},${y0} V${top + rr} Q${x},${top} ${x + rr},${top} H${x + barW - rr} Q${x + barW},${top} ${x + barW},${top + rr} V${y0} Z`
              : `M${x},${y0} V${top + h - rr} Q${x},${top + h} ${x + rr},${top + h} H${x + barW - rr} Q${x + barW},${top + h} ${x + barW},${top + h - rr} V${y0} Z`;
            return <path key={d.day} d={path} fill="currentColor" opacity={hover === null || hover === i ? 1 : 0.45} />;
          })}
        </g>
        {/* Hit targets: the full slot height, wider than the bar */}
        {data.map((d, i) => (
          <rect key={`hit-${d.day}`} x={PAD.left + slot * i} y={PAD.top} width={slot} height={H - PAD.top - PAD.bottom} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        <XLabels data={data} xAt={xAt} />
      </svg>
    </div>
  );
}

/** Single-series line with crosshair tooltip. */
export function LineChart({ data, unit, colorClass, label, width: W = 600 }: { data: Point[]; unit: string; colorClass: string; label: string; width?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const vals = data.map((d) => d.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || Math.max(1, hi * 0.05);
  const min = Math.max(0, lo - span * 0.2);
  const max = hi + span * 0.2;
  const innerW = W - PAD.left - PAD.right;
  const xAt = (i: number) => PAD.left + (data.length <= 1 ? innerW / 2 : (innerW * i) / (data.length - 1));
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min || 1)) * (H - PAD.top - PAD.bottom);
  const ticks = [min, (min + max) / 2, max].map((t) => Math.round(t));
  const path = data.map((d, i) => `${i ? "L" : "M"}${xAt(i)},${y(d.value)}`).join(" ");

  return (
    <div className="relative" role="img" aria-label={label}>
      {hover !== null && data[hover] && <Tooltip x={xAt(hover)} W={W} label={shortDay(data[hover].day)} value={`${data[hover].value.toLocaleString()} ${unit}`} />}
      <svg
        viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          let best = 0;
          data.forEach((_, i) => {
            if (Math.abs(xAt(i) - px) < Math.abs(xAt(best) - px)) best = i;
          });
          setHover(data.length ? best : null);
        }}
      >
        <Axes min={min} max={max} ticks={ticks} W={W} />
        {hover !== null && (
          <line x1={xAt(hover)} x2={xAt(hover)} y1={PAD.top} y2={H - PAD.bottom} className="text-muted-foreground" stroke="currentColor" strokeOpacity={0.35} strokeWidth={1} />
        )}
        <g className={colorClass}>
          <path d={path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) => (
            <circle
              key={d.day} cx={xAt(i)} cy={y(d.value)} r={hover === i ? 5 : data.length <= 12 ? 3 : 0}
              fill="currentColor" className="stroke-background" strokeWidth={2}
            />
          ))}
        </g>
        <XLabels data={data} xAt={xAt} />
      </svg>
    </div>
  );
}
