import { useState, useEffect } from 'react';
import { useReveal } from '../useReveal.js';

/* The gate from pipeline/evaluation.py. A run below this does not get
   promoted, so it is printed below the gate rather than rounded up. */
const SKILL_GATE = 0.3;

function Metric({ label, value, note, tone = 'far' }) {
  return (
    <div className="readout">
      <span className="readout__k">{label}</span>
      <span className={`readout__v is-${tone}`}>{value}</span>
      {note && <span className="readout__sub">{note}</span>}
    </div>
  );
}

/* FAR is the metric that punishes a model for shouting. Past 0.35 the
   alarm rate would desensitise an operator, so it takes the hot end. */
function farTone(far) {
  if (far > 0.35) return 'refused';
  if (far > 0.2) return 'near';
  return 'mid';
}

function Cell({ value, label, tone, hint }) {
  return (
    <div style={{ border: '1.5px solid var(--rule)', padding: '0.9rem', background: 'var(--vellum)' }}>
      <div className={`readout__v is-${tone}`}>{value}</div>
      <div className="readout__k" style={{ marginTop: '0.35rem' }}>
        {label}
      </div>
      {hint && (
        <div style={{ fontSize: 'var(--ui-sm)', color: 'var(--muted)', marginTop: '0.25rem' }}>
          {hint}
        </div>
      )}
    </div>
  );
}

