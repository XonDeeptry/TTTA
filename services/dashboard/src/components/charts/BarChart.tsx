import { useMemo, useState } from 'react';

/**
 * Hand-authored inline-SVG bar chart primitive — single series only, per
 * F7-ux §4. No charting library. Vertical orientation for time-series
 * (cost/day); horizontal for category comparisons (dimension breakdown,
 * class performance).
 */
export interface BarChartPoint {
  label: string;
  value: number;
  /** Optional extra text shown in the hover/focus tooltip (e.g. graded count). */
  secondary?: string;
}

export interface BarChartProps {
  title: string;
  points: BarChartPoint[];
  orientation?: 'vertical' | 'horizontal';
  /** Accessible value-axis measure label (e.g. "Cost (USD)") — announced via aria. */
  axisValueLabel: string;
  emptyLabel: string;
  formatValue?: (v: number) => string;
  /** Flags the single lowest-value bar with the warning-amber semantic color (worst-first widgets only). */
  highlightWorst?: boolean;
  height?: number;
}

const WIDTH = 640;
const PAD_LEFT = 8;
const PAD_RIGHT = 16;
const PAD_TOP = 20;
const PAD_BOTTOM = 24;
const ROW_HEIGHT = 30;
const CATEGORY_LABEL_WIDTH = 140;

