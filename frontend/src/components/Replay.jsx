import { useState, useEffect, useCallback } from 'react';
import { formatUTC, fmtFlux } from '../lib/data.js';
import { useReveal } from '../useReveal.js';

const SPEEDS = [1, 5, 10, 50, 100];
const SOURCES = ['PRADAN', 'GOES', 'SIMULATED'];

/* The hardness threshold, quoted so the replay can say whether the
   pre-flare warning would have fired at this point in the event. */
const THRESHOLD = 0.06;

export default function Replay({ event }) {
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [speed, setSpeed] = useState(10);
  const [source, setSource] = useState('PRADAN');
  const [points, setPoints] = useState(null);
  const [failed, setFailed] = useState(null);
  const ref = useReveal();

  const eventId = event?.id ?? 6;

  useEffect(() => {
    let live = true;
    setPoints(null);
    setFailed(null);
    setCursor(0);
    setPlaying(false);

    fetch(`/api/replay/${eventId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (live) setPoints(d.points || []);
      })
      .catch((err) => {
        if (live) {
          setFailed(err.message || 'request failed');
          setPoints([]);
        }
      });

    return () => {
      live = false;
    };
  }, [eventId]);

  // The scrub interval. Paused on the last sample rather than wrapping,
  // because a replay that silently restarts reads as a glitch.
  useEffect(() => {
    if (!playing || !points || points.length === 0) return;
    const timer = setInterval(() => {
      setCursor((c) => {
        if (c + 1 >= points.length) {
          setPlaying(false);
          return c;
        }
        return c + 1;
      });
    }, 1000 / speed);
    return () => clearInterval(timer);
  }, [playing, speed, points]);

  const seek = useCallback(
    (e) => {
      if (!points || points.length === 0) return;
      const r = e.currentTarget.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      setCursor(Math.min(points.length - 1, Math.floor(frac * points.length)));
    },
    [points]
  );

  const reset = () => {
    setCursor(0);
    setPlaying(false);
  };

  const at = points && points.length > 0 ? points[cursor] : null;
  const pct = points && points.length > 1 ? (cursor / (points.length - 1)) * 100 : 0;

  const controls = (
    <div className="panel" data-reveal>
      <div className="panel__head">
        <div>
          <h2>Transport</h2>
          <span className="readout__k">step through a recorded event one sample at a time</span>
        </div>
        {at && (
          <span className="readout__k">
            {formatUTC(at.timestamp).slice(11)}Z
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button
            className="btn btn--sm"
            onClick={() => setPlaying((p) => !p)}
            disabled={!points || points.length === 0}
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <button className="btn btn--ghost btn--sm" onClick={reset} disabled={!points}>
            Reset
          </button>
        </div>

        <div>
          <span className="readout__k" style={{ display: 'block', marginBottom: '0.4rem' }}>
            Acceleration
          </span>
          <div className="seg" role="group" aria-label="Playback speed">
            {SPEEDS.map((s) => (
              <button key={s} aria-pressed={speed === s} onClick={() => setSpeed(s)}>
                {s}×
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="readout__k" style={{ display: 'block', marginBottom: '0.4rem' }}>
            Stream source
          </span>
          <div className="seg" role="group" aria-label="Telemetry source">
            {SOURCES.map((s) => (
              <button key={s} aria-pressed={source === s} onClick={() => setSource(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <span className="readout__k" style={{ display: 'block' }}>
            Progress
          </span>
          <span className="readout__v">{pct.toFixed(0)}%</span>
        </div>
      </div>

      {/* The seek track. A 10-tick ruler, so a position can be cited. */}
      <div style={{ marginTop: '1.25rem' }}>
        <div
          className="seek"
          onClick={seek}
          role="slider"
          tabIndex={0}
          aria-label="Replay position"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          onKeyDown={(e) => {
            if (!points || points.length === 0) return;
            if (e.key === 'ArrowRight') setCursor((c) => Math.min(points.length - 1, c + 1));
            if (e.key === 'ArrowLeft') setCursor((c) => Math.max(0, c - 1));
          }}
        >
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="seeklabel">
          <span>
            {points && points.length > 0
              ? `+${Math.round((cursor * 10) / 60)} min into event`
              : 'no samples loaded'}
          </span>
          <span>
            {points && points.length > 0 ? `${cursor + 1} of ${points.length} samples` : ''}
          </span>
        </div>
      </div>
    </div>
  );

  const body = () => {
    if (failed) {
      return (
        <div className="gateblock" style={{ maxWidth: 'none' }}>
          <div className="gateblock__head">
            <span className="gateblock__title">Replay unavailable</span>
            <span className="gateblock__verdict">refused</span>
          </div>
          <p style={{ margin: 0, fontSize: 'var(--ui-sm)' }}>
            <code>GET /api/replay/{eventId}</code> returned {failed}. The replay stream is
            reconstructed from stored samples, so an unreachable pipeline leaves nothing to scrub
            through.
          </p>
        </div>
      );
    }

    if (points === null) {
      return (
        <div className="calibrating">
          <div className="calibrating__bar">
            <i />
          </div>
          <span>Reconstructing the event</span>
        </div>
      );
    }

    if (points.length === 0) {
      return (
        <div className="absent">
          <p>No stored samples for event {eventId}.</p>
          <p>
            The pipeline writes a replay buffer per detected event. This one has not been
            captured yet.
          </p>
        </div>
      );
    }

    return (
      <>
        <div className="panel" data-reveal>
          <div className="panel__head">
            <div>
              <h2>Replayed telemetry</h2>
              <span className="readout__k">
                {source} stream · {points.length} samples
              </span>
            </div>
            {at?.status?.hardnessRatio?.preFlareSignal && (
              <span className="stateword is-near">
                pre-flare warning · +{at.status.hardnessRatio.minutesEarly} min
              </span>
            )}
          </div>

          <div className="readouts" style={{ marginBottom: '1.5rem' }}>
            <div className="readout">
              <span className="readout__k">SoLEXS soft</span>
              <span className="readout__v is-near">{fmtFlux(at?.softFlux ?? 5e-8)}</span>
              <span className="readout__sub">W/m²</span>
            </div>
            <div className="readout">
              <span className="readout__k">HEL1OS hard</span>
              <span className="readout__v is-far">{fmtFlux(at?.hardFlux ?? 3e-9)}</span>
              <span className="readout__sub">W/m² equivalent</span>
            </div>
            <div className="readout">
              <span className="readout__k">Hardness</span>
              <span
                className={`readout__v is-${(at?.hardnessRatio ?? 0) >= THRESHOLD ? 'near' : 'mid'}`}
              >
                {(at?.hardnessRatio ?? 0).toFixed(4)}
              </span>
              <span className="readout__sub">limit {THRESHOLD.toFixed(2)}</span>
            </div>
          </div>

          {/* What the models believed at this instant in the event. */}
          {at?.status && (
            <>
              <div className="panel__head" style={{ marginBottom: '1rem' }}>
                <div>
                  <h2>Model state at this sample</h2>
                  <span className="readout__k">
                    the same inferences the live sheet would have shown
                  </span>
                </div>
              </div>
              <dl className="bench">
                <dt>Nowcast</dt>
                <dd className="is-near">
                  {at.status.nowcast.class} · {at.status.nowcast.currentPhase}
                </dd>
                <dt>Forecast probability</dt>
                <dd className="is-far">{at.status.forecast.probability}%</dd>
                <dt>Z-score</dt>
                <dd>{at.status.nowcast.zScore.toFixed(2)}σ</dd>
                <dt>Solar state</dt>
                <dd>{at.status.systemStatus?.stateLabel ?? '—'}</dd>
              </dl>
            </>
          )}
        </div>

        {event && (
          <div className="panel" style={{ marginTop: '1.5rem' }} data-reveal>
            <div className="panel__head">
              <div>
                <h2>Event under replay</h2>
                <span className="readout__k">as recorded in the catalog</span>
              </div>
            </div>
            <dl className="bench">
              <dt>Class</dt>
              <dd className="is-near">{event.cls}</dd>
              <dt>Peak flux</dt>
              <dd>{event.peak.toExponential(2)} W/m²</dd>
              <dt>Lead time</dt>
              <dd className="is-mid">
                {event.lead > 0 ? `+${event.lead} min` : 'did not precede onset'}
              </dd>
              <dt>Confidence</dt>
              <dd>{event.conf > 0 ? `${event.conf}%` : '—'}</dd>
              <dt>Instruments</dt>
              <dd>{event.instrument || event.instr}</dd>
              <dt>Duration</dt>
              <dd>{event.duration || event.dur}</dd>
            </dl>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="console" ref={ref}>
      <div className="console__head">
        <div>
          <span className="eyebrow">Sheet 03 · historical replay</span>
          <h1 className="title">Event replay</h1>
        </div>
        {event && (
          <div className="console__status">
            <span className="stateword is-near">{event.cls}</span>
            <span className="muted">{formatUTC(event.ts)}</span>
          </div>
        )}
      </div>

      {controls}
      <div style={{ marginTop: '1.5rem' }}>{body()}</div>
    </div>
  );
}