export default function Metrics() {
  const [m, setM] = useState(null);
  const [failed, setFailed] = useState(null);
  const ref = useReveal();

  useEffect(() => {
    let live = true;
    fetch('/api/metrics')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (live) setM(d);
      })
      .catch((err) => {
        if (live) setFailed(err.message || 'request failed');
      });
    return () => {
      live = false;
    };
  }, []);

  /* The route head, including the One Kicker, is rendered once and the body
     varies beneath it. Returning three separate heads for the loaded, loading
     and refused states put three kickers in the file and would have put a
     kicker on screen each time the state changed. */
  const head = (
    <div className="console__head">
      <div>
        <span className="eyebrow">Sheet 05 · model validation</span>
        <h1 className="title">Validation</h1>
      </div>
      <div className="console__status">
        {m && (
          <>
            <span className="muted">test period {m.testPeriod || '—'}</span>
            <span className="muted">n = {m.totalEvents ?? '—'}</span>
          </>
        )}
      </div>
    </div>
  );

  if (failed) {
    return (
      <div className="console">
        {head}
        <div className="gateblock" data-reveal>
          <div className="gateblock__head">
            <span className="gateblock__title">Metrics unavailable</span>
            <span className="gateblock__verdict">refused</span>
          </div>
          <p style={{ margin: 0, fontSize: 'var(--ui-sm)' }}>
            <code>GET /api/metrics</code> returned {failed}. These figures come from
            <code> scripts/evaluate.py</code> writing a backtest artifact — without that file
            there is no validation to show, and no substitute worth printing.
          </p>
          <button
            className="btn btn--ghost btn--sm"
            style={{ marginTop: '0.75rem' }}
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!m) {
    return (
      <div className="console">
        {head}
        <div className="calibrating">
          <div className="calibrating__bar">
            <i />
          </div>
          <span>Reading the backtest</span>
        </div>
      </div>
    );
  }

  const c = m.confusion || { tp: 0, fn: 0, fp: 0, tn: 0 };
  const skill = m.skillScore ?? 0;
  const passes = skill >= SKILL_GATE;

  return (
    <div className="console" ref={ref}>
      {head}

      {/* ------------------------------------------------------------- M-class */}
      <section style={{ marginBottom: '2.5rem' }} data-reveal>
        <div className="panel__head">
          <div>
            <h2>M-class and above</h2>
            <span className="readout__k">moderate storms · the events that reach the grid</span>
          </div>
        </div>
        <div className="readouts">
          <Metric label="POD" value={(m.podM ?? 0).toFixed(2)} note="probability of detection" tone="mid" />
          <Metric
            label="FAR"
            value={(m.farM ?? 0).toFixed(2)}
            note="false alarm rate"
            tone={farTone(m.farM ?? 0)}
          />
          <Metric label="CSI" value={(m.csiM ?? 0).toFixed(2)} note="critical success index" tone="far" />
          <Metric
            label="Mean lead"
            value={m.meanLeadTime != null ? `+${m.meanLeadTime}` : '—'}
            note="min vs GOES onset"
            tone="far"
          />
        </div>
      </section>

      {/* ------------------------------------------------------------- X-class */}
      <section style={{ marginBottom: '2.5rem' }} data-reveal>
        <div className="panel__head">
          <div>
            <h2>X-class</h2>
            <span className="readout__k">severe · the events that reach everything</span>
          </div>
        </div>
        <div className="readouts">
          <Metric label="POD" value={(m.podX ?? 0).toFixed(2)} note="severe detection" tone="mid" />
          <Metric label="FAR" value={(m.farX ?? 0).toFixed(2)} note="severe false alarm" tone={farTone(m.farX ?? 0)} />
          <Metric label="CSI" value={(m.csiX ?? 0).toFixed(2)} note="severe index" tone="far" />
        </div>
      </section>

      {/* ------------------------------------------- confusion + skill gate */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 3fr) minmax(18rem, 2fr)',
          gap: '1.5rem',
          alignItems: 'start',
          marginBottom: '2.5rem',
        }}
        className="dash-grid"
      >
        <div className="panel" data-reveal>
          <div className="panel__head">
            <div>
              <h2>Contingency table</h2>
              <span className="readout__k">every M-or-above sample the backtest scored</span>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr 1fr',
              gap: '1.5px',
              background: 'var(--rule)',
              border: '1.5px solid var(--rule)',
              maxWidth: '32rem',
            }}
          >
            <div style={{ background: 'var(--vellum-deep)' }} />
            <div
              className="readout__k"
              style={{ background: 'var(--vellum-deep)', padding: '0.6rem', textAlign: 'center' }}
            >
              predicted flare
            </div>
            <div
              className="readout__k"
              style={{ background: 'var(--vellum-deep)', padding: '0.6rem', textAlign: 'center' }}
            >
              predicted quiet
            </div>

            <div
              className="readout__k"
              style={{ background: 'var(--vellum-deep)', padding: '0.6rem', display: 'flex', alignItems: 'center' }}
            >
              was flare
            </div>
            <Cell value={c.tp} label="hit" tone="mid" hint="warned, and it happened" />
            <Cell value={c.fn} label="missed" tone="refused" hint="happened, and we were quiet" />

            <div
              className="readout__k"
              style={{ background: 'var(--vellum-deep)', padding: '0.6rem', display: 'flex', alignItems: 'center' }}
            >
              was quiet
            </div>
            <Cell value={c.fp} label="false alarm" tone="near" hint="we cried wolf" />
            <Cell value={c.tn} label="correct quiet" tone="far" hint="nothing, said nothing" />
          </div>

          <dl className="bench" style={{ marginTop: '1.5rem' }}>
            <dt>Total scored</dt>
            <dd>{(c.tp ?? 0) + (c.fn ?? 0) + (c.fp ?? 0) + (c.tn ?? 0)}</dd>
            <dt>Missed rate</dt>
            <dd className="is-refused">
              {((c.fn ?? 0) / Math.max(1, (c.tp ?? 0) + (c.fn ?? 0))).toFixed(2)}
            </dd>
            <dt>False alarm rate</dt>
            <dd className={farTone(m.farM ?? 0)}>
              {((c.fp ?? 0) / Math.max(1, (c.tp ?? 0) + (c.fp ?? 0))).toFixed(2)}
            </dd>
          </dl>
        </div>

        <div className="panel" data-reveal>
          <div className="panel__head">
            <div>
              <h2>Heidke skill score</h2>
              <span className="readout__k">against climatology</span>
            </div>
          </div>

          {/* The gate. Surfaced rather than smoothed: the verdict is the
              whole point of this panel. */}
          <div className={`readout__v is-lg ${passes ? 'is-mid' : 'is-refused'}`}>
            {skill.toFixed(2)}
          </div>
          <div style={{ margin: '0.85rem 0 1.25rem' }}>
            <span className={`stateword ${passes ? 'is-mid' : 'is-refused'}`}>
              {passes ? 'above gate' : 'below gate'}
            </span>
          </div>

          <div className="gatemeter" aria-hidden="true">
            <i style={{ '--pass': Math.min(1, skill) }} />
          </div>
          <p className="gatemeter__legend">
            Gate at <b>{SKILL_GATE.toFixed(2)}</b>. HSS compares the model against a
            climatological baseline that always predicts the most common class, so a model
            cannot score by being confidently wrong.
          </p>

          <div style={{ marginTop: '1.5rem' }}>
            <dl className="bench">
              <dt>Test period</dt>
              <dd>{m.testPeriod || '—'}</dd>
              <dt>Events</dt>
              <dd>{m.totalEvents ?? '—'}</dd>
              <dt>Mean lead</dt>
              <dd>{m.meanLeadTime != null ? `+${m.meanLeadTime} min` : '—'}</dd>
            </dl>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------- definitions */}
      <div className="panel" data-reveal>
        <div className="panel__head">
          <div>
            <h2>How each figure is computed</h2>
            <span className="readout__k">so the numbers can be argued with</span>
          </div>
        </div>
        <dl className="bench" style={{ gridTemplateColumns: 'minmax(8rem, auto) 1fr' }}>
          <dt>POD</dt>
          <dd style={{ textAlign: 'left', fontWeight: 400, color: 'var(--body)' }}>
            Hits ÷ (hits + missed). A flare nobody warned about is the failure that costs a
            satellite an hour of safe mode.
          </dd>
          <dt>FAR</dt>
          <dd style={{ textAlign: 'left', fontWeight: 400, color: 'var(--body)' }}>
            False alarms ÷ (hits + false alarms). Past 0.35 an operator starts ignoring the
            channel, which costs more than any single miss.
          </dd>
          <dt>CSI</dt>
          <dd style={{ textAlign: 'left', fontWeight: 400, color: 'var(--body)' }}>
            Hits ÷ (hits + missed + false alarms). Falls when either error grows, so it cannot
            be traded one-for-one against the other.
          </dd>
          <dt>Lead time</dt>
          <dd style={{ textAlign: 'left', fontWeight: 400, color: 'var(--body)' }}>
            Minutes between the first warning above threshold and GOES soft X-ray onset. Quoted
            against GOES because that is the reference the sector already runs on.
          </dd>
          <dt>HSS</dt>
          <dd style={{ textAlign: 'left', fontWeight: 400, color: 'var(--body)' }}>
            Skill against a climatological baseline. Zero means no better than always guessing
            the most common class; one means perfect.
          </dd>
        </dl>
      </div>
    </div>
  );
}