"use client";

import { formatCurrency } from "@/lib/utils";

interface Slice {
  label: string;
  value: number;
  color: string;
}

const COLORS = ["#3b82f6", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6", "#ec4899", "#6b7280"];

export default function PieChart({ data, currency }: { data: { label: string; value: number }[]; currency: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p className="text-gray-400 text-xs text-center py-2">暂无数据</p>;

  const slices: Slice[] = data.map((d, i) => ({ ...d, color: COLORS[i % COLORS.length] }));

  let cumulative = 0;
  const paths = slices.map((s) => {
    const startAngle = (cumulative / total) * 360;
    cumulative += s.value;
    const endAngle = (cumulative / total) * 360;
    return { ...s, startAngle, endAngle };
  });

  function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function arcPath(start: number, end: number, r: number, cx: number, cy: number) {
    if (end - start >= 360) end = start + 359.99;
    const s = polarToCartesian(cx, cy, r, end);
    const e = polarToCartesian(cx, cy, r, start);
    const large = end - start > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y} Z`;
  }

  const R = 70;
  const CX = 90;
  const CY = 80;

  return (
    <div className="py-2">
      <svg viewBox="0 0 200 160" className="w-full max-w-[200px] mx-auto">
        {paths.map((p, i) => (
          <path key={i} d={arcPath(p.startAngle, p.endAngle, R, CX, CY)} fill={p.color} />
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-2">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-1 text-[10px] text-gray-500">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
            {s.label} {formatCurrency(s.value, currency)}
          </div>
        ))}
      </div>
    </div>
  );
}
