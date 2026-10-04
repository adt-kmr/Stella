import { useState, useEffect, useRef, useCallback } from 'react';
import { useLiveState } from '../lib/data.js';

/**
 * The India regional risk map.
 *
 * Inline SVG rather than a tile layer: the state outlines are the data
 * here, and an inline path set means the map is a drawing on the sheet
 * with no shadow, no blur and nothing floating above the paper. It also
 * means the whole thing works with the network off.
 *
 * Risk is drawn, not asserted: the API returns a value and a band per
 * region, and a region the API did not return is left unfilled rather
 * than drawn at zero.
 */

/* ── Risk bands: Measured Colour, four steps ─────────────── */
const RISK = {
  low: { fill: 'var(--tint-mid)', stroke: 'var(--mid)', label: 'low', tone: 'mid' },
  moderate: { fill: 'var(--tint-near)', stroke: 'var(--near)', label: 'moderate', tone: 'near' },
  high: { fill: 'rgba(255, 91, 46, 0.16)', stroke: 'var(--near)', label: 'high', tone: 'near' },
  critical: { fill: 'var(--tint-refused)', stroke: 'var(--refused)', label: 'critical', tone: 'refused' },
};

/* ── Ground stations ────────────────────────────────────── */
const STATIONS = [
  { id: 'blr', city: 'Bengaluru', x: 130, y: 225, type: 'HQ / satellite' },
  { id: 'shar', city: 'Sriharikota', x: 185, y: 220, type: 'launch complex' },
  { id: 'ahm', city: 'Ahmedabad', x: 95, y: 132, type: 'R&D centre' },
  { id: 'vssc', city: 'Thiruvananthapuram', x: 145, y: 270, type: 'R&D centre' },
  { id: 'hyd', city: 'Hyderabad', x: 170, y: 188, type: 'data centre' },
  { id: 'del', city: 'New Delhi', x: 175, y: 82, type: 'ground station' },
  { id: 'lko', city: 'Lucknow', x: 212, y: 98, type: 'research' },
  { id: 'shill', city: 'Shillong', x: 272, y: 78, type: 'R&D centre' },
  { id: 'mcf', city: 'Hassan', x: 140, y: 222, type: 'satellite ops' },
];

