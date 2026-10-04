import { useMemo, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatUTC } from '../lib/data.js';

/* GOES flux tiers in W/m². Named constants, not tuned values: the
   classification the pipeline performs is defined by these. */
const TIERS = [
  { flux: 1e-8, label: 'A', tone: 'far' },
  { flux: 1e-7, label: 'B', tone: 'far' },
  { flux: 1e-6, label: 'C', tone: 'mid' },
  { flux: 1e-5, label: 'M', tone: 'near' },
  { flux: 1e-4, label: 'X', tone: 'near' },
];

const TONE_VAR = {
  near: 'var(--near)',
  mid: 'var(--mid)',
  far: 'var(--far)',
};

const SUPER = { '1e-8': '10⁻⁸', '1e-7': '10⁻⁷', '1e-6': '10⁻⁶', '1e-5': '10⁻⁵', '1e-4': '10⁻⁴' };

/** The GOES class a flux corresponds to. Derived, never stored. */
function goesClass(flux) {
  if (flux >= 1e-4) return `X${(flux * 1e4).toFixed(1)}`;
  if (flux >= 1e-5) return `M${(flux * 1e5).toFixed(1)}`;
  if (flux >= 1e-6) return `C${(flux * 1e6).toFixed(1)}`;
  if (flux >= 1e-7) return `B${(flux * 1e7).toFixed(1)}`;
  return `A${(flux * 1e8).toFixed(1)}`;
}

/** A flux is C-class and above once it clears 10⁻⁶ W/m². */
function isNotable(flux) {
  return flux >= 1e-6;
}

