import { useState, useEffect } from 'react';
import { useLiveState } from '../lib/data.js';

/* Feature direction → Measured Colour. Positive contribution is the hot
   end because it is driving the class up right now. */
const DIRECTIONS = {
  positive: { tone: 'near', label: 'driving' },
  critical: { tone: 'refused', label: 'critical' },
  warning: { tone: 'near', label: 'elevated' },
  slight_positive: { tone: 'near', label: 'subtle' },
  elevated: { tone: 'near', label: 'elevated' },
  stable: { tone: 'mid', label: 'stable' },
  baseline: { tone: 'far', label: 'baseline' },
  neutral: { tone: 'far', label: 'neutral' },
};

const NOTES = [
  [
    'Spectral hardness',
    'Flaring coronal loops accelerate electrons, so hard X-ray counts climb before the soft thermal flux peaks. That lead is what makes a pre-flare warning possible at all.',
  ],
  [
    'Rise rate and Z-score',
    'Detects sudden flux jumps against a rolling quiet-Sun baseline. The threshold is derived from the median absolute deviation rather than fixed, because the quiet-Sun level drifts.',
  ],
  [
    'TCN temporal context',
    'Dilated causal convolutions read the three-hour history at several scales, so a sustained climb reads differently from a single spike.',
  ],
];

function FeatureBar({ name, value, importance, direction, description }) {
  const dir = DIRECTIONS[direction] || DIRECTIONS.stable;
  const pct = Math.max(2, Math.min(100, importance * 100));

  return (
    <div className="feat">
      <div className="feat__head">
        <span className="feat__name">{name}</span>
        <span className={`stateword is-${dir.tone}`}>{dir.label}</span>
        <span className="feat__pct">{pct.toFixed(0)}%</span>
      </div>
      <div className="bar">
        <i className={`is-${dir.tone}`} style={{ width: `${pct}%` }} />
      </div>
      {/* The value is printed rather than hidden behind a hover: a
          contribution you cannot read is not much of an explanation. */}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'space-between', marginTop: '0.35rem' }}>
        <span style={{ fontSize: 'var(--ui-sm)', color: 'var(--muted)' }}>
          {value.toExponential(2)}
        </span>
        <span style={{ fontSize: 'var(--ui-sm)', color: 'var(--muted)' }}>{description}</span>
      </div>
    </div>
  );
}

export default function ModelExplanation() {
  const { flareClass } = useLiveState();
  const [state, setState] = useState({ key: null, data: null, failed: null });

  const key = flareClass || null;

  useEffect(() => {
    if (!key) return;
    let live = true;

    fetch(`/api/explain?flare_class=${encodeURIComponent(key)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        // The response is stored under the class it was requested for, so a
        // class change mid-flight cannot leave one class's attribution on
        // screen under another's heading.
        if (live) setState({ key, data: d, failed: null });
      })
      .catch((err) => {
        if (live) setState({ key, data: null, failed: err.message || 'request failed' });
      });

    return () => {
      live = false;
    };
  }, [key]);

  // Only ever show a result that belongs to the class currently on screen.
  const settled = state.key === key ? state : { data: null, failed: null };
  const data = settled.data;

  if (settled.failed) {
    return (
      <div className="gateblock">
        <div className="gateblock__head">
          <span className="gateblock__title">Attribution unavailable</span>
          <span className="gateblock__verdict">refused</span>
        </div>
        <p style={{ margin: 0, fontSize: 'var(--ui-sm)' }}>
          <code>GET /api/explain?flare_class={flareClass}</code> returned {settled.failed}.
          Feature contributions are computed per event class, so there is nothing to attribute
          without it.
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
        <span>Attributing the decision for {flareClass || 'the current class'}</span>
      </div>
    );
  }

  const pred = data.prediction;
  const features = [...data.features].sort((a, b) => b.importance - a.importance);
  const conf = pred.confidence ?? 0;
  const confTone = conf > 0.7 ? 'mid' : conf > 0.4 ? 'near' : 'refused';

  return (
    <>
      <div className="panel__head">
        <div>
          <h2>Why this class</h2>
          <span className="readout__k">
            feature attribution for {data.flareClass} · recomputed on class change
          </span>
        </div>
        <span className={`stateword is-${confTone}`}>
          {pred.class} · {(conf * 100).toFixed(0)}% confidence
        </span>
      </div>

      <div className="console__grid">
        <div>
          <p style={{ margin: '0 0 1.25rem', fontSize: 'var(--ui-base)', color: 'var(--body)', maxWidth: '60ch' }}>
            {data.explanation}
          </p>

          {data.topContributors?.length > 0 && (
            <>
              <span className="readout__k" style={{ display: 'block', marginBottom: '0.5rem' }}>
                Largest contributors
              </span>
              <ul className="tags" style={{ marginBottom: '1.5rem' }}>
                {data.topContributors.map((name, i) => (
                  <li key={i}>
                    {i + 1}. {name}
                  </li>
                ))}
              </ul>
            </>
          )}

          <span className="readout__k" style={{ display: 'block', marginBottom: '0.25rem' }}>
            All features, by importance
          </span>
          <div>
            {features.map((f, i) => (
              <FeatureBar key={i} {...f} />
            ))}
          </div>
        </div>

        {/* What the three inputs that matter actually mean. Kept beside
            the attribution so a reader does not have to leave the sheet
            to learn what a hardness ratio is. */}
        <div>
          <div className="panel__head">
            <div>
              <h2>What these inputs are</h2>
              <span className="readout__k">so the attribution can be argued with</span>
            </div>
          </div>
          <dl className="bench" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
            {NOTES.map(([term, body]) => (
              <div key={term} style={{ padding: '0.85rem 0', borderBottom: '1.5px solid var(--rule)' }}>
                <dt
                  style={{
                    display: 'block',
                    borderBottom: 0,
                    padding: 0,
                    color: 'var(--graphite)',
                    fontWeight: 700,
                    fontFamily: 'var(--display)',
                    letterSpacing: '0.04em',
                  }}
                >
                  {term}
                </dt>
                <dd
                  style={{
                    borderBottom: 0,
                    padding: '0.35rem 0 0',
                    textAlign: 'left',
                    fontWeight: 400,
                    fontSize: 'var(--ui-sm)',
                    color: 'var(--body)',
                    lineHeight: 1.6,
                  }}
                >
                  {body}
                </dd>
              </div>
            ))}
          </dl>
          <p style={{ margin: '1rem 0 0', fontSize: 'var(--ui-sm)', color: 'var(--muted)' }}>
            Contributions are SHAP-style feature attributions: each input's share of the distance
            between the model output and its baseline. They describe this decision, not the Sun.
          </p>
        </div>
      </div>
    </>
  );
}