import { useState, useEffect } from 'react';

function MetricCard({ label, value, subtitle, colorClass = 'text-[#D4DCE6]' }) {
  return (
    <div className="dash-card p-4 select-none">
      <div className="dash-card-header-left mb-2">
        <div className="dash-card-bar" style={{ background: colorClass.includes('green') ? '#34D399' : colorClass.includes('red') ? '#F87171' : colorClass.includes('blue') ? '#38BDF8' : '#FBBF24' }} />
        <span className="text-[9px] uppercase tracking-widest font-bold font-mono text-[#8B949E]">{label}</span>
      </div>
      <div className={`text-xl font-bold font-mono ${colorClass}`}>{value}</div>
      {subtitle && <div className="text-[9px] text-[#566176] font-mono mt-1 leading-normal">{subtitle}</div>}
    </div>
  );
}

export default function Metrics() {
  const [m, setM] = useState(null);

  useEffect(() => {
    fetch(`/api/metrics`)
      .then(r => r.json())
      .then(data => {
        setM({
          podM: data.podM,
          farM: data.farM,
          csiM: data.csiM,
          podX: data.podX,
          farX: data.farX,
          csiX: data.csiX,
          lead: data.meanLeadTime,
          tp: data.confusion.tp,
          fn: data.confusion.fn,
          fp: data.confusion.fp,
          tn: data.confusion.tn,
          skill: data.skillScore,
          total: data.totalEvents,
          period: data.testPeriod
        });
      })
      .catch(err => console.error("Metrics API offline", err));
  }, []);

  if (!m) {
    return (
      <div className="dash-card p-6 text-center py-12">
        <span className="text-[#8B949E] text-xs font-mono">Loading model validation metrics...</span>
      </div>
    );
  }

  return (
    <div className="premium-dash select-none">
      {/* Header */}
      <div className="dash-section-head">
        <span className="dash-section-tag">Validation</span>
        <h2 className="dash-section-title">Model Validation & Backtest</h2>
        <p className="dash-section-desc">
          TEST PERIOD: <span className="text-white font-bold">{m.period}</span> · N={m.total} EVENTS
        </p>
      </div>

      {/* M-Class section */}
      <div className="mb-6">
        <div className="dash-card-header-left mb-3">
          <div className="dash-card-bar" style={{ background: 'linear-gradient(180deg, #FFFFFF, #FBBF24)' }} />
          <span className="dash-card-title">M-Class & Above (Moderate Solar Storms)</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="POD" value={m.podM.toFixed(2)} subtitle="Probability of Detection" colorClass="text-green-400" />
          <MetricCard label="FAR" value={m.farM.toFixed(2)} subtitle="False Alarm Rate" colorClass={m.farM > 0.35 ? 'text-red-400' : 'text-yellow-400'} />
          <MetricCard label="CSI" value={m.csiM.toFixed(2)} subtitle="Critical Success Index" colorClass="text-blue-400" />
          <MetricCard label="Mean Lead Time" value={`+${m.lead} Min`} subtitle="Warning Advance vs GOES" colorClass="text-yellow-400" />
        </div>
      </div>

      {/* X-Class section */}
      <div className="mb-6">
        <div className="dash-card-header-left mb-3">
          <div className="dash-card-bar" style={{ background: 'linear-gradient(180deg, #F87171, #EF4444)' }} />
          <span className="dash-card-title">X-Class Events (Severe Space Weather)</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard label="POD (Severe)" value={m.podX.toFixed(2)} subtitle="Severe Detection Prob." colorClass="text-green-400" />
          <MetricCard label="FAR (Severe)" value={m.farX.toFixed(2)} subtitle="Severe False Alarm Rate" colorClass="text-green-400" />
          <MetricCard label="CSI (Severe)" value={m.csiX.toFixed(2)} subtitle="Severe Critical Success Index" colorClass="text-blue-400" />
        </div>
      </div>

      {/* Grid: Confusion Matrix & Skill Score */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Confusion Matrix */}
        <div className="dash-card p-5 md:col-span-2">
          <div className="dash-card-header-left mb-4">
            <div className="dash-card-bar" style={{ background: 'linear-gradient(180deg, #8B949E, #566176)' }} />
            <span className="dash-card-title">Confusion Matrix (2x2 Contingency Table)</span>
          </div>
          <div className="grid grid-cols-3 gap-2 max-w-md font-mono text-[10px]">
            <div />
            <div className="text-[#8B949E] font-bold text-center pb-1">PREDICTED +</div>
            <div className="text-[#8B949E] font-bold text-center pb-1">PREDICTED -</div>

            <div className="text-[#8B949E] font-bold flex items-center pr-2">ACTUAL +</div>
            <div className="bg-green-500/10 border border-green-500/30 rounded p-2.5 text-center transition-all hover:bg-green-500/15">
              <div className="text-lg font-black text-green-400">{m.tp}</div>
              <div className="text-[8px] text-[#566176] font-bold uppercase mt-0.5">True Positive (TP)</div>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded p-2.5 text-center transition-all hover:bg-red-500/15">
              <div className="text-lg font-black text-red-500">{m.fn}</div>
              <div className="text-[8px] text-[#566176] font-bold uppercase mt-0.5">False Negative (FN)</div>
            </div>

            <div className="text-[#8B949E] font-bold flex items-center pr-2">ACTUAL -</div>
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-2.5 text-center transition-all hover:bg-yellow-500/15">
              <div className="text-lg font-black text-yellow-500">{m.fp}</div>
              <div className="text-[8px] text-[#566176] font-bold uppercase mt-0.5">False Positive (FP)</div>
            </div>
            <div className="bg-[#0D1117]/60 border border-[#30363D] rounded p-2.5 text-center transition-all hover:border-[#8B949E]/30">
              <div className="text-lg font-black text-[#E6EDF3]">{m.tn}</div>
              <div className="text-[8px] text-[#566176] font-bold uppercase mt-0.5">True Negative (TN)</div>
            </div>
          </div>
        </div>

        {/* Skill Score Circle Card */}
        <div className="dash-card p-5 flex flex-col justify-between items-center text-center">
          <div className="dash-card-header-left mb-4 w-full">
            <div className="dash-card-bar" style={{ background: '#38BDF8' }} />
            <span className="dash-card-title">Heidke Skill Score (HSS)</span>
          </div>
          <div className="my-auto py-4 space-y-2">
            <div className="text-4xl font-black font-mono text-blue-400 drop-shadow-[0_0_12px_rgba(52,152,219,0.2)]">
              {m.skill.toFixed(2)}
            </div>
            <div className="text-[10px] text-[#8B949E] font-mono leading-relaxed px-2">
              HSS = {m.skill.toFixed(2)} vs GOES background cycle noise. Indicates high predictive performance above random chance.
            </div>
          </div>
          <div className="text-[8px] bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2 py-0.5 rounded font-mono font-bold uppercase">
            Climatology Validated
          </div>
        </div>
      </div>

      {/* Footer framework info */}
      <div className="dash-card p-4 font-mono text-[9px] text-[#566176] leading-relaxed">
        <span className="text-[#8B949E] font-bold block mb-1">EVALUATION METRIC DEFINITIONS:</span>
        • <span className="text-[#8B949E]">POD (Probability of Detection)</span> ensures no flares fire without alarm coverage.<br />
        • <span className="text-[#8B949E]">FAR (False Alarm Rate)</span> measures reliability to prevent operator alarm desensitization in control rooms.<br />
        • <span className="text-[#8B949E]">CSI (Critical Success Index)</span> models overall operational safety, balancing POD and FAR.<br />
        • <span className="text-[#8B949E]">Mean Lead Time</span> calculates the exact minutes of advance warning available before GOES soft X-ray fluxes exceed flare classification threshold levels.
      </div>
    </div>
  );
}
