import { useLiveState, transferLearning } from '../lib/data';

export default function DataSourcePanel() {
  const { systemStatus } = useLiveState();

  return (
    <div className="h-full flex flex-col" style={{ overflow: 'hidden' }}>
      <div className="dash-card-header">
        <div className="dash-card-header-left">
          <div className="dash-card-bar" style={{ background: 'linear-gradient(180deg, #38BDF8, #34D399)' }} />
          <span className="dash-card-title">Instruments</span>
        </div>
        <span className="text-[8px] font-mono text-emerald-400 font-bold uppercase flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.6)' }} />
          Ready
        </span>
      </div>
      
      <div className="dash-card-body flex-1 overflow-y-auto space-y-2.5 font-mono text-[9px] text-white/50">
        {/* Active Satellite */}
        <div className="glass hover-float rounded-xl p-3">
          <div className="text-[8px] uppercase font-bold text-white mb-1.5 flex items-center gap-1.5">
            <span>●</span> Active Satellite
          </div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-white/80 font-bold text-[10px]">Aditya-L1</span>
            <span className="text-white/25 text-[8px]">L1 Point</span>
          </div>
          <div className="pl-2 space-y-1 border-l border-white/[0.06] mt-1.5 text-[8px]">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-[2px] bg-white rounded-full" />
              <span>SoLEXS: Soft X-Ray <span className="text-white/80">(1-30 keV)</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-[2px] bg-sky-400 rounded-full" />
              <span>HEL1OS: Hard X-Ray <span className="text-sky-400">(10-150 keV)</span></span>
            </div>
          </div>
        </div>

        {/* Reference Calibration */}
        <div className="glass hover-float rounded-xl p-3">
          <div className="text-[8px] uppercase font-bold text-sky-400 mb-1.5 flex items-center gap-1.5">
            <span>◈</span> Reference Calibration
          </div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-white/80 font-bold text-[10px]">NOAA GOES</span>
            <span className="text-white/25 text-[8px]">Geostationary</span>
          </div>
          <div className="pl-2 border-l border-white/[0.06] mt-1 text-[8px]">
            Channels: 1-8 Å (Soft) / 0.5-4 Å (Hard)
          </div>
        </div>

        {/* Transfer Learning */}
        <div className="glass hover-float rounded-xl p-3">
          <div className="text-[8px] uppercase font-bold text-purple-400 mb-1.5 flex items-center gap-1.5">
            <span>◇</span> Transfer Learning
          </div>
          <div className="space-y-1 text-[8px]">
            <div className="flex justify-between"><span className="text-white/25">Source:</span><span>{transferLearning.source}</span></div>
            <div className="flex justify-between"><span className="text-white/25">Target:</span><span>{transferLearning.target}</span></div>
            <div className="flex justify-between"><span className="text-white/25">Adaptation:</span><span>{transferLearning.domainAdaptation}</span></div>
          </div>
        </div>

        {/* Neural Architecture */}
        <div className="glass hover-float rounded-xl p-3">
          <div className="text-[8px] uppercase font-bold text-emerald-400 mb-1.5 flex items-center gap-1.5">
            <span>◆</span> Neural Architecture
          </div>
          <div className="space-y-1 text-[8px]">
            <div className="flex justify-between"><span className="text-white/25">Algorithm:</span><span>TCN-8L</span></div>
            <div className="flex justify-between"><span className="text-white/25">Layers:</span><span>8 dilated causal</span></div>
            <div className="flex justify-between"><span className="text-white/25">Input:</span><span>Dual-band feature trajectory</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