export function BarChart({
  title,
  points,
  orientation = 'vertical',
  axisValueLabel,
  emptyLabel,
  formatValue = (v) => String(v),
  highlightWorst = false,
  height = 240,
}: BarChartProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const hasData = points.length > 0 && points.some((p) => p.value !== 0);
  const worstIdx = useMemo(() => {
    if (!highlightWorst || points.length === 0) return -1;
    let idx = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].value < points[idx].value) idx = i;
    }
    return idx;
  }, [highlightWorst, points]);

  const effectiveHeight = orientation === 'horizontal' ? points.length * ROW_HEIGHT + PAD_TOP + PAD_BOTTOM : height;
  const maxRows = 8;
  const scrollable = orientation === 'horizontal' && points.length > maxRows;
  const boxHeight = orientation === 'horizontal' ? Math.min(effectiveHeight, maxRows * ROW_HEIGHT + PAD_TOP + PAD_BOTTOM) : height;

  const maxValue = useMemo(() => {
    const raw = points.length > 0 ? Math.max(...points.map((p) => p.value)) : 0;
    return raw > 0 ? raw * 1.1 : 1;
  }, [points]);

  const maxCostIdx = useMemo(() => {
    if (orientation !== 'vertical' || points.length === 0) return -1;
    let idx = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].value > points[idx].value) idx = i;
    }
    return idx;
  }, [orientation, points]);

  const xLabelIdxs = useMemo(() => {
    const idxs = new Set<number>();
    if (orientation === 'vertical' && points.length > 0) {
      idxs.add(0);
      idxs.add(points.length - 1);
      if (points.length > 2) idxs.add(Math.floor((points.length - 1) / 2));
    }
    return idxs;
  }, [orientation, points]);

  function tooltipText(p: BarChartPoint): string {
    const base = `${p.label}: ${formatValue(p.value)}`;
    return p.secondary ? `${base} (${p.secondary})` : base;
  }

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{`${title} — ${axisValueLabel}`}</figcaption>
      <div className={scrollable ? 'overflow-y-auto' : undefined} style={{ height: boxHeight }}>
        {!hasData ? (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border" style={{ minHeight: boxHeight }}>
            <p className="text-body text-muted-foreground">{emptyLabel}</p>
          </div>
        ) : orientation === 'horizontal' ? (
          <svg width="100%" height={effectiveHeight} viewBox={`0 0 ${WIDTH} ${effectiveHeight}`} preserveAspectRatio="none" role="img" aria-label={`${title} — ${axisValueLabel}`}>
            <title>{`${title} — ${axisValueLabel}`}</title>
            {points.map((p, i) => {
              const rowY = PAD_TOP + i * ROW_HEIGHT;
              const plotW = WIDTH - PAD_RIGHT - CATEGORY_LABEL_WIDTH - PAD_LEFT;
              const barW = (p.value / maxValue) * plotW;
              const isWorst = i === worstIdx;
              const isActive = activeIdx === i;
              return (
                <g key={i}>
                  <text
                    x={PAD_LEFT}
                    y={rowY + ROW_HEIGHT / 2 + 4}
                    className="fill-foreground text-caption"
                    style={{ fontSize: 11 }}
                  >
                    {p.label}
                  </text>
                  <rect
                    x={PAD_LEFT + CATEGORY_LABEL_WIDTH}
                    y={rowY + 4}
                    width={Math.max(barW, 1)}
                    height={ROW_HEIGHT - 12}
                    rx={2}
                    fill={isWorst ? 'hsl(var(--warning))' : 'hsl(var(--primary))'}
                    opacity={isActive ? 0.85 : 1}
                  />
                  <text
                    x={PAD_LEFT + CATEGORY_LABEL_WIDTH + Math.max(barW, 1) + 6}
                    y={rowY + ROW_HEIGHT / 2 + 4}
                    className="fill-foreground text-caption"
                    style={{ fontSize: 10 }}
                  >
                    {formatValue(p.value)}
                  </text>
                  <rect
                    x={PAD_LEFT + CATEGORY_LABEL_WIDTH}
                    y={rowY}
                    width={plotW + PAD_RIGHT}
                    height={ROW_HEIGHT}
                    fill="transparent"
                    tabIndex={0}
                    role="button"
                    aria-label={tooltipText(p)}
                    onMouseEnter={() => setActiveIdx(i)}
                    onMouseLeave={() => setActiveIdx((cur) => (cur === i ? null : cur))}
                    onFocus={() => setActiveIdx(i)}
                    onBlur={() => setActiveIdx((cur) => (cur === i ? null : cur))}
                  >
                    <title>{tooltipText(p)}</title>
                  </rect>
                </g>
              );
            })}
          </svg>
        ) : (
          <svg width="100%" height={height} viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${title} — ${axisValueLabel}`}>
            <title>{`${title} — ${axisValueLabel}`}</title>
            {[0, 0.33, 0.66, 1].map((f, i) => {
              const plotH = height - PAD_TOP - PAD_BOTTOM;
              const y = PAD_TOP + plotH - f * plotH;
              return <line key={i} x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={y} y2={y} stroke="hsl(var(--border))" strokeOpacity={0.6} strokeWidth={1} />;
            })}
            {points.map((p, i) => {
              const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
              const plotH = height - PAD_TOP - PAD_BOTTOM;
              const slotW = plotW / points.length;
              const barW = slotW * 0.7;
              const x = PAD_LEFT + i * slotW + (slotW - barW) / 2;
              const barH = (p.value / maxValue) * plotH;
              const y = PAD_TOP + plotH - barH;
              const isWorst = i === worstIdx;
              const isActive = activeIdx === i;
              return (
                <g key={i}>
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={Math.max(barH, 0)}
                    fill={isWorst ? 'hsl(var(--warning))' : 'hsl(var(--primary))'}
                    opacity={isActive ? 0.85 : 1}
                  />
                  {i === maxCostIdx && (
                    <text x={x + barW / 2} y={y - 6} textAnchor="middle" className="fill-foreground text-caption" style={{ fontSize: 10 }}>
                      {formatValue(p.value)}
                    </text>
                  )}
                  {xLabelIdxs.has(i) && (
                    <text
                      x={x + barW / 2}
                      y={height - 6}
                      textAnchor="middle"
                      className="fill-muted-foreground text-caption"
                      style={{ fontSize: 10 }}
                    >
                      {p.label}
                    </text>
                  )}
                  <rect
                    x={PAD_LEFT + i * slotW}
                    y={PAD_TOP}
                    width={slotW}
                    height={plotH}
                    fill="transparent"
                    tabIndex={0}
                    role="button"
                    aria-label={tooltipText(p)}
                    onMouseEnter={() => setActiveIdx(i)}
                    onMouseLeave={() => setActiveIdx((cur) => (cur === i ? null : cur))}
                    onFocus={() => setActiveIdx(i)}
                    onBlur={() => setActiveIdx((cur) => (cur === i ? null : cur))}
                  >
                    <title>{tooltipText(p)}</title>
                  </rect>
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </figure>
  );
}
