# STELLA — Survey Sheet frontend

**S**olar **T**emporal **E**vent **L**earning & **A**ssessment. Software Engineering
Project, course code UCS503.

A React console for Aditya-L1 X-ray telemetry: it nowcasts the current flare
class, projects probability three hours ahead, and scores what an event would do
to India's power grid and navigation networks.

```bash
npm install
npm run dev      # http://localhost:5173, proxies /api and /ws to :8000
npm run build
npm run lint
npm run audit    # the design rules, as pass/fail rather than a claim
```

The console needs the pipeline running (`uvicorn api.main:app --port 8000`).
With it down, every sheet says which call failed rather than inventing values.

## The design system

The interface is one large-format **survey sheet**: corner registration marks, a
marginalia column carrying field annotations in monospace, sheet numbering in the
masthead, and hairline rules dividing the work. Nothing floats above the sheet,
because a drawing has no drop shadow.

`/` is the index sheet. `/dashboard`, `/impact`, `/replay`, `/catalog` and
`/metrics` are sheets 01–05 of the same document, sharing a masthead and a token
set — moving between them should never feel like a handoff to another team.

Colour is a depth-sensor ramp: near is hot and indigo is far, with teal in the
middle for what has been identified. It came from the product rather than a mood
board, and it is spent only where the pipeline is sensing or working *right now*,
so colour carries state instead of decorating.

| Role | Token | |
|---|---|---|
| Sheet | `--vellum` `#eef0ea` | the paper, both routes |
| Surface | `--vellum-deep` `#e6e9e1` | the only surface tone; the entire elevation system |
| Ink | `--graphite` `#12151a` · `--body` `#2c3238` · `--muted` `#4a524d` | 15.9:1 / 7.02:1 |
| Hairline | `--rule` `#cbd1c7` | every divider, at 1.5px |
| Far | `--far` `#22307e` | structure, settled |
| Mid | `--mid` `#14b09a` | identified — graphics only |
| Near | `--near` `#ff5b2e` | working now — graphics only |
| Refused | `--refused` `#c0331c` | failure only |

Type is one variable family at both ends of its width axis — Archivo expanded to
`wdth 118` for display, condensed to `wdth 62` for instrument labels — against
JetBrains Mono for anything the machine measured. Two families contrasting on
proportion rather than on the serif/sans axis. There is no text serif: this is an
instrument, and a serif "for warmth" on a technical brief is a reflex rather than
a decision.

### Rules, and how each is enforced

`npm run audit` checks all seven and exits non-zero on a failure:

| Rule | Doctrine | Audit |
|---|---|---|
| No Shadow | surfaces separate by tone and hairline | 0 `box-shadow` declarations |
| Square Rule | `border-radius` is 0, or a full circle for a point in space | exactly two `50%`: the stage marker and the chart beacon |
| 14px Floor | nothing below 14px — projector in a bright room | 0 raw `px` type sizes |
| Two Ramps | `--ui-*` fixed for the console, `--brand-*` fluid for the sheet | no ad hoc type size |
| One Kicker | a tracked uppercase label, once per route | one `eyebrow` per component |
| Measured Colour | colour is state, never decoration | one `flareState` mapping shared by every readout and trace |
| Hot Ink | orange and teal fail as text at 2.69:1 and 3.49:1 | readable type takes `--near-ink` / `--mid-ink` |

Colour is never the sole carrier of state: every status also carries a word —
"flare in progress", "pre-flare warning", "quiet sun", "above gate".

## Honesty

- **Every number is measured or absent.** Figures come from the API or are named
  constants from the codebase — GOES flux tiers, the 0.06 hardness threshold, the
  0.45 S4 scintillation alert. No invented benchmarks, no decorative metrics.
- **Absence is stated in words.** An empty chart would imply "nothing happened",
  which is a different claim from "nothing logged", so each empty state names the
  condition and what would fill it.
- **The gate is the product.** The Heidke skill score panel prints above or below
  its 0.30 threshold, and a run that lands below is shown below. When an endpoint
  refuses, the sheet names the call that failed instead of smoothing it over — and
  reporting "no impact" for an unscored event would be a safety claim, not an
  empty state.
- **The hero counts, it does not assert.** The 3D trace's sample, C-class and
  hardness counts are computed from the array the canvas actually draws, and it
  says "samples", not "events".
- **Offline is the claim.** The socket falls back to REST polling, the India map
  is inline SVG with no tile layer, and nothing on the sheet needs a network
  round-trip to look right.

## The 3D hero

One canvas carries ingest → impact, scrubbed by scroll through a 560vh track. It
plots a procedural X-ray time series on a log axis: a quiet-Sun floor with
jitter, three flaring regions, and a Neupert profile on each — fast rise,
exponential decay — because that is the shape a real flare has.

Deliberately minimal, and it documents its own restraint: no SSAO, no bloom, no
SMAA, no `EffectComposer`, no fog tricks. Signal colours are unlit
`MeshBasicMaterial` with `toneMapped: false`, because a colour a light bounces
off is a colour lighting can change, and then the Measured Colour rule quietly
stops being true.

`three.js` is lazy-loaded, so deep-linking to `/catalog` does not download a WebGL
renderer to read a table.

Under `prefers-reduced-motion: reduce` there is no scrub: the canvas paints its
finished state and the track collapses to 100vh, so nobody scrolls through five
empty screens.

## Layout

```
src/
├── styles.css              the design system — tokens, rules, components
├── flux.js                 the 3D scene: procedural trace, six phases
├── aperture.js             the log-spiral Bayer-dithered lens
├── router.jsx              History API over useSyncExternalStore
├── useReveal.js            GSAP reveal, gated on reduced motion
├── App.jsx                 the sheet: masthead, registration marks, stamp
├── Preloader.jsx           "Calibrating flux", counts to TRACE.n
├── lib/data.js             WebSocket + REST polling, notifications, store
└── components/
    ├── FluxCanvas.jsx      the scroll-scrubbed hero
    ├── Landing.jsx         the index sheet, five bands
    ├── Dashboard.jsx       readouts, chart, status, alerts, instruments
    ├── FluxChart.jsx       soft/hard traces, tiers, fullscreen
    ├── HardnessMeter.jsx   threshold, trend, pre-flare gate
    ├── StatusBlock.jsx     nowcast, forecast, mission state
    ├── AlertList.jsx       the pipeline's own emissions
    ├── DataSourcePanel.jsx instruments, transfer learning, architecture
    ├── ImpactPanel.jsx     seven categories, TCN card, mission card
    ├── IndiaImpactMap.jsx  per-state GPS and power-grid risk
    ├── ModelExplanation.jsx feature attribution
    ├── Catalog.jsx         the event table
    ├── Replay.jsx          the transport
    └── Metrics.jsx         POD/FAR/CSI, contingency, skill gate
```

No UI library and no CSS framework: every control is hand-written, so the audit
above has one place to look.