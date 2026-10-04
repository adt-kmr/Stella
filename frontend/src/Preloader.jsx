import { useEffect, useRef } from 'react';
import gsap from 'gsap';

import { TRACE } from './flux.js';

/**
 * The instrument warming up. Counts to the real size of the trace the hero
 * goes on to draw, so the number on screen is the one the canvas actually
 * uses — not a decorative figure that happens to be plausible.
 *
 * A bail-out timer guarantees the page can never stay covered because the
 * animation was interrupted or a frame never landed.
 *
 * Under reduced motion the overlay is simply never mounted: the count is
 * already in the DOM as a static string, and the hero paints its finished
 * state immediately, so there is nothing to animate and nothing to wait for.
 */
export default function Preloader() {
  const rootRef = useRef(null);
  const scanRef = useRef(null);
  const countRef = useRef(null);

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const root = rootRef.current;
    if (!root || reduced) return;

    const total = TRACE.n;
    const counter = { value: 0 };

    // The overlay is hidden by setting `hidden` on the element rather than
    // by clearing React state. The animation is a side effect, so it belongs
    // in an effect, and hiding the node it already owns does not need a
    // re-render — which is what the previous setState-driven version was
    // doing, at the cost of a cascading render on the landing route.
    const tl = gsap.timeline({ onComplete: () => root.setAttribute('hidden', '') });

    tl.to(scanRef.current, { xPercent: 460, duration: 1.4, ease: 'power1.inOut' }, 0)
      .to(
        counter,
        {
          value: total,
          duration: 1.4,
          ease: 'power2.out',
          onUpdate: () => {
            if (countRef.current) {
              countRef.current.textContent = Math.round(counter.value).toLocaleString();
            }
          },
        },
        0
      )
      .to(root, { yPercent: -101, duration: 0.7, ease: 'expo.inOut' }, 1.45);

    // The page must never stay covered because a frame never landed.
    const bail = setTimeout(() => {
      tl.progress(1);
      root.setAttribute('hidden', '');
    }, 3500);

    return () => {
      clearTimeout(bail);
      tl.kill();
    };
  }, [reduced]);

  if (reduced) return null;

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