import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

import { TRACE } from './flux.js';

/**
 * The instrument warming up. Counts to the real size of the trace the hero
 * goes on to draw, so the number on screen is the one the canvas actually
 * uses — not a decorative figure that happens to be plausible.
 *
 * A bail-out timer guarantees the page can never stay covered because the
 * animation was interrupted or a frame never landed.
 */
export default function Preloader() {
  const rootRef = useRef(null);
  const scanRef = useRef(null);
  const countRef = useRef(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const total = TRACE.n;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      countRef.current.textContent = total.toLocaleString();
      setGone(true);
      return;
    }

    const counter = { value: 0 };
    const tl = gsap.timeline({ onComplete: () => setGone(true) });

    tl.to(scanRef.current, { xPercent: 460, duration: 1.4, ease: 'power1.inOut' }, 0)
      .to(
        counter,
        {
          value: total,
          duration: 1.4,
          ease: 'power2.out',
          onUpdate: () => {
            countRef.current.textContent = Math.round(counter.value).toLocaleString();
          },
        },
        0
      )
      .to(rootRef.current, { yPercent: -101, duration: 0.7, ease: 'expo.inOut' }, 1.45);

    const bail = setTimeout(() => {
      tl.progress(1);
      setGone(true);
    }, 3500);

    return () => {
      clearTimeout(bail);
      tl.kill();
    };
  }, []);

  if (gone) return null;

  return (
    <div className="preload" ref={rootRef} aria-hidden="true">
      <div className="preload__body">
        <span className="preload__eyebrow">Calibrating flux</span>
        <div className="preload__bar">
          <i className="preload__scan" ref={scanRef} />
        </div>
        <p className="preload__count">
          <span ref={countRef}>0</span> samples acquired
        </p>
      </div>
    </div>
  );
}