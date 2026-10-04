import { useState, useEffect } from 'react';
import { formatUTC } from '../lib/data.js';
import { useReveal } from '../useReveal.js';

/* Class → tone, following Measured Colour. X and M are the hot end
   because they are what changes an operator's behaviour; A and B are
   settled, so they take indigo. */
function classTone(cls) {
  const c = (cls || '').charAt(0).toUpperCase();
  if (c === 'X' || c === 'M') return 'near';
  if (c === 'C') return 'mid';
  return 'far';
}

const COLUMNS = [
  { key: 'ts', label: 'Date / time UTC', sortable: true },
  { key: 'cls', label: 'Class', sortable: true },
  { key: 'peak', label: 'Peak flux', sortable: false, num: true },
  { key: 'instr', label: 'Instruments', sortable: false },
  { key: 'lead', label: 'Lead time', sortable: true, num: true },
  { key: 'conf', label: 'Confidence', sortable: true, num: true },
  { key: 'dur', label: 'Duration', sortable: false },
  { key: 'act', label: 'Action', sortable: false },
];

export default function Catalog({ onReplay }) {
  const [sort, setSort] = useState('ts');
  const [dir, setDir] = useState('desc');
  const [events, setEvents] = useState(null);
  const [failed, setFailed] = useState(null);
  const ref = useReveal();

  useEffect(() => {
    let live = true;
    fetch('/api/catalog')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((rows) => {
        if (!live) return;
        setEvents(
          (rows || []).map((e) => ({
            ...e,
            instr: e.instrument || e.instr || '—',
            dur: e.duration || e.dur || '—',
          }))
        );
      })
      .catch((err) => {
        if (!live) return;
        setFailed(err.message || 'request failed');
        setEvents([]);
      });
    return () => {
      live = false;
    };
  }, []);

  const handleSort = (key) => {
    if (sort === key) setDir(dir === 'desc' ? 'asc' : 'desc');
    else {
      setSort(key);
      setDir('desc');
    }
  };

  const sorted = [...(events || [])].sort((a, b) => {
    let av;
    let bv;
    if (sort === 'ts') {
      av = new Date(a.ts).getTime();
      bv = new Date(b.ts).getTime();
    } else if (sort === 'cls') {
      av = a.cls.charCodeAt(0) * 1000 + parseFloat(a.cls.slice(1) || 0);
      bv = b.cls.charCodeAt(0) * 1000 + parseFloat(b.cls.slice(1) || 0);
    } else if (sort === 'lead') {
      av = a.lead;
      bv = b.lead;
    } else {
      av = a.conf;
      bv = b.conf;
    }
    return dir === 'desc' ? bv - av : av - bv;
  });

  const renderBody = () => {
    if (failed) {
      return (
        <div className="gateblock" style={{ maxWidth: 'none' }}>
          <div className="gateblock__head">
            <span className="gateblock__title">Catalog unavailable</span>
            <span className="gateblock__verdict">refused</span>
          </div>
          <p style={{ margin: 0, fontSize: 'var(--ui-sm)' }}>
            <code>GET /api/catalog</code> returned {failed}. The catalog is written by the
            pipeline as it detects events, so an empty or unreachable pipeline leaves nothing to
            list — which is different from a Sun that has produced no flares.
          </p>
          <button
            className="btn btn--ghost btn--sm"
            style={{ marginTop: '0.75rem' }}
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      );
    }

    if (events === null) {
      return (
        <div className="calibrating">
          <div className="calibrating__bar">
            <i />
          </div>
          <span>Reading the catalog</span>
        </div>
      );
    }

    if (events.length === 0) {
      return (
        <div className="absent">
          <p>No events recorded.</p>
          <p>
            The catalog fills as the pipeline classifies a sample above C-class. Nothing has
            crossed that line yet for the loaded window.
          </p>
        </div>
      );
    }

    return (
      <div className="tablewrap">
        <table className="silicon">
          <caption>
            {events.length} recorded {events.length === 1 ? 'event' : 'events'}. Sorted by{' '}
            {COLUMNS.find((c) => c.key === sort)?.label.toLowerCase()}, {dir === 'desc' ? 'newest first' : 'oldest first'}.
          </caption>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className={[
                    c.sortable ? 'is-sortable' : '',
                    sort === c.key ? 'is-sorted' : '',
                    c.num ? 'num' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={c.sortable ? () => handleSort(c.key) : undefined}
                  aria-sort={sort === c.key ? (dir === 'desc' ? 'descending' : 'ascending') : undefined}
                >
                  {c.label}
                  {sort === c.key && <span aria-hidden="true"> {dir === 'desc' ? '▾' : '▴'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((e) => (
              <tr key={e.id ?? `${e.ts}-${e.cls}`}>
                <td className="nowrap strong">{formatUTC(e.ts)}</td>
                <td className={`nowrap strong stateword is-${classTone(e.cls)}`}>{e.cls}</td>
                <td className="num nowrap">{e.peak.toExponential(2)} W/m²</td>
                <td className="nowrap">{e.instr}</td>
                <td className="num nowrap">
                  {e.lead > 0 ? (
                    <span style={{ color: 'var(--mid-ink)', fontWeight: 700 }}>+{e.lead} min</span>
                  ) : (
                    <span style={{ color: 'var(--muted)' }}>—</span>
                  )}
                </td>
                <td className="num nowrap">{e.conf > 0 ? `${e.conf}%` : '—'}</td>
                <td className="nowrap">{e.dur}</td>
                <td>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => onReplay?.(e)}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    Replay
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="console" ref={ref}>
      <div className="console__head">
        <div>
          <span className="eyebrow">Sheet 04 · event catalog</span>
          <h1 className="title">Recorded events</h1>
        </div>
        <div className="console__status">
          <span className="muted">
            {events === null ? 'reading…' : `${events.length} rows`}
          </span>
        </div>
      </div>

      <div className="panel" data-reveal>
        <div className="panel__head">
          <div>
            <h2>Solar flare event catalog</h2>
            <span className="readout__k">every event the nowcast classified, with the forecast it beat</span>
          </div>
        </div>
        {renderBody()}
      </div>

      <p className="prose prose--small" style={{ marginTop: '1.5rem' }} data-reveal>
        A lead time is only meaningful against a fixed reference, so every row is quoted against
        GOES soft X-ray onset for the same event. An em dash means the forecast did not precede
        onset, which is recorded rather than dropped — a catalog that only listed wins would be
        measuring its own selection.
      </p>
    </div>
  );
}