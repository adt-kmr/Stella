#!/usr/bin/env node
/**
 * Design-rule audit.
 *
 * The doctrine says enforcement is real, so these checks run rather than
 * being a claim in a document. Each one is a rule from DESIGN.md with a
 * pass/fail, and the script exits non-zero when one fails so it can gate a
 * commit or a CI job.
 *
 *   npm run audit
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath rather than .pathname: on Windows a pathname keeps its
// %20 percent-encoding, so a path with a space in it will not resolve.
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const EXTENSIONS = new Set(['.css', '.jsx', '.js']);

/** Every source file, so a rule cannot be dodged by putting code in a new file. */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (EXTENSIONS.has(extname(full))) out.push(full);
  }
  return out;
}

const files = walk(SRC);
const results = [];
const record = (rule, ok, detail) => results.push({ rule, ok, detail });

const read = (f) => readFileSync(f, 'utf8');
const lines = (f) =>
  read(f)
    .split('\n')
    .map((text, i) => ({ n: i + 1, text }))
    // A line that is only a comment cannot declare anything, so the
    // doctrine's own prose never trips its own audit.
    .filter((l) => !/^\s*(\/\*|\*|\/\/)/.test(l.text));

/* ── No Shadow Rule ─────────────────────────────────────────────── */
{
  const hits = [];
  for (const f of files) {
    for (const l of lines(f)) {
      if (!/box-shadow\s*:/.test(l.text)) continue;
      // The universal reset is the rule being enforced, not a violation.
      if (/box-shadow\s*:\s*none/.test(l.text)) continue;
      hits.push(`${f.replace(SRC, '')}:${l.n}`);
    }
  }
  record(
    'No Shadow',
    hits.length === 0,
    hits.length === 0 ? '0 box-shadow declarations' : `${hits.length} found: ${hits.join(', ')}`
  );
}

/* ── Square Rule ────────────────────────────────────────────────── */
{
  const values = [];
  for (const f of files) {
    for (const l of lines(f)) {
      const m = l.text.match(/border-radius\s*:\s*([^;]+)/);
      if (m) values.push({ v: m[1].trim(), at: `${f.replace(SRC, '')}:${l.n}` });
    }
  }
  const circles = values.filter((x) => x.v === '50%');
  const zeros = values.filter((x) => x.v === '0');
  const others = values.filter((x) => x.v !== '50%' && x.v !== '0');
  record(
    'Square Rule',
    others.length === 0 && circles.length <= 2,
    others.length
      ? `non-zero, non-50% radius: ${others.map((x) => `${x.v} at ${x.at}`).join(', ')}`
      : `${zeros.length} reset to 0, ${circles.length} circles (limit 2)`
  );
}

/* ── 14px Floor: no raw px anywhere in a type size ──────────────── */
{
  const hits = [];
  for (const f of files) {
    for (const l of lines(f)) {
      if (/font-size\s*:\s*\d+(\.\d+)?px/.test(l.text) || /fontSize\s*:\s*['"]?\d+px/.test(l.text)) {
        hits.push(`${f.replace(SRC, '')}:${l.n}`);
      }
    }
  }
  record(
    '14px Floor',
    hits.length === 0,
    hits.length === 0 ? 'no raw px type sizes' : `${hits.length} found: ${hits.join(', ')}`
  );
}

/* ── Two Ramps: type sizes come from a token, never ad hoc ─────── */
{
  const hits = [];
  const ALLOWED = /var\(--ui-|var\(--brand-|fontSize|font-size|font-variation|clamp\(|inherit/;
  for (const f of files) {
    if (!f.endsWith('.css')) continue;
    for (const l of lines(f)) {
      if (!/font-size\s*:/.test(l.text)) continue;
      if (!ALLOWED.test(l.text)) hits.push(`${f.replace(SRC, '')}:${l.n} ${l.text.trim()}`);
    }
  }
  record(
    'Two Ramps',
    hits.length === 0,
    hits.length === 0 ? 'all type sizes from --ui-* / --brand-*' : `${hits.length} ad hoc: ${hits.join(' | ')}`
  );
}

/* ── One Kicker: at most one per route component ────────────────── */
{
  const hits = [];
  for (const f of files) {
    if (!f.endsWith('.jsx')) continue;
    const count = (read(f).match(/className="eyebrow"/g) || []).length;
    if (count > 1) hits.push(`${f.replace(SRC, '')} has ${count}`);
  }
  record('One Kicker', hits.length === 0, hits.length === 0 ? 'one eyebrow per route' : hits.join(', '));
}

/* ── Reduced motion: every scroll-driven animation has a path ───── */
{
  const css = files.filter((f) => f.endsWith('.css')).map(read).join('\n');
  const hasReduced = /prefers-reduced-motion/.test(css);
  const scrubbed = (read(join(SRC, 'components/FluxCanvas.jsx')).match(/scrub/g) || []).length > 0;
  const collapses = /fluxhero\s*\{\s*height:\s*100vh/.test(css);
  record(
    'Reduced motion',
    hasReduced && scrubbed && collapses,
    hasReduced && scrubbed && collapses
      ? 'media query present; 560vh hero track collapses to 100vh'
      : 'missing reduced-motion path for the scroll-scrubbed hero'
  );
}

/* ── Identity: no stale product names anywhere in source ────────── */
{
  const STALE = /isro|solflare|sol-flare|helios\s*cortex|bharatiya|antariksh/i;
  const hits = [];
  for (const f of files) {
    for (const l of lines(f)) {
      if (STALE.test(l.text)) hits.push(`${f.replace(SRC, '')}:${l.n} ${l.text.trim().slice(0, 60)}`);
    }
  }
  record(
    'One identity',
    hits.length === 0,
    hits.length === 0 ? 'no stale project names' : `${hits.length} found: ${hits.join(' | ')}`
  );
}

/* ── Report ─────────────────────────────────────────────────────── */
const pad = Math.max(...results.map((r) => r.rule.length));
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.rule.padEnd(pad)}  ${r.detail}`);
}
console.log(`\n${results.length - failed}/${results.length} rules hold across ${files.length} files.`);
process.exit(failed === 0 ? 0 : 1);