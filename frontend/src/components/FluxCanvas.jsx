import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { createScene, STAGES, PLAN_LOG } from '../flux.js';
import { createAperture } from '../aperture.js';

gsap.registerPlugin(ScrollTrigger);

/**
 * The signature element: one canvas carrying ingest → impact, scrubbed by
 * scroll.
 *
 * The stage caption is React state because it changes six times. The counters
 * are written straight to the DOM — they change every frame, and re-rendering
 * the tree at scroll rate to move three numbers is how a smooth scrub turns
 * into a janky one.
 */
export default function FluxCanvas() {
  const trackRef = useRef(null);
  const canvasRef = useRef(null);
  const apertureRef = useRef(null);
  const apertureCtl = useRef(null);
  const titleRef = useRef(null);
  const captionRef = useRef(null);
  const readoutRef = useRef(null);
  const samplesRef = useRef(null);
  const aboveRef = useRef(null);
  const hardRef = useRef(null);
  const logRefs = useRef([]);
  const [phase, setPhase] = useState(0);
  const [atRest, setAtRest] = useState(true);

  useEffect(() => {
    const scene = createScene(canvasRef.current);
    scene.resize();

    const aperture = createAperture(apertureRef.current, '#ff5b2e');
    aperture.resize();
    apertureCtl.current = aperture;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let lastPhase = -1;
    let lastRest = true;
    let rafId = null;
    let rafStart = null;

    const spinAperture = (now) => {
      if (rafStart === null) rafStart = now;
      aperture.render((now - rafStart) / 1000);
      rafId = requestAnimationFrame(spinAperture);
    };
    if (reduced) aperture.render(0);
    else rafId = requestAnimationFrame(spinAperture);

    const paint = (progress) => {
      const state = scene.render(progress);
      if (samplesRef.current) samplesRef.current.textContent = state.samples.toLocaleString();
      if (aboveRef.current) aboveRef.current.textContent = state.above.toLocaleString();
      if (hardRef.current) hardRef.current.textContent = state.hardened.toLocaleString();
      if (state.phase !== lastPhase) {
        lastPhase = state.phase;
        setPhase(state.phase);
      }
      if (state.rest !== lastRest) {
        lastRest = state.rest;
        setAtRest(state.rest);
      }
      // The log accumulates: each line reaches full opacity and holds,
      // rather than the block overwriting itself every frame.
      state.plan.forEach((alpha, i) => {
        const el = logRefs.current[i];
        if (el) el.style.opacity = alpha;
      });
    };

    // Reduced motion: no scrub. Show the finished trace and let the section
    // be one screen rather than five and a half empty ones.
    if (reduced) {
      gsap.set([titleRef.current, apertureRef.current], { opacity: 0 });
      gsap.set([captionRef.current, readoutRef.current], { opacity: 1 });
      paint(1);
      const onResize = () => {
        scene.resize();
        paint(1);
        aperture.resize();
        aperture.render(0);
      };
      window.addEventListener('resize', onResize);
      return () => {
        window.removeEventListener('resize', onResize);
        if (rafId !== null) cancelAnimationFrame(rafId);
        scene.dispose();
      };
    }

    const onResize = () => {
      scene.resize();
      aperture.resize();
    };
    window.addEventListener('resize', onResize);

    const trigger = ScrollTrigger.create({
      trigger: trackRef.current,
      start: 'top top',
      end: 'bottom bottom',
      // A short scrub lag (rather than 1:1 `true`) is what reads as smooth —
      // the scene eases toward the scroll position instead of snapping every
      // tick. Same value on the title/caption crossfade so they never drift
      // out of sync with the canvas.
      scrub: 0.5,
      onUpdate: (self) => paint(self.progress),
      onRefresh: (self) => {
        scene.resize();
        paint(self.progress);
      },
    });

    // The title yields to the caption once ingest starts.
    const chrome = gsap
      .timeline({
        scrollTrigger: {
          trigger: trackRef.current,
          start: 'top top',
          end: '8% top',
          scrub: 0.5,
        },
      })
      .to([titleRef.current, apertureRef.current], { opacity: 0, ease: 'none' }, 0)
      .to(titleRef.current, { y: -24, ease: 'none' }, 0)
      .to([captionRef.current, readoutRef.current], { opacity: 1, ease: 'none' }, 0.4);

    paint(0);

    return () => {
      trigger.kill();
      chrome.scrollTrigger?.kill();
      chrome.kill();
      window.removeEventListener('resize', onResize);
      if (rafId !== null) cancelAnimationFrame(rafId);
      scene.dispose();
    };
  }, []);

  const [step, name, note] = STAGES[phase];

  return (
    <section className="fluxhero" ref={trackRef}>
      <div className="fluxhero__stage">
        <canvas className="fluxhero__canvas" ref={canvasRef} />

        <canvas
          className={`fluxhero__rest${atRest ? '' : ' fluxhero__rest--hidden'}`}
          aria-hidden="true"
          ref={apertureRef}
          onMouseEnter={() => apertureCtl.current?.setHover(true)}
          onMouseLeave={() => apertureCtl.current?.setHover(false)}
          onClick={() => apertureCtl.current?.pulse()}
        />

        <div className="fluxhero__title" ref={titleRef}>
          <h1 className="display">
            A solar flare is six hours of warning.
            <br />
            <em>STELLA reads it before it peaks.</em>
          </h1>
          <p className="lede">
            Aditya-L1 counts X-ray photons one minute at a time. STELLA labels each sample,
            watches the soft-to-hard ratio for the pre-flare signature, projects probability
            three hours ahead, and scores what the event would do to India's power grid and
            navigation networks.
          </p>
          <p className="scrollcue">Scroll to run the pipeline</p>
        </div>

        <figcaption className="fluxhero__caption" ref={captionRef} aria-live="polite">
          <span className="fluxhero__step">{step}</span>
          <span className="fluxhero__name">{name}</span>
          <span className="fluxhero__note">{note}</span>
        </figcaption>

        <div className="fluxhero__log" aria-live="polite">
          {PLAN_LOG.map((line, i) => (
            <span className="fluxhero__log-line" key={i} ref={(el) => (logRefs.current[i] = el)}>
              {line}
            </span>
          ))}
        </div>

        <div className="fluxhero__readout" ref={readoutRef}>
          {/* Samples, not events. These count the trace the canvas is
              actually drawing, so they cannot disagree with it. */}
          <div>
            <span>samples</span>
            <b ref={samplesRef}>0</b>
          </div>
          <div>
            <span>above C-class</span>
            <b ref={aboveRef}>0</b>
          </div>
          <div>
            <span>hardness &gt; 0.06</span>
            <b ref={hardRef}>0</b>
          </div>
        </div>
      </div>

      <p className="sr-only">
        An animation of a solar X-ray time series resolving from a quiet-Sun floor through
        three flares, as the flare classification, hardness gate, forecast, impact and catalog
        stages run. Every stage it depicts is described in the pipeline table below, and every
        number it shows is counted from the trace rather than asserted.
      </p>
    </section>
  );
}