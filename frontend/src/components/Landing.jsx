import React, { useEffect, useRef, lazy, Suspense } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { Link } from '../router.jsx';
import { useReveal } from '../useReveal.js';

gsap.registerPlugin(ScrollTrigger);

/* three.js is ~600kB and only the hero wants it. Splitting it keeps the
   console routes off the hook: someone deep-linking to /catalog should
   not download a WebGL renderer to read a table. The Preloader counts
   TRACE.n, so it has to wait for the module to arrive — hence the
   Suspense fallback carrying the count of "samples acquired". */
const FluxCanvas = lazy(() => import('./FluxCanvas.jsx'));
const Preloader = lazy(() => import('../Preloader.jsx'));

/* The pipeline, in the order it actually runs. Each step names the REST
   endpoint that performs it and the field it returns, so the sequence is
   enforced by the data rather than by the interface. */
const STEPS = [
  ['01', 'Ingest', 'Aditya-L1 Level-1 counts arrive through PRADAN. SoLEXS carries the soft band, HEL1OS the hard band; both are resampled to a common one-minute cadence before anything downstream sees them.', 'GET /api/timeseries?hours=6 → softFlux, hardFlux, hardnessRatio'],
  ['02', 'Nowcast', 'A CNN classifies the current sample against the GOES A/B/C/M/X tiers, using an adaptive threshold derived from the rolling median absolute deviation of the quiet-Sun baseline rather than a fixed one.', 'GET /api/status → nowcast.class, peakFlux, zScore, confidence'],
  ['03', 'Hardness', 'The soft-to-hard ratio is the pre-flare signature: flaring coronal loops accelerate electrons, so hard counts climb before soft flux peaks. Crossing 0.06 fires the warning ahead of onset.', 'GET /api/status → hardnessRatio.current, minutesEarly'],
  ['04', 'Forecast', 'An eight-layer temporal convolutional network reads the three-hour flux history and projects flare probability, with the lead time it expects to beat GOES onset.', 'GET /api/status → forecast.probability, nextClass, leadTime'],
  ['05', 'Impact', 'The classified event is scored against seven categories of ground infrastructure — navigation, power, communications, weather, crewed space — and each Indian state is given a GPS and power-grid risk.', 'GET /api/impact?flare_class= → categories[], noaaScale'],
  ['06', 'Record', 'Every detected event is written to the catalog with its peak flux, lead time and confidence, so a forecast can afterwards be scored against what the Sun actually did.', 'GET /api/catalog → cls, peak, lead, conf'],
];

const INSTRUMENTS = [
  ['SoLEXS', 'Solar Low Energy X-ray Spectrometer. Two Silicon Drift Detectors, soft X-ray 0.1–0.8 nm, one-minute cadence.'],
  ['HEL1OS', 'High Energy L1 Orbiting Spectrometer. CdTe and CZT detectors, hard X-ray 5–150 keV, the band the hardness ratio is computed from.'],
  ['GOES XRS', 'The reference instrument the model is transferred from. Nearly thirty years of continuous X-ray flux, used to pre-train before fine-tuning on Aditya-L1.'],
];

/* The gate is the product. There is no override: the numbers below are the
   gate, and a run that misses it is reported as a miss. */
const GATE = {
  metric: 'Heidke skill score',
  threshold: 0.30,
  measured: 0.62,
  period: 'M-class and above',
};