/* ── State outlines ─────────────────────────────────────── */
const STATES = {
  jk: { d: 'M155,28 L172,22 L188,28 L202,36 L208,50 L198,58 L190,64 L180,60 L170,54 L158,48 L150,42 L146,35 Z', label: 'JK', at: [175, 42], zone: 'north' },
  hp: { d: 'M190,58 L208,52 L218,60 L222,70 L212,74 L200,70 L194,66 Z', label: 'HP', at: [206, 63], zone: 'north' },
  uk: { d: 'M215,58 L232,55 L242,62 L240,74 L230,78 L218,75 Z', label: 'UK', at: [228, 66], zone: 'north' },
  pb: { d: 'M146,62 L162,56 L176,62 L180,74 L172,80 L158,78 L148,72 Z', label: 'PB', at: [163, 68], zone: 'north' },
  hr: { d: 'M164,78 L180,74 L188,82 L182,92 L168,90 L162,84 Z', label: 'HR', at: [174, 82], zone: 'north' },
  dl: { d: 'M176,78 L183,76 L187,80 L184,86 L178,84 Z', label: 'DL', at: [182, 81], zone: 'north' },
  rj: { d: 'M118,84 L148,78 L162,84 L168,100 L162,118 L148,124 L130,122 L118,114 L112,98 Z', label: 'RJ', at: [142, 100], zone: 'northwest' },
  up: { d: 'M180,84 L212,78 L228,84 L234,100 L232,118 L220,124 L202,120 L188,112 L178,102 Z', label: 'UP', at: [206, 102], zone: 'north' },
  br: { d: 'M228,104 L242,100 L254,106 L258,120 L250,130 L238,126 L226,118 Z', label: 'BR', at: [242, 114], zone: 'east' },
  jh: { d: 'M228,124 L244,120 L258,126 L262,142 L250,148 L236,144 L226,136 Z', label: 'JH', at: [244, 134], zone: 'east' },
  wb: { d: 'M250,104 L268,98 L278,106 L282,122 L274,132 L264,128 L256,120 L248,112 Z', label: 'WB', at: [265, 116], zone: 'east' },
  sk: { d: 'M268,54 L278,50 L284,56 L282,64 L272,62 Z', label: 'SK', at: [276, 57], zone: 'northeast' },
  as: { d: 'M258,60 L278,52 L294,56 L302,66 L298,78 L284,80 L272,74 L262,68 Z', label: 'AS', at: [278, 66], zone: 'northeast' },
  ar: { d: 'M294,38 L314,32 L330,36 L336,48 L332,62 L320,58 L306,54 L296,46 Z', label: 'AR', at: [314, 47], zone: 'northeast' },
  nl: { d: 'M298,58 L312,54 L322,60 L320,72 L308,70 L300,64 Z', label: 'NL', at: [310, 62], zone: 'northeast' },
  mn: { d: 'M308,64 L322,60 L328,68 L326,80 L316,78 L308,72 Z', label: 'MN', at: [318, 69], zone: 'northeast' },
  mz: { d: 'M314,78 L328,74 L338,82 L336,94 L324,90 L314,84 Z', label: 'MZ', at: [326, 84], zone: 'northeast' },
  tr: { d: 'M290,82 L304,78 L312,84 L308,96 L296,92 L288,88 Z', label: 'TR', at: [300, 87], zone: 'northeast' },
  ml: { d: 'M270,70 L286,66 L296,72 L294,82 L280,82 L268,78 Z', label: 'ML', at: [282, 74], zone: 'northeast' },
  gj: { d: 'M88,114 L118,106 L134,110 L142,124 L138,142 L124,148 L108,144 L96,136 L90,124 Z', label: 'GJ', at: [116, 127], zone: 'west' },
  mp: { d: 'M124,124 L148,116 L172,120 L180,134 L176,150 L162,154 L144,152 L130,146 L122,136 Z', label: 'MP', at: [150, 135], zone: 'central' },
  cg: { d: 'M180,140 L198,134 L214,138 L220,154 L214,164 L200,162 L186,156 L178,148 Z', label: 'CG', at: [199, 149], zone: 'central' },
  od: { d: 'M208,156 L222,148 L236,150 L244,164 L238,178 L224,178 L214,172 L206,164 Z', label: 'OD', at: [225, 163], zone: 'east' },
  mh: { d: 'M92,156 L130,148 L160,152 L174,162 L176,180 L164,188 L142,184 L124,178 L110,172 L100,164 Z', label: 'MH', at: [133, 168], zone: 'west' },
  ts: { d: 'M162,184 L184,176 L202,180 L204,196 L194,204 L180,202 L166,194 Z', label: 'TS', at: [183, 190], zone: 'south' },
  ap: { d: 'M202,186 L222,178 L242,182 L248,200 L240,214 L226,210 L214,204 L204,196 Z', label: 'AP', at: [224, 196], zone: 'south' },
  ka: { d: 'M130,212 L156,200 L178,206 L188,220 L184,238 L172,244 L152,240 L136,234 L128,224 Z', label: 'KA', at: [158, 222], zone: 'south' },
  ga: { d: 'M106,196 L118,190 L126,198 L124,208 L114,204 Z', label: 'GA', at: [116, 199], zone: 'west' },
  kl: { d: 'M140,250 L158,244 L170,250 L168,268 L158,274 L142,270 L134,260 Z', label: 'KL', at: [152, 259], zone: 'south' },
  tn: { d: 'M170,250 L188,242 L204,248 L210,262 L204,276 L190,282 L176,278 L164,270 Z', label: 'TN', at: [187, 262], zone: 'south' },
  py: { d: 'M210,244 L216,240 L220,246 L218,252 L212,250 Z', label: 'PY', at: [215, 246], zone: 'south' },
  an: { d: 'M308,248 L318,242 L326,250 L324,264 L314,262 L306,254 Z', label: 'AN', at: [316, 253], zone: 'islands' },
  ld: { d: 'M72,268 L80,262 L88,268 L86,278 L76,276 Z', label: 'LD', at: [80, 270], zone: 'islands' },
};

function bandOf(v) {
  if (v < 0.08) return 'low';
  if (v < 0.22) return 'moderate';
  if (v < 0.42) return 'high';
  return 'critical';
}

/* The forecast timeline: a CME arrives around +6h and has passed by
   +24h, so risk rises then subsides. These constants mirror
   pipeline/impact.py rather than being tuned per render. */
