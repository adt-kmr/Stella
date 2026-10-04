/* Alert levels map onto the Measured Colour ramp by severity, and each
   level also carries a distinct word, so colour is never the sole signal. */
const LEVELS = {
  RED: { tone: 'refused', label: 'refused', word: 'alert' },
  YELLOW: { tone: 'near', label: 'elevated', word: 'watch' },
  GREEN: { tone: 'mid', label: 'nominal', word: 'log' },
};

const TYPE_LABEL = {
  NOWCAST: 'nowcast',
  FORECAST: 'forecast',
  INFO: 'system',
};

export default function AlertList({ alerts }) {
  const shown = (alerts || []).slice(0, 24);

  return (
    <>
      <div className="panel__head">
        <div>
          <h2>Alert log</h2>
          <span className="readout__k">pipeline emissions, newest first</span>
        </div>
        <span className="readout__k">
          {shown.length > 0 ? `${shown.length} shown` : 'live feed'}
        </span>
      </div>

      {shown.length === 0 ? (
        // Absence in words. An empty chart here would imply "nothing
        // happened", which is a different claim from "nothing logged".
        <div className="absent">
          <p>No alerts logged.</p>
          <p>
            Nothing has crossed a threshold this session. An alert appears when the nowcast
            class escalates or the hardness ratio passes 0.06.
          </p>
        </div>
      ) : (
        <ul className="alerts scroll-quiet">
          {shown.map((a, i) => {
            const lv = LEVELS[a.level] || LEVELS.GREEN;
            return (
              <li key={i}>
                <div className="alerts__head">
                  <span className={`alerts__type is-${lv.tone}`}>
                    <span className={`beacon beacon--sm beacon--${lv.tone}`} aria-hidden="true" />
                    {lv.word} · {TYPE_LABEL[a.type] || String(a.type || '').toLowerCase()}
                  </span>
                  <span className="alerts__ts">{a.ts ? `${a.ts.slice(11, 19)}Z` : ''}</span>
                </div>
                <p className="alerts__msg">{a.msg}</p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}