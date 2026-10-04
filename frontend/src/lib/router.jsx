import { useSyncExternalStore, useCallback } from 'react';

/**
 * STELLA router.
 *
 * A 2kb router built on useSyncExternalStore instead of a
 * routing library. Two properties matter here:
 *
 *   1. middle-click, ctrl-click and cmd-click keep their native
 *      behaviour, because <Link> is a real <a href> rather than
 *      a div with an onClick. Opening the console in a new tab
 *      works because the URL is a real path, not a hash.
 *   2. there is exactly one store, so every subscriber sees the
 *      same snapshot and React will not tear.
 *
 * The gate is the product: an unknown path is refused with a real
 * refusal block rather than silently redirected.
 */

const listeners = new Set();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let snapshot = {
  path: readPath(),
  route: null,
  params: {},
};

function readPath() {
  if (typeof window === 'undefined') return '/';
  const p = window.location.pathname;
  return p === '' ? '/' : p;
}

/**
 * Route table. Each entry declares its own sheet number, because
 * a survey sheet is numbered and you cite it by number.
 */
export const ROUTES = {
  '/': {
    id: 'landing',
    sheet: '00',
    title: 'Index',
    kicker: 'Solar Temporal Event Learning & Likelihood Assessment',
  },
  '/dashboard': {
    id: 'dashboard',
    sheet: '01',
    title: 'Nowcast Console',
    kicker: 'Live nowcast',
  },
  '/impact': {
    id: 'impact',
    sheet: '02',
    title: 'Impact Assessment',
    kicker: 'Infrastructure impact',
  },
  '/replay': {
    id: 'replay',
    sheet: '03',
    title: 'Event Replay',
    kicker: 'Historical replay',
  },
  '/catalog': {
    id: 'catalog',
    sheet: '04',
    title: 'Event Catalog',
    kicker: 'Recorded events',
  },
  '/metrics': {
    id: 'metrics',
    sheet: '05',
    title: 'Validation',
    kicker: 'Model validation',
  },
};

function resolve(path) {
  // Exact match, then a trailing-slash-tolerant match.
  if (ROUTES[path]) return path;
  const trimmed = path.replace(/\/+$/, '');
  if (ROUTES[trimmed]) return trimmed;
  return null;
}

function build() {
  const path = readPath();
  const route = resolve(path);
  return { path, route, params: {} };
}

/** Public: current route snapshot. */
export function getSnapshot() {
  return snapshot;
}

/** navigate('/impact') — pushState + notify subscribers. */
export function navigate(to, { replace = false } = {}) {
  if (typeof window === 'undefined') return;
  const next = resolve(to) ? resolve(to) : to;
  if (next === readPath()) return;

  if (replace) {
    window.history.replaceState({}, '', next);
  } else {
    window.history.pushState({}, '', next);
  }
  snapshot = build();
  emit();

  // A route change is a new sheet: start it at the top.
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/** Initialise history wiring exactly once. */
let wired = false;
export function initRouter() {
  if (wired || typeof window === 'undefined') return;
  wired = true;

  window.addEventListener('popstate', () => {
    snapshot = build();
    emit();
  });

  snapshot = build();
}

/** usePath() — the current path string. */
export function usePath() {
  return useSyncExternalStore(subscribe, getSnapshot, () => getSnapshot()).path;
}

/** useRoute() — { path, route, params }. */
export function useRoute() {
  return useSyncExternalStore(subscribe, getSnapshot, () => getSnapshot());
}

/**
 * <Link href="/impact"> — a real anchor, so middle-click and
 * "open in new tab" behave the way the browser intends. Plain
 * left-clicks are intercepted for a client-side transition.
 */
export function Link({ href, children, onClick, className, ...rest }) {
  const handleClick = useCallback(
    (e) => {
      onClick?.(e);
      if (e.defaultPrevented) return;
      // Let the browser handle modified clicks and non-primary
      // buttons so middle-click still opens a new tab.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (e.button !== 0) return;
      if (!resolve(href)) return; // let real URLs navigate away

      e.preventDefault();
      navigate(href);
    },
    [href, onClick]
  );

  return (
    <a href={href} onClick={handleClick} className={className} {...rest}>
      {children}
    </a>
  );
}