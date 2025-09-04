// src/components/Charts.tsx
import React from "react";

/** Shared palette (non-black). */
const C = {
  axis: "var(--border)",
  text: "var(--muted)",
  est: "#3b82f6",     // blue
  tracked: "#f97316", // orange
};

/** Vertical grouped bars (Daily Totals) */
export function BarsVertical({
  labels,
  est,
  tracked,
  titleA = "Est",
  titleB = "Tracked",
}: {
  labels: string[];
  est: number[];
  tracked: number[];
  titleA?: string;
  titleB?: string;
}) {
  const H = 220;
  const pad = 26;
  const W = Math.max(360, labels.length * 90);
  const all = [...est, ...tracked];
  const maxVal = Math.max(1, ...all) * 1.2;
  const y = (v: number) => H - pad - (v / maxVal) * (H - pad - 30);
  const band = (W - pad * 2) / labels.length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto">
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke={C.axis} />
      <line x1={pad} y1={H - pad} x2={pad} y2={20} stroke={C.axis} />

      {labels.map((lab, i) => {
        const x0 = pad + i * band;
        const bw = Math.min(26, band / 3);
        const xA = x0 + band / 2 - bw - 4;
        const xB = x0 + band / 2 + 4;
        return (
          <g key={i}>
            <rect
              x={xA}
              y={y(est[i] || 0)}
              width={bw}
              height={H - pad - y(est[i] || 0)}
              rx="4"
              fill={C.est}
            />
            <rect
              x={xB}
              y={y(tracked[i] || 0)}
              width={bw}
              height={H - pad - y(tracked[i] || 0)}
              rx="4"
              fill={C.tracked}
            />
            <text
              x={x0 + band / 2}
              y={H - 8}
              fontSize="11"
              textAnchor="middle"
              fill={C.text}
            >
              {lab}
            </text>
          </g>
        );
      })}

      {/* legend */}
      <g>
        <rect x={W - 160} y={10} width="10" height="10" rx="2" fill={C.est} />
        <text x={W - 144} y={19} fontSize="11" fill={C.text}>
          {titleA}
        </text>
        <rect x={W - 90} y={10} width="10" height="10" rx="2" fill={C.tracked} />
        <text x={W - 74} y={19} fontSize="11" fill={C.text}>
          {titleB}
        </text>
      </g>
    </svg>
  );
}

/** Horizontal bars (Consultants Overview) – sorted, no overlap, auto height */
export function BarsHorizontal({
  labels,
  est,
  tracked,
  titleA = "Est",
  titleB = "Tracked",
  maxBars = 8,
}: {
  labels: string[];
  est: number[];
  tracked: number[];
  titleA?: string;
  titleB?: string;
  maxBars?: number;
}) {
  const rows = labels
    .map((name, i) => ({ name, a: est[i] || 0, b: tracked[i] || 0 }))
    .sort((x, y) => (y.b - y.a) - (x.b - x.a))
    .slice(0, maxBars);

  const H = Math.max(160, rows.length * 36 + 48);
  const W = 680;
  const pad = 28;
  const maxVal = Math.max(1, ...rows.map((r) => Math.max(r.a, r.b))) * 1.15;
  const x = (v: number) => pad + (v / maxVal) * (W - pad - 16);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto">
      {rows.map((r, i) => {
        const yy = 30 + i * 36;
        return (
          <g key={i}>
            <text x={pad} y={yy - 8} fontSize="11" fill={C.text}>
              {r.name}
            </text>
            <line x1={pad} y1={yy} x2={W - 10} y2={yy} stroke={C.axis} />
            <rect
              x={pad}
              y={yy + 6}
              width={x(r.a) - pad}
              height="10"
              rx="4"
              fill={C.est}
            />
            <rect
              x={pad}
              y={yy + 20}
              width={x(r.b) - pad}
              height="10"
              rx="4"
              fill={C.tracked}
            />
          </g>
        );
      })}

      {/* legend */}
      <g>
        <rect x={W - 160} y={10} width="10" height="10" rx="2" fill={C.est} />
        <text x={W - 144} y={19} fontSize="11" fill={C.text}>
          {titleA}
        </text>
        <rect x={W - 90} y={10} width="10" height="10" rx="2" fill={C.tracked} />
        <text x={W - 74} y={19} fontSize="11" fill={C.text}>
          {titleB}
        </text>
      </g>
    </svg>
  );
}