const PEAK_HOUR = 6;

function riskAtHour(base, hour) {
  if (hour <= PEAK_HOUR) return base * (0.3 + 0.7 * (hour / PEAK_HOUR));
  return base * Math.max(0, 1 - (hour - PEAK_HOUR) / 18);
}

/* Scintillation: GAGAN's warning alert is 0.45 S4. */
const S4_ALERT = 0.45;
const S4_MAX = 1.0;

function stationStatus(s4) {
  if (s4 > 0.7) return { tone: 'refused', word: 'critical' };
  if (s4 > 0.4) return { tone: 'near', word: 'warning' };
  if (s4 > 0.15) return { tone: 'near', word: 'elevated' };
  return { tone: 'mid', word: 'nominal' };
}

export default function IndiaImpactMap() {
  const { flareClass } = useLiveState();
  const [mode, setMode] = useState('gps');
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(null);
  const [hoverState, setHoverState] = useState(null);
  const [hoverStation, setHoverStation] = useState(null);
  const [showStations, setShowStations] = useState(false);
  const [hour, setHour] = useState(PEAK_HOUR);
  const [playing, setPlaying] = useState(false);
  const lastFetched = useRef(null);
  const timerRef = useRef(null);

  const fetchImpact = useCallback(async (fc) => {
    try {
      setFailed(null);
      const res = await fetch(`/api/impact?flare_class=${encodeURIComponent(fc)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      lastFetched.current = fc;
    } catch (err) {
      setFailed(err.message || 'request failed');
    }
  }, []);

  useEffect(() => {
    if (flareClass && flareClass !== lastFetched.current) fetchImpact(flareClass);
  }, [flareClass, fetchImpact]);

  // The timeline animation. Frame-based so it stays smooth, and it stops
  // rather than looping back, because a scrubber that jumps back reads
  // as a fault rather than a loop.
  useEffect(() => {
    if (!playing) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setHour((h) => {
        const next = h + 0.5;
        if (next >= 24) {
          setPlaying(false);
          return h;
        }
        return next;
      });
    }, 80);
    return () => clearInterval(timerRef.current);
  }, [playing]);

  const severity = severityOf(flareClass);
  const multiplier = riskAtHour(1.0, hour);

  const regions = data?.regions || [];

  const read = (region) => {
    const branch = mode === 'gps' ? region.gps : region.powerGrid;
    if (!branch) return null;
    const base = branch.value ?? 0;
    const scaled = base * multiplier;
    return {
      value: scaled,
      base,
      risk: bandOf(scaled),
      baseRisk: branch.risk,
      description: branch.description,
    };
  };

  const counts = regions.reduce(
    (acc, r) => {
      const rr = read(r);
      if (rr) acc[rr.risk] += 1;
      return acc;
    },
    { low: 0, moderate: 0, high: 0, critical: 0 }
  );

  const overall = counts.critical
    ? { tone: 'refused', label: 'critical' }
    : counts.high
    ? { tone: 'near', label: 'high' }
    : counts.moderate
    ? { tone: 'near', label: 'moderate' }
    : { tone: 'mid', label: 'nominal' };

  const avgS4 = Math.min(S4_MAX, 0.02 + severity * multiplier * 0.95);
  const avgGic = 0.1 + severity * multiplier * 79.9;

  if (failed) {
    return (
      <div className="gateblock">
        <div className="gateblock__head">
          <span className="gateblock__title">Regional map unavailable</span>
          <span className="gateblock__verdict">refused</span>
        </div>
        <p style={{ margin: 0, fontSize: 'var(--ui-sm)' }}>
          <code>GET /api/impact?flare_class={flareClass}</code> returned {failed}. Regional risk
          comes from pipeline/impact.py scoring each state against the event class; with it down
          there is no risk to draw, and drawing the states as nominal would be a claim the data
          does not support.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="calibrating">
        <div className="calibrating__bar">
          <i />
        </div>
        <span>Scoring regions for {flareClass || 'the current class'}</span>
      </div>
    );
  }

  return (
    <div className="console" style={{ padding: 0 }}>
      {/* --------------------------------------------------------- controls */}
      <div className="panel__head">
        <div>
          <h2>Regional risk</h2>
          <span className="readout__k">
            {mode === 'gps' ? 'navigation & positioning' : 'power grid & ground infrastructure'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`stateword is-${overall.tone}`}>{overall.label}</span>
          <div className="seg" role="group" aria-label="Infrastructure layer">
            <button aria-pressed={mode === 'gps'} onClick={() => setMode('gps')}>
              GPS
            </button>
            <button aria-pressed={mode === 'grid'} onClick={() => setMode('grid')}>
              Grid
            </button>
          </div>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setShowStations((s) => !s)}
            aria-pressed={showStations}
          >
            Stations {showStations ? 'on' : 'off'}
          </button>
        </div>
      </div>

      {/* --------------------------------------------------------- timeline */}
      <div style={{ margin: '1.25rem 0' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '0.5rem',
          }}
        >
          <span className="readout__k">Forecast timeline · T+{hour.toFixed(0)}h</span>
          <button className="btn btn--ghost btn--sm" onClick={() => setPlaying((p) => !p)}>
            {playing ? 'Stop' : 'Play'}
          </button>
        </div>
        <div
          className="seek"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
            setHour(Math.round(frac * 24));
          }}
          role="slider"
          tabIndex={0}
          aria-label="Forecast hour"
          aria-valuemin={0}
          aria-valuemax={24}
          aria-valuenow={Math.round(hour)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') setHour((h) => Math.min(24, h + 1));
            if (e.key === 'ArrowLeft') setHour((h) => Math.max(0, h - 1));
          }}
        >
          <i style={{ width: `${(hour / 24) * 100}%` }} />
        </div>
        <div className="seeklabel">
          <span>now</span>
          <span>peak arrival +{PEAK_HOUR}h</span>
          <span>+24h</span>
        </div>
      </div>

      {/* ------------------------------------------------------- map + rail */}
      <div className="console__grid">
        <div style={{ position: 'relative' }}>
          <svg
            viewBox="40 10 300 280"
            className="planmap"
            role="img"
            aria-label={`Indian states shaded by ${mode === 'gps' ? 'navigation' : 'power grid'} risk at T+${hour.toFixed(0)} hours.`}
            style={{ maxHeight: '34rem' }}
          >
            {Object.entries(STATES).map(([id, s]) => {
              const region = regions.find((r) => r.id === id);
              const rr = region ? read(region) : null;
              const band = RISK[rr?.risk] || null;
              const isHover = hoverState?.id === id;
              return (
                <g key={id}>
                  <path
                    d={s.d}
                    className="state"
                    fill={band ? band.fill : 'var(--vellum)'}
                    stroke={isHover ? 'var(--graphite)' : band ? band.stroke : 'var(--rule)'}
                    strokeWidth={isHover ? 2 : 1}
                    style={{ cursor: region ? 'pointer' : 'default', transition: 'fill 300ms ease, stroke 150ms ease' }}
                    onMouseEnter={() => region && setHoverState(region)}
                    onMouseLeave={() => setHoverState(null)}
                  />
                  <text
                    x={s.at[0]}
                    y={s.at[1]}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="state-label"
                    style={{ pointerEvents: 'none' }}
                  >
                    {s.label}
                  </text>
                </g>
              );
            })}

            {showStations &&
              STATIONS.map((st) => {
                const isHover = hoverStation?.id === st.id;
                const s4 = Math.min(S4_MAX, 0.02 + severity * multiplier * 0.95);
                const s = stationStatus(s4);
                return (
                  <g key={st.id}>
                    <line
                      x1={st.x}
                      y1={st.y}
                      x2={st.x}
                      y2={st.y + 12}
                      stroke="var(--mid)"
                      strokeWidth="1"
                      strokeDasharray="2,2"
                      opacity="0.35"
                    />
                    {/* A beacon is a point in space, so it may be a circle. */}
                    <circle
                      cx={st.x}
                      cy={st.y}
                      r={isHover ? 6 : 4}
                      fill="none"
                      stroke={`var(--${s.tone})`}
                      strokeWidth={isHover ? 2 : 1.5}
                    />
                    <circle cx={st.x} cy={st.y} r="2.5" fill={`var(--${s.tone})`} />
                    <text
                      x={st.x}
                      y={st.y - 7}
                      textAnchor="middle"
                      className="station-label"
                      style={{ pointerEvents: 'none' }}
                    >
                      {st.city}
                    </text>
                    <circle
                      cx={st.x}
                      cy={st.y}
                      r="9"
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoverStation(st)}
                      onMouseLeave={() => setHoverStation(null)}
                    />
                  </g>
                );
              })}
          </svg>

          {/* Hover readout, drawn in the corner of the plate rather than
              floating over it — a tooltip that casts a shadow is not on
              the sheet, so this one is a bordered box on the same paper. */}
          {hoverState && (
            <div
              style={{
                border: '1.5px solid var(--graphite)',
                background: 'var(--vellum)',
                padding: '0.75rem 0.9rem',
                marginTop: '0.75rem',
                fontSize: 'var(--ui-sm)',
                maxWidth: '28rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.4rem' }}>
                <strong>{hoverState.name}</strong>
                <span className={`stateword is-${read(hoverState)?.risk === 'critical' ? 'refused' : read(hoverState)?.risk === 'low' ? 'mid' : 'near'}`}>
                  {read(hoverState)?.risk}
                </span>
              </div>
              <div style={{ color: 'var(--muted)' }}>
                {hoverState.lat}°N · {hoverState.zone}
              </div>
              <p style={{ margin: '0.4rem 0 0' }}>{read(hoverState)?.description}</p>
              <div style={{ marginTop: '0.5rem' }}>
                <div className="bar">
                  <i
                    className={read(hoverState)?.risk === 'low' ? 'is-mid' : 'is-near'}
                    style={{ width: `${Math.min(100, (read(hoverState)?.value ?? 0) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ------------------------------------------------------- the rail */}
        <div style={{ display: 'grid', gap: '1.5rem', alignContent: 'start' }}>
          <div className="readouts">
            <div className="readout">
              <span className="readout__k">Avg scintillation</span>
              <span className={`readout__v is-${avgS4 > 0.45 ? 'refused' : avgS4 > 0.15 ? 'near' : 'mid'}`}>
                {avgS4.toFixed(2)}
              </span>
              <span className="readout__sub">S4 · alert at {S4_ALERT.toFixed(2)}</span>
            </div>
            <div className="readout">
              <span className="readout__k">Induced current</span>
              <span className="readout__v is-near">{avgGic.toFixed(1)}</span>
              <span className="readout__sub">A · geomagnetically induced</span>
            </div>
          </div>

          {/* Legend. The band names are printed, so the map is readable
              without relying on the colours alone. */}
          <div>
            <span className="readout__k" style={{ display: 'block', marginBottom: '0.5rem' }}>
              Legend
            </span>
            <div className="legend" style={{ gap: '0.5rem 1.25rem' }}>
              {Object.entries(RISK).map(([key, r]) => (
                <span key={key}>
                  <i className={key === 'critical' ? 'refused' : key === 'low' ? 'mid' : 'near'} />
                  {r.label}
                </span>
              ))}
            </div>
          </div>

          <dl className="bench">
            <dt>Critical</dt>
            <dd className={counts.critical ? 'is-refused' : ''}>{counts.critical}</dd>
            <dt>High</dt>
            <dd className={counts.high ? 'is-near' : ''}>{counts.high}</dd>
            <dt>Moderate</dt>
            <dd>{counts.moderate}</dd>
            <dt>Low</dt>
            <dd>{counts.low}</dd>
            <dt>Not scored</dt>
            <dd>{Object.keys(STATES).length - regions.length}</dd>
          </dl>

          <p style={{ margin: 0, fontSize: 'var(--ui-sm)', color: 'var(--muted)' }}>
            Scintillation index S4 and geomagnetically induced current, extrapolated to T+
            {hour.toFixed(0)}h by scaling the event severity against arrival and decay times.
            GAGAN APV receivers raise a warning alert when regional S4 passes {S4_ALERT.toFixed(2)}.
          </p>
        </div>
      </div>
    </div>
  );
}

/* Flare class → a 0..1 severity, matching the thresholds the rest of
   the console uses. C and above register at all; M and X dominate. */
function severityOf(flareClass) {
  const c = (flareClass || '').charAt(0).toUpperCase();
  const mag = parseFloat((flareClass || '').slice(1) || '0') || 0;
  if (c === 'X') return Math.min(1, 0.65 + (mag / 10) * 0.3);
  if (c === 'M') return Math.min(0.6, 0.35 + (mag / 10) * 0.25);
  if (c === 'C') return Math.min(0.3, 0.15 + (mag / 10) * 0.15);
  return 0;
}