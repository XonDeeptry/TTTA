import { useMemo, useState } from 'react';

/**
 * Hand-authored inline-SVG line chart primitive — single series only, per
 * F7-ux §3. No charting library. Used for volume/quality trends over time
 * (submissions/day, avg-score-over-time).
 */
export interface LineChartPoint {
  label: string;
  value: number | null;
}

export interface LineChartProps {
  /** Accessible chart title — rendered as a visible <h3> by the caller AND as an inner <title>/figcaption here. */
  title: string;
  /** Dense series, in x order. */
  points: LineChartPoint[];
  /** Accessible y-axis measure label (e.g. "Score (%)") — announced via aria, not painted on tiny widths. */
  axisYLabel: string;
  /** Text for empty-data placeholder (i18n'd by the caller). */
  emptyLabel: string;
  /** Formats a numeric value for display (tooltip/endpoint label). Defaults to the raw number. */
  formatValue?: (v: number) => string;
  /** Reserved pixel height of the plot box (default 240). */
  height?: number;
}

const WIDTH = 640;
const PAD_LEFT = 8;
const PAD_RIGHT = 16;
const PAD_TOP = 20;
const PAD_BOTTOM = 24;

export function LineChart({ title, points, axisYLabel, emptyLabel, formatValue = (v) => String(v), height = 240 }: LineChartProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const hasData = points.length > 0 && points.some((p) => p.value !== null);

  const { pathSegments, xForIndex, yForValue, gridLines, xLabelIdxs } = useMemo(() => {
    const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
    const plotH = height - PAD_TOP - PAD_BOTTOM;
    const numericValues = points.map((p) => p.value).filter((v): v is number => v !== null);
    const rawMax = numericValues.length > 0 ? Math.max(...numericValues) : 0;
    const max = rawMax > 0 ? rawMax * 1.1 : 1;

    const xFor = (i: number): number => (points.length <= 1 ? PAD_LEFT : PAD_LEFT + (plotW * i) / (points.length - 1));
    const yFor = (v: number): number => PAD_TOP + plotH - (v / max) * plotH;

    // Split into subpaths around null runs so a gap never reads as zero.
    const segments: string[] = [];
    let current: string[] = [];
    points.forEach((p, i) => {
      if (p.value === null) {
        if (current.length > 0) {
          segments.push(current.join(' '));
          current = [];
        }
        return;
      }
      const cmd = current.length === 0 ? 'M' : 'L';
      current.push(`${cmd}${xFor(i).toFixed(2)},${yFor(p.value).toFixed(2)}`);
    });
    if (current.length > 0) segments.push(current.join(' '));

    const gLines = [0, 0.33, 0.66, 1].map((f) => PAD_TOP + plotH - f * plotH);

    const labelIdxs = new Set<number>();
    if (points.length > 0) {
      labelIdxs.add(0);
      labelIdxs.add(points.length - 1);
      if (points.length > 2) labelIdxs.add(Math.floor((points.length - 1) / 2));
    }

    return { pathSegments: segments, xForIndex: xFor, yForValue: yFor, gridLines: gLines, xLabelIdxs: labelIdxs };
  }, [points, height]);

  const lastValuePoint = [...points].reverse().find((p) => p.value !== null);
  const lastValueIdx = lastValuePoint ? points.lastIndexOf(lastValuePoint) : -1;

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{`${title} — ${axisYLabel}`}</figcaption>
      <div className="relative" style={{ height }}>
        {!hasData ? (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border">
            <p className="text-body text-muted-foreground">{emptyLabel}</p>
          </div>
        ) : (
          <svg
            width="100%"
            height={height}
            viewBox={`0 0 ${WIDTH} ${height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`${title} — ${axisYLabel}`}
          >
            <title>{`${title} — ${axisYLabel}`}</title>
            {gridLines.map((y, i) => (
              <line
                key={i}
                x1={PAD_LEFT}
                x2={WIDTH - PAD_RIGHT}
                y1={y}
                y2={y}
                stroke="hsl(var(--border))"
                strokeOpacity={0.6}
                strokeWidth={1}
              />
            ))}
            {pathSegments.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {lastValueIdx >= 0 && lastValuePoint?.value !== null && lastValuePoint !== undefined && (
              <text
                x={xForIndex(lastValueIdx)}
                y={yForValue(lastValuePoint.value as number) - 8}
                textAnchor="end"
                className="fill-foreground text-caption"
                style={{ fontSize: 10 }}
              >
                {formatValue(lastValuePoint.value as number)}
              </text>
            )}
            {points.map((p, i) => {
              if (!xLabelIdxs.has(i)) return null;
              return (
                <text
                  key={i}
                  x={xForIndex(i)}
                  y={height - 6}
                  textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
                  className="fill-muted-foreground text-caption"
                  style={{ fontSize: 10 }}
                >
                  {p.label}
                </text>
              );
            })}
            {points.map((p, i) => {
              const isActive = activeIdx === i;
              const y = p.value !== null ? yForValue(p.value) : PAD_TOP + (height - PAD_TOP - PAD_BOTTOM);
              return (
                <g key={i}>
                  {isActive && p.value !== null && (
                    <circle cx={xForIndex(i)} cy={y} r={8} fill="hsl(var(--primary))" stroke="white" strokeWidth={2} />
                  )}
                  <rect
                    x={xForIndex(i) - (points.length > 1 ? WIDTH / points.length / 2 : 12)}
                    y={PAD_TOP - 8}
                    width={points.length > 1 ? WIDTH / points.length : 24}
                    height={height - PAD_TOP + 8}
                    fill="transparent"
                    tabIndex={0}
                    role="button"
                    aria-label={`${p.label}: ${p.value === null ? emptyLabel : formatValue(p.value)}`}
                    onMouseEnter={() => setActiveIdx(i)}
                    onMouseLeave={() => setActiveIdx((cur) => (cur === i ? null : cur))}
                    onFocus={() => setActiveIdx(i)}
                    onBlur={() => setActiveIdx((cur) => (cur === i ? null : cur))}
                  />
                  {isActive && (
                    <g>
                      <rect
                        x={Math.min(Math.max(xForIndex(i) - 40, 2), WIDTH - 82)}
                        y={Math.max(y - 34, 2)}
                        width={80}
                        height={24}
                        rx={4}
                        fill="hsl(var(--popover))"
                        stroke="hsl(var(--border))"
                      />
                      <text
                        x={Math.min(Math.max(xForIndex(i), 42), WIDTH - 42)}
                        y={Math.max(y - 34, 2) + 16}
                        textAnchor="middle"
                        className="fill-foreground text-caption"
                        style={{ fontSize: 10 }}
                      >
                        {p.value === null ? emptyLabel : formatValue(p.value)}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </figure>
  );
}
