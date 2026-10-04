import { useLiveState } from '../lib/data.js';

/** The same Measured Colour mapping as the readouts, kept in one place so
    the sheet and the chart cannot disagree about what a phase means. */
function phaseTone(phase, hasClass) {
  if (hasClass || /Onset|Peak|Decay/.test(phase)) return 'near';
  if (/Warning|Elevated/.test(phase)) return 'near';
  return 'mid';
}

export default function StatusBlock() {
  const { nowcast, forecast, systemStatus } = useLiveState();

  const phase = nowcast.currentPhase || 'Quiet Sun';
  const tone = phaseTone(phase, nowcast.class !== '—');
  const online = systemStatus.pipeline === 'Operational';

  return (
    <>
      <div className="panel__head">
        <div>
          <h2>Mission status</h2>
          <span className="readout__k">nowcast engine · TCN-8L forecaster</span>
        </div>
        <span className={`stateword is-${tone}`}>{phase}</span>
      </div>

      {/* ------------------------------------------------------------ nowcast */}
      <div style={{ marginBottom: '1.5rem' }}>
        <span className="readout__k">Nowcast class</span>
        <div className={`readout__v is-lg is-${tone}`} style={{ marginTop: '0.25rem' }}>
          {nowcast.class}
        </div>
      </div>

      <dl className="bench" style={{ marginBottom: '1.5rem' }}>
        <dt>Peak flux</dt>
        <dd>
          {nowcast.peakFlux.toExponential(2)} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>W/m²</span>
        </dd>
        <dt>Z-score</dt>
        <dd className={nowcast.zScore >= nowcast.adaptiveThreshold ? 'is-near' : ''}>
          {nowcast.zScore.toFixed(1)}σ
        </dd>
        <dt>Adaptive threshold</dt>
        <dd>{nowcast.adaptiveThreshold.toFixed(1)}σ</dd>
        <dt>Rolling MAD</dt>
        <dd>{nowcast.rollingMAD.toExponential(2)}</dd>
        <dt>Confidence</dt>
        <dd className="is-mid">{(nowcast.confidence * 100).toFixed(0)}%</dd>
        <dt>Onset</dt>
        <dd>{nowcast.onset}</dd>
        <dt>Peak time</dt>
        <dd>{nowcast.peakTime}</dd>
      </dl>

      {/* ----------------------------------------------------------- forecast */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: '1rem',
            marginBottom: '0.5rem',
          }}
        >
          <span className="readout__k">Forecast, next 3h</span>
          <span className="readout__v is-far">{forecast.probability}%</span>
        </div>
        <div className="bar">
          <i className="is-far" style={{ width: `${Math.max(1, forecast.probability)}%` }} />
        </div>
      </div>

      <dl className="bench">
        <dt>Target class</dt>
        <dd>{forecast.nextClass || '—'}</dd>
        <dt>Lead time</dt>
        <dd>{forecast.leadTime ? `+${forecast.leadTime} min` : 'not yet beat onset'}</dd>
        <dt>TCN confidence</dt>
        <dd>{(forecast.tcnConfidence * 100).toFixed(0)}%</dd>
        <dt>Window</dt>
        <dd>
          {forecast.windowStart} → {forecast.windowEnd}
        </dd>
      </dl>

      {/* ------------------------------------------------------------- system */}
      <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1.5px solid var(--rule)' }}>
        <dl className="bench">
          <dt>Pipeline</dt>
          <dd className={online ? 'is-mid' : 'is-refused'}>
            {online ? 'operational' : systemStatus.pipeline || 'unknown'}
          </dd>
          <dt>Aditya-L1</dt>
          <dd className={systemStatus.al1Sync === 'Healthy' ? 'is-mid' : 'is-near'}>
            {systemStatus.al1Sync || '—'}
          </dd>
          <dt>PRADAN</dt>
          <dd className={systemStatus.pradanSync === 'Healthy' ? 'is-mid' : 'is-near'}>
            {systemStatus.pradanSync || '—'}
          </dd>
          <dt>Latency</dt>
          <dd>{systemStatus.dataLatency || '—'}</dd>
          <dt>Model</dt>
          <dd>TCN-8L {systemStatus.modelVersion}</dd>
        </dl>
      </div>
    </>
  );
}