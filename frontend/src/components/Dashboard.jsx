import { useState } from 'react';
import FluxChart from './FluxChart.jsx';
import StatusBlock from './StatusBlock.jsx';
import AlertList from './AlertList.jsx';
import HardnessMeter from './HardnessMeter.jsx';
import DataSourcePanel from './DataSourcePanel.jsx';
import { ImpactStrip } from './ImpactPanel.jsx';
import { useLiveState, fmtFlux } from '../lib/data.js';
import { useReveal } from '../useReveal.js';

/* Measured Colour: one mapping, used by every readout on this sheet.
   Orange is happening now, teal is identified, indigo is settled,
   red is refused. */
function flareState(nowcast, hardnessRatio) {
  const phase = nowcast.currentPhase || 'Quiet Sun';
  if (nowcast.class !== '—' || /Onset|Peak|Decay/.test(phase)) {
    return { tone: 'near', word: 'flare in progress' };
  }
  if (hardnessRatio.preFlareSignal || /Warning|Elevated/.test(phase)) {
    return { tone: 'near', word: 'pre-flare warning' };
  }
  return { tone: 'mid', word: 'quiet sun' };
}

export default function Dashboard() {
  const [range, setRange] = useState(6);
  const { fluxData, alerts, hardnessRatio, nowcast, forecast, systemStatus } = useLiveState();
  const ref = useReveal();

  const state = flareState(nowcast, hardnessRatio);
  const pipelineOnline = systemStatus.pipeline === 'Operational';

  return (
    <div className="console" ref={ref}>
      {/* The One Kicker for this route, once. */}
      <div className="console__head">
        <div>
          <span className="eyebrow">Sheet 01 · live nowcast</span>
          <h1 className="title">Nowcast console</h1>
        </div>
        <div className="console__status">
          <span className={`stateword is-${pipelineOnline ? 'mid' : 'refused'}`}>
            {pipelineOnline ? 'pipeline online' : systemStatus.pipeline?.toLowerCase() || 'offline'}
          </span>
          <span className="muted">{systemStatus.modelVersion}</span>
        </div>
      </div>

      {/* ------------------------------------------------------------ readouts */}
      <div className="readouts" data-reveal style={{ marginBottom: '2.5rem' }}>
        <div className="readout">
          <span className="readout__k">Solar state</span>
          <span className={`readout__v is-${state.tone}`}>{systemStatus.stateLabel || '—'}</span>
          <span className={`readout__sub stateword is-${state.tone}`}>{state.word}</span>
        </div>

        <div className="readout">
          <span className="readout__k">Nowcast</span>
          <span className={`readout__v is-${state.tone}`}>{nowcast.class}</span>
          <span className="readout__sub">
            z {nowcast.zScore.toFixed(1)}σ · {(nowcast.confidence * 100).toFixed(0)}% conf
          </span>
        </div>

        <div className="readout">
          <span className="readout__k">Forecast 3h</span>
          <span className="readout__v is-far">{forecast.probability}%</span>
          <span className="readout__sub">{forecast.nextClass || '—'}</span>
        </div>

        <div className="readout">
          <span className="readout__k">Peak flux</span>
          <span className="readout__v">{fmtFlux(nowcast.peakFlux)}</span>
          <span className="readout__sub">W/m²</span>
        </div>

        <div className="readout">
          <span className="readout__k">Hardness</span>
          <span
            className={`readout__v is-${hardnessRatio.preFlareSignal ? 'near' : 'mid'}`}
          >
            {hardnessRatio.current.toFixed(4)}
          </span>
          <span className="readout__sub">
            {hardnessRatio.preFlareSignal
              ? `+${hardnessRatio.minutesEarly} min early`
              : `limit 0.0600`}
          </span>
        </div>

        <div className="readout">
          <span className="readout__k">Lead time</span>
          <span className="readout__v is-far">
            {forecast.leadTime ? `+${forecast.leadTime}` : '—'}
          </span>
          <span className="readout__sub">min vs GOES onset</span>
        </div>
      </div>

      <ImpactStrip />

      {/* --------------------------------------------------------------- grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 7fr) minmax(20rem, 5fr)',
          gap: '1.5rem',
          alignItems: 'start',
        }}
        className="dash-grid"
      >
        <div className="panel" data-reveal>
          <FluxChart data={fluxData} range={range} onRange={setRange} />
        </div>

        <div className="panel" data-reveal>
          <StatusBlock />
        </div>

        <div className="panel" data-reveal>
          <HardnessMeter data={hardnessRatio} fluxData={fluxData} />
        </div>

        <div className="panel" data-reveal>
          <AlertList alerts={alerts} />
        </div>

        <div className="panel" data-reveal>
          <DataSourcePanel />
        </div>
      </div>
    </div>
  );
}