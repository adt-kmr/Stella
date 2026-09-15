import { useState } from 'react';
import FluxChart from './FluxChart';
import StatusBlock from './StatusBlock';
import AlertList from './AlertList';
import HardnessMeter from './HardnessMeter';
import DataSourcePanel from './DataSourcePanel';
import { ImpactStrip } from './ImpactPanel';
import { useLiveState, fmtFlux } from '../lib/data';

function HeroCard({ tag, value, sub, color, badge, delay }) {
  return (
    <div className="dash-hero-card" style={{ animationDelay: `${delay}s` }}>
      <span className="dash-hero-tag">{tag}</span>
      <div className="dash-hero-value" style={color ? { color } : {}}>
        {value}
        {badge && <span className="dash-hero-badge">{badge}</span>}
      </div>
      {sub && <span className="dash-hero-sub">{sub}</span>}
    </div>
  );
}

export default function Dashboard({ onNavigate }) {
  const [range, setRange] = useState(6);
  const { fluxData, alerts, hardnessRatio, nowcast, forecast, systemStatus } = useLiveState();

  const isFlare = nowcast.class !== '—' || nowcast.currentPhase?.includes('Onset') || nowcast.currentPhase?.includes('Peak');
  const stateColor = isFlare ? '#F87171' : hardnessRatio.preFlareSignal ? '#FBBF24' : systemStatus.stateColor || '#34D399';

  return (
    <div className="premium-dash">
      {/* ===== HERO STATS BAR ===== */}
      <div className="dash-hero">
        <HeroCard tag="Solar State" value={systemStatus.stateLabel} color={stateColor} delay={0.02} />
        <HeroCard tag="Nowcast" value={nowcast.class} sub={`Z-Score: ${nowcast.zScore.toFixed(1)}σ`} color={isFlare ? '#F87171' : '#34D399'} delay={0.06} />
        <HeroCard tag="Forecast (3h)" value={`${forecast.probability}%`} sub={forecast.nextClass} delay={0.10} />
        <HeroCard tag="Peak Flux" value={fmtFlux(nowcast.peakFlux)} sub="W/m²" delay={0.14} />
        <HeroCard tag="Hardness Ratio" value={hardnessRatio.current.toFixed(4)} badge={hardnessRatio.preFlareSignal ? `⚠ +${hardnessRatio.minutesEarly}m` : undefined} color={hardnessRatio.preFlareSignal ? '#FBBF24' : ''} delay={0.18} />
        <HeroCard tag="Lead Time" value={`+${forecast.leadTime || 0} min`} sub="vs GOES onset" delay={0.22} />
      </div>

      {/* ===== IMPACT SUMMARY STRIP ===== */}
      <ImpactStrip onNavigate={onNavigate} />

      {/* ===== MAIN GRID: Chart + Status ===== */}
      <div className="premium-dash-grid">
        <div className="dash-card dash-card-delay-1">
          <FluxChart data={fluxData} range={range} onRange={setRange} />
        </div>
        <div className="dash-card dash-card-delay-2">
          <StatusBlock />
        </div>
      </div>

      {/* ===== BOTTOM GRID ===== */}
      <div className="premium-dash-bottom">
        <div className="dash-card dash-card-delay-3">
          <HardnessMeter data={hardnessRatio} fluxData={fluxData} />
        </div>
        <div className="dash-card dash-card-delay-3">
          <AlertList alerts={alerts} />
        </div>
        <div className="dash-card dash-card-delay-3">
          <DataSourcePanel />
        </div>
      </div>


    </div>
  );
}
