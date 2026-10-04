import { useState, useEffect, useRef, useCallback } from 'react';
import IndiaImpactMap from './IndiaImpactMap.jsx';
import ModelExplanation from './ModelExplanation.jsx';
import { useLiveState } from '../lib/data.js';
import { useReveal } from '../useReveal.js';

/* Risk → Measured Colour. Kept beside the cards that use it so the map
   and the cards cannot drift apart on what "high" looks like. */
const RISK = {
  low: { tone: 'mid', label: 'low', fill: 'var(--tint-mid)', stroke: 'var(--mid)' },
  moderate: { tone: 'near', label: 'moderate', fill: 'var(--tint-near)', stroke: 'var(--near)' },
  high: { tone: 'near', label: 'high', fill: 'rgba(255,91,46,0.16)', stroke: 'var(--near)' },
  critical: { tone: 'refused', label: 'critical', fill: 'var(--tint-refused)', stroke: 'var(--refused)' },
};

const ORDER = { critical: 0, high: 1, moderate: 2, low: 3 };

/* Icons, drawn rather than imported: no icon library, and a stroke
   glyph costs less than a dependency. */
function Glyph({ d, size = 22 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {d}
    </svg>
  );
}

const GLYPHS = {
  'Navigation & Positioning': (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  Communications: (
    <>
      <path d="M12 20V10" />
      <path d="M18 20V4" />
      <path d="M6 20v-4" />
      <path d="M12 10c0-3.5 3-6 6-6" />
      <path d="M12 10c0-2 1.5-4 3.5-4" />
    </>
  ),
  'Defence & Intelligence': (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M12 8v4M12 16h.01" />
    </>
  ),
  'Weather & Earth Observation': (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </>
  ),
  'Power Grid & Ground Infrastructure': <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />,
  'Space Station & Crewed Missions': (
    <>
      <ellipse cx="12" cy="12" rx="10" ry="4" />
      <path d="M12 2a4 10 0 0 1 0 20 4 10 0 0 1 0-20" />
      <circle cx="8" cy="12" r="0.6" fill="currentColor" />
      <circle cx="16" cy="12" r="0.6" fill="currentColor" />
    </>
  ),
  'Scientific Instruments': (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v4M12 19v4" />
      <path d="M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83" />
      <path d="M1 12h4M19 12h4" />
      <path d="M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
    </>
  ),
};

/* The TCN card, kept from the previous build. */
function TcnCard({ forecast, flareClass }) {
  const prob = forecast.probability ?? 0;
  const conf = forecast.tcnConfidence ?? 0;
  const tone = prob >= 70 ? 'near' : prob >= 40 ? 'near' : 'far';
  const confTone = conf >= 0.7 ? 'mid' : conf >= 0.4 ? 'near' : 'refused';

  return (
    <div className="panel" style={{ height: '100%' }}>
      <div className="panel__head">
        <div>
          <h2>TCN forecaster</h2>
          <span className="readout__k">temporal convolutional network · 3h window</span>
        </div>
      </div>

      <div className="readouts" style={{ marginBottom: '1.25rem' }}>
        <div className="readout">
          <span className="readout__k">Probability</span>
          <span className={`readout__v is-${tone}`}>{prob}%</span>
          <span className="readout__sub">next 3 hours</span>
        </div>
        <div className="readout">
          <span className="readout__k">Next class</span>
          <span className="readout__v is-far">{forecast.nextClass || '—'}</span>
          <span className="readout__sub">expected</span>
        </div>
        <div className="readout">
          <span className="readout__k">Lead time</span>
          <span className="readout__v is-far">
            {forecast.leadTime > 0 ? `+${forecast.leadTime}` : '—'}
          </span>
          <span className="readout__sub">min vs onset</span>
        </div>
        <div className="readout">
          <span className="readout__k">Confidence</span>
          <span className={`readout__v is-${confTone}`}>{(conf * 100).toFixed(0)}%</span>
          <span className="readout__sub">model</span>
        </div>
      </div>

      <div className="bar">
        <i className={tone === 'far' ? 'is-far' : 'is-near'} style={{ width: `${Math.max(1, prob)}%` }} />
      </div>

      <dl className="bench" style={{ marginTop: '1.25rem' }}>
        <dt>Current class</dt>
        <dd>{flareClass || '—'}</dd>
        <dt>Architecture</dt>
        <dd>TCN-8L · 3 dilated causal</dd>
        <dt>Pre-training</dt>
        <dd>GOES XRS, feature-level MMD</dd>
      </dl>
    </div>
  );
}

/* The mission card: instruments and sync state. */
function MissionCard({ systemStatus, nowcast }) {
  const items = [
    { k: 'Pipeline', v: systemStatus.pipeline || '—', ok: systemStatus.pipeline === 'Operational' },
    { k: 'PRADAN', v: systemStatus.pradanSync || '—', ok: systemStatus.pradanSync === 'Healthy' },
    { k: 'Aditya-L1', v: systemStatus.al1Sync || '—', ok: systemStatus.al1Sync === 'Healthy' },
    { k: 'Latency', v: systemStatus.dataLatency || '—', ok: true },
    { k: 'Model', v: systemStatus.modelVersion || '—', ok: true },
  ];

  return (
    <div className="panel" style={{ height: '100%' }}>
      <div className="panel__head">
        <div>
          <h2>Aditya-L1 mission</h2>
          <span className="readout__k">PRADAN · SoLEXS · HEL1OS · L1 halo orbit</span>
        </div>
      </div>

      <dl className="bench">
        {items.map((it) => (
          <div key={it.k} style={{ display: 'contents' }}>
            <dt style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                className={`beacon beacon--sm beacon--${it.ok ? 'mid' : 'near'}`}
                aria-hidden="true"
              />
              {it.k}
            </dt>
            <dd className={it.ok ? 'is-mid' : 'is-near'} style={{ color: it.ok ? undefined : undefined }}>
              <span className={it.ok ? 'is-mid' : 'is-near'}>{it.v}</span>
            </dd>
          </div>
        ))}
      </dl>

      <dl className="bench" style={{ marginTop: '1.25rem' }}>
        <dt>SoLEXS flux</dt>
        <dd>{(nowcast.peakFlux || 5e-8).toExponential(2)} W/m²</dd>
        <dt>Phase</dt>
        <dd>{nowcast.currentPhase || 'Quiet Sun'}</dd>
        <dt>Distance</dt>
        <dd>1.5e6 km · L1</dd>
      </dl>
    </div>
  );
}

export default function Impact() {
  const { flareClass, systemStatus, nowcast, forecast } = useLiveState();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [assessedAt, setAssessedAt] = useState(null);
  const [stale, setStale] = useState(false);
  const lastFetched = useRef(null);
  const staleTimer = useRef(null);
  const ref = useReveal();

  const fetchImpact = useCallback(async (fc) => {
    try {
      setLoading(true);
      setFailed(null);
      const res = await fetch(`/api/impact?flare_class=${encodeURIComponent(fc)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setAssessedAt(new Date());
      setStale(false);
      lastFetched.current = fc;

      // An assessment that is not refreshed is marked stale rather than
      // left looking current. Silence is not freshness.
      if (staleTimer.current) clearTimeout(staleTimer.current);
      staleTimer.current = setTimeout(() => setStale(true), 60000);
    } catch (err) {
      setFailed(err.message || 'request failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (flareClass && flareClass !== lastFetched.current) fetchImpact(flareClass);
  }, [flareClass, fetchImpact]);

  useEffect(() => () => clearTimeout(staleTimer.current), []);

  const head = (
    <div className="console__head">
      <div>
        <span className="eyebrow">Sheet 02 · impact assessment</span>
        <h1 className="title">Infrastructure impact</h1>
      </div>
      <div className="console__status">
        {data?.noaaScale && <span className="muted">NOAA scale {data.noaaScale}</span>}
        {assessedAt && (
          <span className="muted">
            assessed {assessedAt.toISOString().replace('T', ' ').slice(0, 19)}Z
          </span>
        )}
        {stale && <span className="staleflag">may be stale</span>}
      </div>
    </div>
  );

  if (failed && !data) {
    return (
      <div className="console" ref={ref}>
        {head}
        <div className="gateblock" data-reveal>
          <div className="gateblock__head">
            <span className="gateblock__title">Impact assessment unavailable</span>
            <span className="gateblock__verdict">refused</span>
          </div>
          <p style={{ margin: 0, fontSize: 'var(--ui-sm)' }}>
            <code>GET /api/impact?flare_class={flareClass}</code> returned {failed}. The refusal
            is deliberate: reporting "no impact" for an event STELLA has not scored would be a
            safety claim, not an empty state.
          </p>
          <button className="btn btn--ghost btn--sm" style={{ marginTop: '0.75rem' }} onClick={() => fetchImpact(flareClass || 'B1.0')}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="console" ref={ref}>
        {head}
        <div className="calibrating">
          <div className="calibrating__bar">
            <i />
          </div>
          <span>Scoring {flareClass || 'the current class'} against seven categories</span>
        </div>
      </div>
    );
  }

  const categories = data?.categories || [];
  const nominal = data?.nominal;

  return (
    <div className="console" ref={ref}>
      {head}

      {/* The verdict banner. Colour plus words, never colour alone. */}
      {nominal ? (
        <div
          className="panel"
          style={{ borderColor: 'var(--mid)', background: 'var(--tint-mid)', marginBottom: '2.5rem' }}
          data-reveal
        >
          <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
            <span className="beacon beacon--lg beacon--mid" aria-hidden="true" />
            <div>
              <div className="readout__k" style={{ color: 'var(--mid-ink)' }}>
                All systems nominal
              </div>
              <p style={{ margin: '0.35rem 0 0', fontSize: 'var(--ui-base)', color: 'var(--body)' }}>
                {flareClass} does not reach the threshold where any category is scored above
                low. This is a measured result, not an absence of analysis.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="panel"
          style={{ borderColor: 'var(--refused)', background: 'var(--tint-refused)', marginBottom: '2.5rem' }}
          data-reveal
        >
          <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
            <span className="beacon beacon--lg beacon--refused beacon--pulse" aria-hidden="true" />
            <div>
              <div className="readout__k" style={{ color: 'var(--refused)' }}>
                Active space weather alert · NOAA scale {data?.noaaScale || '—'}
              </div>
              <p style={{ margin: '0.35rem 0 0', fontSize: 'var(--ui-base)', color: 'var(--body)' }}>
                {flareClass} has been scored above low in {categories.filter((c) => c.risk_level !== 'low').length}{' '}
                of {categories.length} categories. Mitigation guidance is attached to each card
                below.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------ model + mission */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: '1.5rem',
          marginBottom: '2.5rem',
        }}
        className="dash-grid"
      >
        <TcnCard forecast={forecast} flareClass={flareClass} />
        <MissionCard systemStatus={systemStatus} nowcast={nowcast} />
      </div>

      {/* ----------------------------------------------------- category cards */}
      {categories.length === 0 ? (
        <div className="absent">
          <p>No categories returned.</p>
          <p>
            <code>GET /api/impact</code> answered with an empty category list for {flareClass}.
          </p>
        </div>
      ) : (
        <section style={{ marginBottom: '2.5rem' }}>
          <div className="panel__head" data-reveal>
            <div>
              <h2>Seven categories</h2>
              <span className="readout__k">
                scored by pipeline/impact.py against the event class
              </span>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(19rem, 1fr))',
              gap: '1.5rem',
            }}
          >
            {categories.map((cat) => {
              const risk = RISK[cat.risk_level] || RISK.low;
              const pct = cat.risk_level === 'critical' ? 95 : cat.risk_level === 'high' ? 70 : cat.risk_level === 'moderate' ? 40 : 12;
              return (
                <article
                  key={cat.category}
                  className="riskcard"
                  style={{ borderColor: risk.stroke }}
                  data-reveal
                >
                  <div className="riskcard__head">
                    <div style={{ color: `var(--${risk.tone})`, flex: '0 0 auto' }}>
                      <Glyph d={GLYPHS[cat.category] || GLYPHS['Scientific Instruments']} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <h3 className="riskcard__title">{cat.category}</h3>
                      <div
                        className={`stateword is-${risk.tone}`}
                        style={{ marginTop: '0.35rem', display: 'inline-block' }}
                      >
                        {risk.label} risk
                      </div>
                    </div>
                  </div>

                  <p className="riskcard__effect">{cat.effect}</p>

                  {cat.systems?.length > 0 && (
                    <ul className="tags">
                      {cat.systems.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  )}

                  <dl className="bench" style={{ marginBottom: '0.85rem' }}>
                    <dt>Recovery</dt>
                    <dd>{cat.recovery_time || '—'}</dd>
                  </dl>

                  <div className="bar">
                    <i className={`is-${risk.tone}`} style={{ width: `${pct}%` }} />
                  </div>

                  {cat.historical_example && (
                    <p style={{ margin: '0.75rem 0 0', fontSize: 'var(--ui-sm)', color: 'var(--muted)' }}>
                      {cat.historical_example}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------ the map */}
      <div className="panel" style={{ marginBottom: '2.5rem' }} data-reveal>
        <IndiaImpactMap />
      </div>

      {/* ---------------------------------------------------------- explain AI */}
      <div className="panel" data-reveal>
        <ModelExplanation />
      </div>
    </div>
  );
}

/* ── The dashboard's impact strip ───────────────────────── */

export function ImpactStrip({ onNavigate }) {
  const { flareClass } = useLiveState();
  const [data, setData] = useState(null);
  const lastFetched = useRef(null);

  /* A or B cannot reach any category above low, so there is nothing to
     strip. Deciding that during render — before the effect exists — means
     the strip never renders for a class that cannot produce one, rather
     than rendering and then clearing itself in an effect. */
  const letter = (flareClass || '').charAt(0).toUpperCase();
  const cannotImpact = letter === 'A' || letter === 'B' || letter === '';

  useEffect(() => {
    if (cannotImpact || !flareClass) return;
    if (flareClass === lastFetched.current) return;
    lastFetched.current = flareClass;

    let live = true;
    fetch(`/api/impact?flare_class=${encodeURIComponent(flareClass)}`)
      .then((r) => r.json())
      .then((d) => {
        if (live) setData(d);
      })
      .catch(() => {
        // Best-effort: the strip is a summary. The impact sheet is where a
        // refusal gets surfaced properly, with the failing call named.
      });
    return () => {
      live = false;
    };
  }, [flareClass, cannotImpact]);

  if (cannotImpact || !data || data.nominal) return null;

  const top = [...(data.categories || [])]
    .sort((a, b) => (ORDER[a.risk_level] ?? 4) - (ORDER[b.risk_level] ?? 4))
    .slice(0, 3);

  if (top.length === 0) return null;

  return (
    <button className="impactstrip" onClick={() => onNavigate?.('impact')} data-reveal>
      <span className="impactstrip__label">Impact</span>
      <span className="impactstrip__items">
        {top.map((cat) => {
          const risk = RISK[cat.risk_level] || RISK.low;
          return (
            <span key={cat.category} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className={`beacon beacon--sm beacon--${risk.tone}`} aria-hidden="true" />
              {cat.category}
              <span className={`stateword is-${risk.tone}`}>{risk.label}</span>
            </span>
          );
        })}
      </span>
      <span className="impactstrip__go">Open sheet 02 →</span>
    </button>
  );
}