export default function FluxChart({ data, range, onRange }) {
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState(null);

  /* The chart window is "the last N hours", which is time-dependent — so
     "now" belongs in state driven by a clock, not read inside render. Two
     renders in the same second could otherwise disagree, and the window
     would never advance on its own between WebSocket frames. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [expanded]);

  const filtered = useMemo(() => {
    return data.filter((d) => d.timestamp >= now - range * 3600 * 1000);
  }, [data, range, now]);

  // Fixed viewBox rather than a ResizeObserver: the SVG scales to its
  // container, so there is no layout read and no re-render on resize.
  const W = expanded ? 1200 : 720;
  const H = expanded ? 420 : 240;
  const pad = useMemo(
    () =>
      expanded
        ? { t: 30, r: 96, b: 46, l: 74 }
        : { t: 18, r: 52, b: 34, l: 56 },
    [expanded]
  );

  const FL_MIN = 1e-9;
  const FL_MAX = 1e-4;

  const scales = useMemo(() => {
    if (filtered.length < 2) return null;
    const t0 = filtered[0].timestamp;
    const t1 = filtered[filtered.length - 1].timestamp;
    const { t, r, b, l } = pad;
    const x = (ts) => l + ((ts - t0) / Math.max(1, t1 - t0)) * (W - l - r);
    const y = (v) =>
      t +
      (H - t - b) -
      ((Math.log10(Math.max(FL_MIN, v)) - Math.log10(FL_MIN)) /
        (Math.log10(FL_MAX) - Math.log10(FL_MIN))) *
        (H - t - b);
    return { x, y, t0, t1 };
  }, [filtered, W, H, pad]);

  const handleMove = useCallback(
    (e) => {
      if (!scales) return;
      const r = e.currentTarget.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      // Map the pointer back into viewBox coordinates.
      const vb = frac * W;
      const t = scales.t0 + ((vb - pad.l) / (W - pad.l - pad.r)) * (scales.t1 - scales.t0);

      let closest = filtered[0];
      let best = Infinity;
      for (const p of filtered) {
        const d = Math.abs(p.timestamp - t);
        if (d < best) {
          best = d;
          closest = p;
        }
      }
      setHover(closest);
    },
    [scales, filtered, W, pad.l, pad.r]
  );

  if (!scales) {
    // Absence stated in words, never as an empty chart or a zero.
    return (
      <div className="absent">
        <p>No samples in this window.</p>
        <p>
          {data.length === 0
            ? 'The pipeline has not written a sample yet. Start it with uvicorn api.main:app.'
            : 'Widen the range or wait for the next one-minute sample.'}
        </p>
      </div>
    );
  }

  const softLine = filtered
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${scales.x(d.timestamp)},${scales.y(d.softFlux)}`)
    .join(' ');
  const hardLine = filtered
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${scales.x(d.timestamp)},${scales.y(d.hardFlux)}`)
    .join(' ');

  const firstX = scales.x(filtered[0].timestamp);
  const lastX = scales.x(filtered[filtered.length - 1].timestamp);
  const baseY = H - pad.b;
  const softArea = `${softLine} L${lastX},${baseY} L${firstX},${baseY} Z`;
  const hardArea = `${hardLine} L${lastX},${baseY} L${firstX},${baseY} Z`;

  const nTicks = expanded ? 10 : W < 520 ? 4 : 6;
  const xticks = Array.from({ length: nTicks + 1 }, (_, i) => {
    const t = scales.t0 + (i / nTicks) * (scales.t1 - scales.t0);
    const d = new Date(t);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return {
      x: scales.x(t),
      label: expanded ? `${hh}:${mm}:${String(d.getUTCSeconds()).padStart(2, '0')}` : `${hh}:${mm}`,
    };
  });

  const chart = (
    <div className="chartframe" style={{ height: expanded ? '100%' : H }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`Soft and hard X-ray flux over the last ${range} hours. ${filtered.length} samples.`}
      >
        {/* The hazard bands, so a glance at where the traces sit says what
            class they are in without reading the axis. */}
        <rect
          x={pad.l}
          y={0}
          width={W - pad.l - pad.r}
          height={scales.y(1e-4)}
          fill="var(--tint-refused)"
        />
        <rect
          x={pad.l}
          y={scales.y(1e-4)}
          width={W - pad.l - pad.r}
          height={scales.y(1e-5) - scales.y(1e-4)}
          fill="var(--tint-near)"
        />

        {/* Tier rules. M and X are drawn firmly because they are the two
            thresholds that change what an operator does. */}
        {TIERS.map((t) => {
          const firm = t.label === 'M' || t.label === 'X';
          return (
            <g key={t.label}>
              <line
                x1={pad.l}
                y1={scales.y(t.flux)}
                x2={W - pad.r}
                y2={scales.y(t.flux)}
                stroke={TONE_VAR[t.tone]}
                strokeWidth={firm ? 1.5 : 1}
                strokeDasharray={firm ? 'none' : '3,4'}
                opacity={firm ? 0.55 : 0.24}
              />
              <text
                x={pad.l - 8}
                y={scales.y(t.flux) + 4}
                textAnchor="end"
                fill={firm ? 'var(--near-ink)' : 'var(--muted)'}
                fontSize="14"
                fontWeight={firm ? 700 : 400}
                fontFamily="var(--mono)"
              >
                {t.label}
              </text>
            </g>
          );
        })}

        {/* Y axis: log decades, labelled in the notation the flux is
            quoted in everywhere else in the console. */}
        {TIERS.map((t) => (
          <text
            key={`yl-${t.label}`}
            x={pad.l - 26}
            y={scales.y(t.flux) + 4}
            textAnchor="end"
            className="ticklabel"
          >
            {SUPER[String(t.flux)]}
          </text>
        ))}

        {/* Gridlines and axes. */}
        {TIERS.map((t) => (
          <line
            key={`h-${t.label}`}
            x1={pad.l}
            y1={scales.y(t.flux)}
            x2={W - pad.r}
            y2={scales.y(t.flux)}
            className="gridline"
            strokeDasharray="2,4"
            opacity="0.6"
          />
        ))}
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={baseY} className="axisline" />
        <line x1={pad.l} y1={baseY} x2={W - pad.r} y2={baseY} className="axisline" />

        {xticks.map((t, i) => (
          <g key={i}>
            <line
              x1={t.x}
              y1={pad.t}
              x2={t.x}
              y2={baseY}
              className="gridline"
              strokeDasharray="2,4"
              opacity="0.5"
            />
            <text x={t.x} y={baseY + 20} textAnchor="middle" className="ticklabel">
              {t.label}
            </text>
          </g>
        ))}

        {/* The traces. Unlit marks — a colour a light bounces off is a
            colour the lighting can change. */}
        <path d={softArea} className="trace-fill-soft" />
        <path d={hardArea} className="trace-fill-hard" />
        <path d={hardLine} className="trace-hard" />
        <path d={softLine} className="trace-soft" />

        {/* Hover marker. */}
        {hover && (
          <g>
            <line
              x1={scales.x(hover.timestamp)}
              y1={pad.t}
              x2={scales.x(hover.timestamp)}
              y2={baseY}
              stroke="var(--muted)"
              strokeWidth="1"
              strokeDasharray="2,3"
            />
            {isNotable(hover.softFlux) && (
              <circle
                cx={scales.x(hover.timestamp)}
                cy={scales.y(hover.softFlux)}
                r="5"
                fill="var(--near)"
                stroke="var(--vellum)"
                strokeWidth="1.5"
              />
            )}
            <circle
              cx={scales.x(hover.timestamp)}
              cy={scales.y(hover.hardFlux)}
              r="4"
              fill="var(--far)"
              stroke="var(--vellum)"
              strokeWidth="1.5"
            />
          </g>
        )}
      </svg>
    </div>
  );

  const tooltip = hover && (
    <div
      style={{
        position: 'absolute',
        top: expanded ? 24 : 8,
        left: expanded ? 24 : 8,
        background: 'var(--vellum)',
        border: '1.5px solid var(--graphite)',
        padding: expanded ? '1rem 1.25rem' : '0.6rem 0.75rem',
        fontFamily: 'var(--mono)',
        fontSize: 'var(--ui-sm)',
        pointerEvents: 'none',
        minWidth: expanded ? '18rem' : undefined,
      }}
    >
      <div
        style={{
          fontWeight: 700,
          borderBottom: '1.5px solid var(--rule)',
          paddingBottom: '0.4rem',
          marginBottom: '0.4rem',
        }}
      >
        {formatUTC(hover.timestamp)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem' }}>
        <span style={{ color: 'var(--muted)' }}>SOFT</span>
        <span style={{ color: 'var(--near-ink)', fontWeight: 700 }}>
          {hover.softFlux.toExponential(expanded ? 2 : 1)}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem' }}>
        <span style={{ color: 'var(--muted)' }}>HARD</span>
        <span style={{ color: 'var(--far)', fontWeight: 700 }}>
          {hover.hardFlux.toExponential(expanded ? 2 : 1)}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem' }}>
        <span style={{ color: 'var(--muted)' }}>HARDNESS</span>
        <span style={{ fontWeight: 700 }}>{hover.hardnessRatio.toFixed(4)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem' }}>
        <span style={{ color: 'var(--muted)' }}>CLASS</span>
        <span style={{ fontWeight: 700 }}>{goesClass(hover.softFlux)}</span>
      </div>
      {expanded && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem' }}>
          <span style={{ color: 'var(--muted)' }}>FLUX RATIO</span>
          <span style={{ fontWeight: 700 }}>
            {(hover.hardFlux / Math.max(hover.softFlux, 1e-12)).toFixed(3)}
          </span>
        </div>
      )}
    </div>
  );

  const rangeControl = (
    <div className="seg" role="group" aria-label="Time range">
      {[1, 3, 6, 12, ...(expanded ? [24] : [])].map((h) => (
        <button key={h} aria-pressed={range === h} onClick={() => onRange(h)}>
          {h}H
        </button>
      ))}
    </div>
  );

  /* ------------------------------------------------------------------ expanded */
  if (expanded) {
    return createPortal(
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'var(--vellum)',
          display: 'flex',
          flexDirection: 'column',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="X-ray flux, expanded"
      >
        <div
          className="sheet"
          style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '1rem var(--gutter)' }}
        >
          <div className="panel__head">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: 'var(--brand-sub)', fontFamily: 'var(--display)' }}>
                X-ray flux, expanded
              </h2>
              <span className="readout__k">Aditya-L1 · one-minute cadence</span>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              {rangeControl}
              <button className="btn btn--ghost" onClick={() => setExpanded(false)}>
                Close · Esc
              </button>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            {chart}
            {tooltip}
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1rem',
              justifyContent: 'space-between',
              paddingTop: '0.75rem',
              borderTop: '1.5px solid var(--rule)',
              fontSize: 'var(--ui-sm)',
              color: 'var(--muted)',
              fontFamily: 'var(--mono)',
            }}
          >
            <span>Hover for per-sample values. Esc closes.</span>
            <span>
              {filtered.length.toLocaleString()} samples · {range}H window
            </span>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  /* ------------------------------------------------------------------ inline */
  return (
    <>
      <div className="panel__head">
        <div>
          <h2>X-ray flux</h2>
          <span className="readout__k">SoLEXS soft · HEL1OS hard</span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="legend">
            <span>
              <i className="near" />
              soft
            </span>
            <span>
              <i className="far" />
              hard
            </span>
          </div>
          {rangeControl}
          <button
            className="iconbtn"
            onClick={() => setExpanded(true)}
            aria-label="Expand to full screen"
            title="Expand"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        {chart}
        {tooltip}
      </div>
    </>
  );
}