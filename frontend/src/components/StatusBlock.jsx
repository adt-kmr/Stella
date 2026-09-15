import { useLiveState } from '../lib/data';

export default function StatusBlock() {
  const { nowcast, forecast, systemStatus } = useLiveState();
  
  const phase = nowcast.currentPhase || 'Quiet Sun';
  const isWatch = phase.includes('Warning') || phase.includes('Elevated');
  const isFlare = phase.includes('Onset') || phase.includes('Peak') || phase.includes('Decay') || nowcast.class !== '—';
  
  let stateColor = '#34D399';
  let stateGlow = 'rgba(52,211,153,0.15)';
  if (isFlare) { stateColor = '#F87171'; stateGlow = 'rgba(248,113,113,0.25)'; }
  else if (isWatch) { stateColor = '#FBBF24'; stateGlow = 'rgba(251,191,36,0.2)'; }

  return (
    <div className="h-full flex flex-col" style={{ boxShadow: `0 4px 24px ${stateGlow}` }}>
      {/* Header */}
      <div className="dash-card-header">
        <div className="dash-card-header-left">
          <div className="dash-card-bar" style={{ background: stateColor }} />
          <span className="dash-card-title">Mission Status</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: stateColor }} />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: stateColor, boxShadow: `0 0 12px ${stateGlow}` }} />
          </span>
          <span className="text-[10px] font-bold uppercase font-mono tracking-wide" style={{ color: stateColor }}>{phase}</span>
        </div>
      </div>

      {/* Body */}
      <div className="dash-card-body flex-1 flex flex-col gap-3 overflow-y-auto">
        {/* Nowcast */}
        <div className="glass rounded-xl p-4 relative overflow-hidden hover-float">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-white via-white/40 to-white opacity-60" />
          <div className="text-[9px] uppercase tracking-widest font-bold font-mono text-white/40 mb-2 flex items-center gap-2">
            <span>Nowcast Engine</span>
            <span className="ai-badge text-[7px]">AI</span>
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-3xl font-black font-mono tracking-tighter" style={{ color: stateColor, textShadow: `0 0 20px ${stateGlow}` }}>
              {nowcast.class}
            </span>
            {isFlare && (
              <span className="text-[8px] uppercase font-bold font-mono text-red-400 animate-pulse px-2 py-0.5 bg-red-500/10 rounded-full border border-red-500/20">
                FLARE IN PROGRESS
              </span>
            )}
          </div>
          <div className="mt-3 space-y-2 border-t border-white/[0.06] pt-3 font-mono text-[10px] text-white/50">
            <div className="flex justify-between"><span>PEAK FLUX:</span><span className="text-white/80 font-semibold">{nowcast.peakFlux.toExponential(1)} <span className="text-white/30 text-[8px]">W/m²</span></span></div>
            <div className="flex justify-between"><span>Z-SCORE:</span><span className={`font-bold ${isWatch || isFlare ? 'text-white' : 'text-white/50'}`}>{nowcast.zScore.toFixed(1)}<span className="text-white/30 text-[8px]">σ</span></span></div>
            <div className="flex justify-between text-white/30"><span>THRESHOLD:</span><span>{nowcast.adaptiveThreshold.toFixed(1)}σ</span></div>
            <div className="flex justify-between text-white/30"><span>CONFIDENCE:</span><span className="text-emerald-400">{(nowcast.confidence * 100).toFixed(0)}%</span></div>
          </div>
        </div>

        {/* Forecast */}
        <div className="glass rounded-xl p-4 hover-float">
          <div className="text-[9px] uppercase tracking-widest font-bold font-mono text-white/40 mb-2 flex items-center gap-2">
            <span>Forecast (3-Hr)</span>
            <span className="ai-badge text-[7px]">TCN</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black font-mono text-white">{forecast.probability}%</span>
            <span className="text-[9px] font-mono text-white/30 uppercase">probability</span>
          </div>
          <div className="mt-3">
            <div className="h-2 bg-black/30 rounded-full overflow-hidden border border-white/[0.06]">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden"
                style={{
                  width: `${forecast.probability}%`,
                  background: '#FFFFFF',
                  boxShadow: '0 0 12px rgba(255,255,255,0.2)',
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
              </div>
            </div>
          </div>
          <div className="mt-3 space-y-1.5 font-mono text-[9px] text-white/40">
            <div className="flex justify-between"><span>TARGET:</span><span className="text-white/70 font-bold">{forecast.nextClass || 'M-class'}</span></div>
            <div className="flex justify-between"><span>LEAD TIME:</span><span className="text-white font-bold">{forecast.leadTime || 0} <span className="text-white/30 font-normal">min</span></span></div>
          </div>
        </div>

        {/* System */}
        <div className="mt-auto space-y-2 font-mono text-[9px] text-white/40 pt-2">
          <div className="flex justify-between items-center py-1 border-b border-white/[0.05]">
            <span>PIPELINE:</span>
            <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase ${systemStatus.pipeline === 'Operational' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
              {systemStatus.pipeline === 'Operational' ? '● ONLINE' : systemStatus.pipeline}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span>Aditya-L1:</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.6)' }} />
              SYNCED
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span>MODEL:</span>
            <span className="text-white/60 font-mono">TCN-8L {systemStatus.modelVersion}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
