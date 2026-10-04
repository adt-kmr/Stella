import { useLiveState, transferLearning } from '../lib/data.js';

/* A field table rather than nested cards: a panel inside a panel is a
   layout failure, so this sheet is a single surface divided by
   hairlines. */
function FieldGroup({ title, tone = 'mid', children }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '0.6rem',
          marginBottom: '0.6rem',
          paddingBottom: '0.5rem',
          borderBottom: '1.5px solid var(--rule)',
        }}
      >
        <span className={`beacon beacon--sm beacon--${tone}`} aria-hidden="true" />
        <span className="readout__k">{title}</span>
      </div>
      {children}
    </div>
  );
}

export default function DataSourcePanel() {
  const { systemStatus, nowcast } = useLiveState();
  const al1 = systemStatus.al1Sync === 'Healthy';

  return (
    <>
      <div className="panel__head">
        <div>
          <h2>Instruments</h2>
          <span className="readout__k">what the readings come from</span>
        </div>
        <span className={`stateword is-${al1 ? 'mid' : 'near'}`}>
          {al1 ? 'Aditya-L1 synced' : 'Aditya-L1 degraded'}
        </span>
      </div>

      {/* ------------------------------------------------- the active platform */}
      <FieldGroup title="Aditya-L1 · L1 halo orbit" tone={al1 ? 'mid' : 'near'}>
        <dl className="bench">
          <dt>SoLEXS</dt>
          <dd>
            {nowcast.peakFlux.toExponential(2)} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>W/m²</span>
          </dd>
          <dt>SoLEXS band</dt>
          <dd>soft X-ray · SDD1+SDD2 · 0.1–0.8 nm</dd>
          <dt>HEL1OS</dt>
          <dd>
            CdTe+CZT · hard X-ray · 5–150 keV
          </dd>
          <dt>Cadence</dt>
          <dd>60 s</dd>
          <dt>Station</dt>
          <dd>{systemStatus.pradanSync || '—'}</dd>
        </dl>
      </FieldGroup>

      {/* -------------------------------------------------- reference channel */}
      <FieldGroup title="GOES XRS · reference" tone="far">
        <dl className="bench">
          <dt>Channels</dt>
          <dd>0.5–0.8 nm · 1–8 Å</dd>
          <dt>Role</dt>
          <dd>pre-training source</dd>
          <dt>Record</dt>
          <dd>continuous since 1996</dd>
        </dl>
      </FieldGroup>

      {/* ------------------------------------------------------ transfer path */}
      <FieldGroup title="Transfer learning" tone="far">
        <dl className="bench">
          <dt>Source</dt>
          <dd>{transferLearning.source}</dd>
          <dt>Target</dt>
          <dd>{transferLearning.target}</dd>
          <dt>Adaptation</dt>
          <dd>{transferLearning.domainAdaptation}</dd>
          <dt>Fine-tune set</dt>
          <dd>{transferLearning.fineTuneSamples} samples</dd>
          <dt>Epochs</dt>
          <dd>
            {transferLearning.pretrainEpochs} pre · {transferLearning.finetuneEpochs} fine
          </dd>
          <dt>Validation split</dt>
          <dd>{transferLearning.validationSplit}</dd>
        </dl>
      </FieldGroup>

      {/* -------------------------------------------------------- the network */}
      <FieldGroup title="Architecture" tone="far">
        <dl className="bench">
          <dt>Nowcast</dt>
          <dd>CNN classifier</dd>
          <dt>Forecaster</dt>
          <dd>TCN-8L</dd>
          <dt>Layers</dt>
          <dd>8 dilated causal</dd>
          <dt>Input</dt>
          <dd>dual-band feature trajectory</dd>
          <dt>Version</dt>
          <dd>{systemStatus.modelVersion}</dd>
        </dl>
      </FieldGroup>
    </>
  );
}