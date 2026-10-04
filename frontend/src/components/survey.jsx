/**
 * Survey-sheet primitives.
 *
 * These are the pieces that make the page read as a large-format
 * drawing rather than a web page: corner registration marks, the
 * marginalia column, sheet numbering, one kicker per route, and
 * the gate (a refusal block).
 *
 * All hand-written. No UI library.
 */

/* ── Corner registration marks ─────────────────────────────
   A drawing registers its corners so you can tell at a glance
   whether it has been reprinted or mis-fed. Four crosses, fixed
   to the viewport, never interactive. */
export function RegistrationMarks() {
  return (
    <>
      {['tl', 'tr', 'bl', 'br'].map((corner) => (
        <div key={corner} className={`registration registration--${corner}`} aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path
              d="M11 1v20M1 11h20"
              stroke="currentColor"
              strokeWidth="1"
              opacity="0.45"
            />
            <circle cx="11" cy="11" r="4.5" stroke="currentColor" strokeWidth="1" opacity="0.6" />
          </svg>
        </div>
      ))}
    </>
  );
}

/* ── Masthead sheet number ─────────────────────────────────
   Sheets are numbered. You cite a sheet by its number, so the
   number sits in the masthead and is always visible. */
export function SheetNumber({ sheet, title }) {
  return (
    <span className="sheet-no" title={title}>
      Sheet {sheet}
    </span>
  );
}

/* ── One Kicker ────────────────────────────────────────────
   A tracked uppercase label above a heading. Once per route.
   `tone` maps to Measured Colour: signal = working now,
   settled = structural, mid = identified. */
export function Kicker({ children, tone = '' }) {
  return (
    <span className={`u-kicker ${tone ? `u-kicker--${tone}` : ''}`}>{children}</span>
  );
}

/* ── Section head: kicker + heading + lede ───────────────── */
export function SectionHead({ kicker, tone, title, lede, sheet, id }) {
  return (
    <header className="section-head" id={id}>
      {sheet && <SheetNumber sheet={sheet} title={title} />}
      <Kicker tone={tone}>{kicker}</Kicker>
      <h2 className="u-h2">{title}</h2>
      {lede && <p className="u-lede" style={{ marginTop: '1rem' }}>{lede}</p>}
    </header>
  );
}

/* ── Marginalia ────────────────────────────────────────────
   Field annotations live in the margin, in monospace, the way a
   survey sheet carries notes beside the drawing. */
export function Marginalia({ rows, title = 'Field notes' }) {
  return (
    <aside className="marginalia" aria-label={title}>
      {rows.map((r) => (
        <div key={r.key} className="marginalia__row">
          <span className="marginalia__key">{r.key}</span>
          <span className="marginalia__val">{r.value}</span>
        </div>
      ))}
    </aside>
  );
}

/* ── A 10-tick ruler ───────────────────────────────────────
   The one functional gradient in the system: a repeating scale
   you can read against, the way a rule sits under a drawing. */
export function Ruler({ label }) {
  return (
    <div>
      {label && (
        <span className="readout__key" style={{ display: 'block', marginBottom: '0.25rem' }}>
          {label}
        </span>
      )}
      <div className="ruler" aria-hidden="true" />
    </div>
  );
}

/* ── The gate ──────────────────────────────────────────────
   "The gate is the product — surface refusals, don't smooth
   them over." When a view cannot render, say which call failed
   and let the operator retry. */
export function Gate({ title, children, onRetry, retryLabel = 'Retry' }) {
  return (
    <div className="gate" role="alert">
      <div className="gate__head">{title}</div>
      <div>{children}</div>
      {onRetry && (
        <button className="btn btn--ghost btn--sm" style={{ marginTop: '0.75rem' }} onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}

/* ── State dot ─────────────────────────────────────────────
   One of the only two legal border-radius values in the system
   (50% — a dot is a literal point in space). Colour is state:
   orange = happening now, teal = identified, indigo = settled,
   red = refused. */
export function StateDot({ tone = 'quiet', size = '', pulse = false, title }) {
  return (
    <span
      className={`dot ${size ? `dot--${size}` : ''}`}
      style={{ background: `var(--${tone})` }}
      title={title}
      data-pulse={pulse ? 'true' : undefined}
    />
  );
}

/* ── Pipeline state → Measured Colour ──────────────────────
   One mapping, used everywhere. Colour is never decorative. */
export const STATE_TONE = {
  nominal: 'ink-muted',
  quiet: 'mid',
  scanning: 'near',
  working: 'near',
  watch: 'near',
  identified: 'mid',
  settled: 'far',
  failed: 'refused',
  refused: 'refused',
};

/* ── Readout ───────────────────────────────────────────────
   A measured value with its unit and key. Every number here is
   measured or absent — we never invent precision. */
export function Readout({ k, value, unit, tone, size = 'md' }) {
  const px = { md: '1.5rem', lg: '2.25rem', xl: '3rem', sm: '1.125rem' }[size];
  return (
    <div>
      <span className="readout__key">{k}</span>
      <div
        className="readout__val"
        style={{
          fontSize: px,
          marginTop: '0.25rem',
          color: tone ? `var(--${tone})` : undefined,
        }}
      >
        {value}
        {unit && (
          <span
            className="readout__unit"
            style={{ marginLeft: '0.375rem', fontSize: 'var(--ui-small)', fontWeight: 400 }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── A key/value row ─────────────────────────────────────── */
export function KV({ k, v, tone }) {
  return (
    <div className="kv">
      <span className="kv__k">{k}</span>
      <span className="kv__v" style={tone ? { color: `var(--${tone})` } : undefined}>
        {v}
      </span>
    </div>
  );
}

/* ── Loading: calibrating depth ────────────────────────────
   Counts to the real length of whatever it is waiting on, and
   says which stream. "Offline is the claim" means we never show
   a fake number: when there is no array, it says so. */
export function Calibrating({ label = 'Calibrating flux', count = null, stream = null }) {
  return (
    <div
      className="u-console u-center"
      style={{ padding: '3rem 1.5rem', display: 'grid', gap: '0.875rem', justifyItems: 'center' }}
      role="status"
      aria-live="polite"
    >
      <div
        className="scan-edge"
        style={{ width: 'min(320px, 60%)', height: '2px' }}
        aria-hidden="true"
      />
      <span className="u-instrument" style={{ color: 'var(--near-ink)' }}>
        {label}
      </span>
      {count !== null && (
        <span className="readout__val" style={{ fontSize: '1.75rem' }}>
          {count.toLocaleString()}
        </span>
      )}
      {stream && (
        <span className="marginalia" style={{ fontSize: 'var(--ui-small)' }}>
          {stream}
        </span>
      )}
    </div>
  );
}

/* ── Empty state ───────────────────────────────────────────
   "Every number is measured or absent." With no data we say
   nothing is measured rather than showing zero. */
export function Absent({ what = 'No measurements', hint = null }) {
  return (
    <div
      className="u-console u-center"
      style={{ padding: '2.5rem 1.5rem', display: 'grid', gap: '0.5rem', justifyItems: 'center' }}
    >
      <span className="u-instrument" style={{ color: 'var(--ink-muted)' }}>
        {what}
      </span>
      {hint && (
        <span className="marginalia" style={{ fontSize: 'var(--ui-small)' }}>
          {hint}
        </span>
      )}
    </div>
  );
}