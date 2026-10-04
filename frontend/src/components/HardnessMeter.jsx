import { useMemo, useState, useCallback } from 'react';
import { formatUTC } from '../lib/data.js';

/* The Neupert pre-flare threshold. Named constant from
   pipeline/thresholds.py — the same 0.06 the rest of the console
   quotes, not a value re-derived per render. */
const THRESHOLD = 0.06;
const MAX_HARDNESS = 0.15;

/** Measured Colour, one mapping for the whole console. */
function tone(value) {
  if (value >= THRESHOLD) return 'refused';
  if (value >= 0.045) return 'near';
  return 'mid';
}

export default function HardnessMeter({ data, fluxData }) {
  const [hover, setHover] = useState(null);

  const series = useMemo(() => {
    if (!fluxData || fluxData.length === 0) return [];
    const twoHoursAgo = Date.now() - 2 * 3600 * 1000;
    return fluxData.filter((d) => d.timestamp >= twoHoursAgo);
  }, [fluxData]);

  const current = data?.current ?? null;
  const above = current !== null && current >= THRESHOLD;
  const t = tone(current ?? 0);

  const W = 720;
  const H = 260;
  const pad = { t: 20, r: 64, b: 36, l: 64 };

  const scales = useMemo(() => {
    if (series.length < 2) return null;
    const t0 = series[0].timestamp;
    const t1 = series[series.length - 1].timestamp;
    const x = (ts) => pad.l + ((ts - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r);
    const y = (v) =>
      pad.t +
      (H - pad.t - pad.b) -
      ((v - 0) / MAX_HARDNESS) * (H - pad.t - pad.b);
    return { x, y, t0, t1 };
  }, [series, W, H]);

  const handleMove = useCallback(
    (e) => {
      if (!scales) return;
      const r = e.currentTarget.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const ts = scales.t0 + frac * (scales.t1 - scales.t0);
      let closest = series[0];
      let best = Infinity;
      for (const p of series) {
        const d = Math.abs(p.timestamp - ts);
        if (d < best) {
          best = d;
          closest = p;
        }
      }
      setHover(closest);
    },
    [scales, series]
  );

  const trendWord =
    data?.trend === 'rising' ? 'rising' : data?.trend === 'falling' ? 'falling' : 'stable';

  return (
    <>
      <div className="panel__head">
        <div>
          <h2>Spectral hardness</h2>
          <span className="readout__k">HEL1OS ÷ SoLEXS · Neupert pre-flare signature</span>
        </div>
        {/* Colour is never the only carrier: the state is named in words. */}
        {above ? (
          <span className="stateword is-refused">above threshold</span>
        ) : (
          <span className="stateword is-mid">below threshold</span>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(9rem, 1fr) minmax(0, 3fr)',
          gap: '1.5rem',
          alignItems: 'start',
        }}
      >
        {/* -------------------------------------------------- the reading */}
        <div style={{ display: 'grid', gap: '0.9rem' }}>
          <div>
            <span className="readout__k">Hardness ratio</span>
            <div
              className={`readout__v is-lg ${current !== null ? `is-${t}` : ''}`}
              style={{ marginTop: '0.25rem' }}
            >
              {current === null ? '—' : current.toFixed(4)}
            </div>
          </div>

          {/* The bar is the gauge. A bar meter rather than a radial dial,
              because a drawing has no bezel to put a dial in. */}
          <div className="bar" title={`Current ${current?.toFixed(4)} against a ${THRESHOLD} threshold`}>
            <i
              className={current !== null ? `is-${t}` : ''}
              style={{ width: `${Math.min(100, ((current ?? 0) / MAX_HARDNESS) * 100)}%` }}
            />
          </div>

          <dl className="bench">
            <dt>Threshold</dt>
            <dd>{THRESHOLD.toFixed(2)}</dd>
            <dt>Baseline</dt>
            <dd>{data?.baseline !== undefined ? data.baseline.toFixed(4) : '—'}</dd>
            <dt>Trend</dt>
            <dd className={trendWord === 'rising' ? 'is-near' : ''} style={{ color: 'inherit' }}>
              <span className={`stateword is-${trendWord === 'rising' ? 'near' : trendWord === 'falling' ? 'mid' : 'quiet'}`}>
                {trendWord}
              </span>
            </dd>
            {data?.preFlareSignal && (
              <>
                <dt>Advance</dt>
                <dd style={{ color: 'var(--near-ink)' }}>+{data.minutesEarly} min</dd>
              </>
            )}
          </dl>
        </div>

        {/* ---------------------------------------------------- the trace */}
        {!scales ? (
          <div className="absent">
            <p>No hardness samples yet.</p>
            <p>The ratio needs both bands in the same one-minute sample.</p>
          </div>
        ) : (
          <div className="chartframe" style={{ position: 'relative' }}>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              onMouseMove={handleMove}
              onMouseLeave={() => setHover(null)}
              style={{ height: H }}
              role="img"
              aria-label={`Hardness ratio against the ${THRESHOLD} threshold over the last two hours.`}
            >
              {/* Above-threshold zone, tinted rather than bordered: the
                  region is a fact about the data, so it reads as ground. */}
              <rect
                x={pad.l}
                y={pad.t}
                width={W - pad.l - pad.r}
                height={scales.y(THRESHOLD) - pad.t}
                fill="var(--tint-refused)"
              />

              {[0.03, 0.06, 0.09, 0.12].map((v) => (
                <g key={v}>
                  <line
                    x1={pad.l}
                    y1={scales.y(v)}
                    x2={W - pad.r}
                    y2={scales.y(v)}
                    className="gridline"
                    strokeDasharray="2,4"
                  />
                  <text
                    x={pad.l - 10}
                    y={scales.y(v) + 4}
                    textAnchor="end"
                    className="ticklabel"
                  >
                    {v.toFixed(2)}
                  </text>
                </g>
              ))}

              {/* The threshold itself, named on the axis rather than
                  left for the reader to infer from the tint. */}
              <line
                x1={pad.l}
                y1={scales.y(THRESHOLD)}
                x2={W - pad.r}
                y2={scales.y(THRESHOLD)}
                stroke="var(--near-ink)"
                strokeWidth="1.5"
              />
              <text
                x={W - pad.r + 6}
                y={scales.y(THRESHOLD) + 4}
                className="threshlabel"
              >
                0.06
              </text>

              <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} className="axisline" />
              <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} className="axisline" />

              {Array.from({ length: 5 }, (_, i) => {
                const ts = scales.t0 + (i / 4) * (scales.t1 - scales.t0);
                const d = new Date(ts);
                return (
                  <text
                    key={i}
                    x={scales.x(ts)}
                    y={H - pad.b + 20}
                    textAnchor="middle"
                    className="ticklabel"
                  >
                    {String(d.getUTCHours()).padStart(2, '0')}:{String(d.getUTCMinutes()).padStart(2, '0')}
                  </text>
                );
              })}

              <path
                d={series
                  .map(
                    (d, i) =>
                      `${i === 0 ? 'M' : 'L'}${scales.x(d.timestamp)},${scales.y(d.hardnessRatio)}`
                  )
                  .join(' ')}
                fill="none"
                stroke={`var(--${t})`}
                strokeWidth="2"
              />

              {hover && (
                <g>
                  <line
                    x1={scales.x(hover.timestamp)}
                    y1={pad.t}
                    x2={scales.x(hover.timestamp)}
                    y2={H - pad.b}
                    stroke="var(--muted)"
                    strokeWidth="1"
                    strokeDasharray="2,3"
                  />
                  <circle
                    cx={scales.x(hover.timestamp)}
                    cy={scales.y(hover.hardnessRatio)}
                    r="4"
                    fill={`var(--${tone(hover.hardnessRatio)})`}
                    stroke="var(--vellum)"
                    strokeWidth="1.5"
                  />
                </g>
              )}
            </svg>

            {hover && (
              <div
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  background: 'var(--vellum)',
                  border: '1.5px solid var(--graphite)',
                  padding: '0.5rem 0.65rem',
                  fontFamily: 'var(--mono)',
                  fontSize: 'var(--ui-sm)',
                  pointerEvents: 'none',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
                  {formatUTC(hover.timestamp)}
                </div>
                <div style={{ color: 'var(--muted)' }}>
                  ratio {hover.hardnessRatio.toFixed(4)}
                </div>
                <div style={{ color: 'var(--muted)' }}>limit {THRESHOLD.toFixed(2)}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}