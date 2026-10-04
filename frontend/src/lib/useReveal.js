import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

let registered = false;
function ensurePlugin() {
  if (!registered) {
    gsap.registerPlugin(ScrollTrigger);
    registered = true;
  }
}

/**
 * useReveal — reveal every [data-reveal] inside `scope`.
 *
 * The motion tokens are read from CSS so the stylesheet stays the
 * single source of truth: reveal 0.7s power2.out, stagger 0.07.
 *
 * Two properties matter:
 *
 *   1. Gated on prefers-reduced-motion. When the user has asked
 *      for less motion we simply never animate — content is
 *      visible from the first paint because the hook sets no
 *      initial hidden state.
 *   2. Elements are visible by default in CSS. This hook only
 *      adds the animation, so a JS failure can never leave the
 *      page blank.
 */
export function useReveal(scopeRef, deps = []) {
  const localRef = useRef(scopeRef);

  useEffect(() => {
    const scope = localRef.current?.current;
    if (!scope) return;

    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    ensurePlugin();

    // Read the tokens the stylesheet declares.
    const css = getComputedStyle(document.documentElement);
    const dur = parseFloat(css.getPropertyValue('--motion-reveal')) || 0.7;
    const stagger = parseFloat(css.getPropertyValue('--motion-stagger')) || 0.07;

    const ctx = gsap.context(() => {
      const groups = new Map();

      scope.querySelectorAll('[data-reveal]').forEach((el) => {
        const group = el.dataset.reveal || 'default';
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(el);
      });

      groups.forEach((els, group) => {
        gsap.fromTo(
          els,
          { y: 18, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: dur,
            ease: 'power2.out',
            stagger,
            // Each group is its own scroll trigger so bands that
            // share a name do not animate off-screen together.
            scrollTrigger: {
              trigger: els[0],
              start: 'top 88%',
              once: true,
              id: `reveal-${group}`,
            },
          }
        );
      });
    }, scope);

    ScrollTrigger.refresh();

    return () => {
      ctx.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * usePrefersReducedMotion — reactive read, for components that
 * need to change layout rather than just animation.
 */
export function usePrefersReducedMotion() {
  const ref = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  return ref.current;
}