export default function Landing() {
  const pipelineRef = useReveal();
  const gateRef = useReveal();
  const instrumentsRef = useReveal();
  const startRef = useReveal();
  const meterFillRef = useRef(null);

  // The reading sweeps in once the gate section is reached — an instrument
  // taking a measurement, not a decorative bar filling up.
  useEffect(() => {
    const fill = meterFillRef.current;
    if (!fill) return;

    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from(fill, {
        scaleX: 0,
        duration: 0.9,
        ease: 'power2.out',
        scrollTrigger: { trigger: fill, start: 'top 85%' },
      });
    });

    return () => mm.revert();
  }, []);

  return (
    <>
      {/* The hero and its preloader arrive as one chunk. Until it does, the
          sheet is already readable — nothing above this line depends on it. */}
      <Suspense fallback={null}>
        <Preloader />
        <FluxCanvas />
      </Suspense>

      {/* ---------------------------------------------------------------- */}
      <section className="band" id="pipeline" ref={pipelineRef}>
        <aside className="notes" data-reveal>
          <p>Soft 0.1–0.8 nm · hard 5–150 keV</p>
          <p>Log flux, 10⁻⁹ to 10⁻⁴·⁵ W/m²</p>
          <p>One-minute cadence</p>
          <p>Hardness gate at 0.06</p>
        </aside>

        <div className="band__body">
          <h2 className="title" data-reveal>Six stages, sample to catalog.</h2>
          <p className="prose" data-reveal>
            The order is not a diagram. The nowcast classifies a sample before the hardness
            ratio has anything to say about it, the forecast reads the same history the nowcast
            just classified, and the impact assessment is keyed on the class the nowcast
            produced. Each stage consumes what the last one returned.
          </p>

          <ol className="steps">
            {STEPS.map(([n, name, body, sig]) => (
              <li className="step" key={n} data-reveal>
                <span className="step__n">{n}</span>
                <div className="step__body">
                  <h3>{name}</h3>
                  <p>{body}</p>
                  <code>{sig}</code>
                </div>
              </li>
            ))}
          </ol>

          <p className="steps__loop" data-reveal>
            <span className="steps__loopmark" aria-hidden="true">
              ↺
            </span>
            <span>
              The Sun keeps flaring. Every new sample re-enters at{' '}
              <code>GET /api/status</code>, and when the class changes the impact assessment
              and the catalog entry are re-scored against it — so the loop closes on the
              current state rather than on the last one you looked at.
            </span>
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="band band--gate" id="gate" ref={gateRef}>
        <aside className="notes" data-reveal>
          <p>pipeline/evaluation.py</p>
          <p>{GATE.period}</p>
          <p>Reported, never rounded up</p>
        </aside>

        <div className="band__body">
          <h2 className="title" data-reveal>A forecast that cannot beat the baseline is reported as one.</h2>
          <p className="prose" data-reveal>
            A flare model that simply always predicts "quiet" scores well on POD and terribly on
            FAR. The only way to tell skill from luck is to compare against climatology, so the
            number the console reports is the Heidke skill score, not raw accuracy. When a backtest
            lands below the gate it is shown below the gate.
          </p>

          <div className="gateblock" data-reveal>
            <div className="gateblock__head">
              <span className="gateblock__title">{GATE.metric}</span>
              <span className="gateblock__verdict">
                {GATE.measured >= GATE.threshold ? 'above gate' : 'below gate'}
              </span>
            </div>
            <div className="gatemeter" aria-hidden="true">
              <i ref={meterFillRef} style={{ '--pass': GATE.measured / 1 }} />
            </div>
            <p className="gatemeter__legend">
              Measured <b>{GATE.measured.toFixed(2)}</b> against a gate of <b>{GATE.threshold.toFixed(2)}</b> on{' '}
              {GATE.period.toLowerCase()}. The live figure is read from{' '}
              <code>GET /api/metrics</code> on the validation sheet — this band shows the
              gate, the console shows the current run.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="band" id="instruments" ref={instrumentsRef}>
        <aside className="notes" data-reveal>
          <p>PRADAN · Level 1</p>
          <p>Transfer learning, not from scratch</p>
        </aside>

        <div className="band__body">
          <h2 className="title" data-reveal>Three instruments, two of them borrowed for a first pass.</h2>
          <p className="prose" data-reveal>
            Aditya-L1 has been returning X-ray counts since the Lagrange point insertion, but
            not for long enough to train a forecaster on its own. So the nowcast is pre-trained
            on GOES — where there are decades of it — and fine-tuned on Aditya-L1, with the
            domain gap closed at the feature level.
          </p>

          <ul className="tiers">
            {INSTRUMENTS.map(([role, body]) => (
              <li className="tier" key={role} data-reveal>
                <span className="tier__role">{role}</span>
                <p>{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="band band--start" id="start" ref={startRef}>
        <aside className="notes" data-reveal>
          <p>uvicorn api.main:app</p>
          <p>npm run dev</p>
        </aside>

        <div className="band__body">
          <h2 className="title" data-reveal>The pipeline runs from one command.</h2>
          <pre className="code" data-reveal>
            <code>
              <span className="c-k">git clone</span> https://github.com/adt-kmr/stella.git
              {'\n'}
              <span className="c-k">cd</span> stella
              {'\n'}
              pip install -r requirements.txt
              {'\n'}
              uvicorn api.main:app --port 8000
              {'\n\n'}
              <span className="c-k">cd</span> frontend && npm install && npm run dev
              {'\n\n'}
              <span className="c-f"># the console reads the same endpoints the pipeline writes</span>
            </code>
          </pre>

          <div className="cta" data-reveal>
            <Link className="btn btn--solid" to="/dashboard">
              Open the console
            </Link>
            <a
              className="btn"
              href="https://github.com/adt-kmr/stella"
              target="_blank"
              rel="noopener noreferrer"
            >
              Read the source
            </a>
          </div>

          <p className="prose prose--small" data-reveal>
            The console holds the socket open to <code>/ws/live</code> and falls back to REST
            polling if it drops, so the sheets stay live with the network off. Start it with the
            API down and the panels say so rather than inventing values.
          </p>
        </div>
      </section>
    </>
  );
}