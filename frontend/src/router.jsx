import { useSyncExternalStore } from 'react';

/* Five console routes plus the index sheet, so five routes' worth of router.
   History API + popstate is the whole thing; swap in react-router the moment
   nested routes or params show up. */

/* The subscribe function is module-level and stable, which is what lets
   useSyncExternalStore avoid tearing: one store, one snapshot. */
const subscribe = (onChange) => {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
};

const readPath = () => window.location.pathname || '/';

export const usePath = () =>
  useSyncExternalStore(subscribe, readPath, () => '/');

export function navigate(to) {
  if (to === window.location.pathname) return;
  window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}

/** An anchor that routes in-app but stays a real link — middle-click and
    open-in-new-tab keep working, which a <span onClick> would quietly break. */
export function Link({ to, children, ...rest }) {
  const onClick = (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.button !== 0) return;
    event.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={onClick} {...rest}>
      {children}
    </a>
  );
}

/* The route table. Each console route is a sheet of the same document, so
   each carries its own sheet number and the masthead quotes it. */
export const ROUTES = [
  { to: '/', label: 'Index', sheet: '00', kicker: 'Solar Temporal Event Learning & Likelihood Assessment' },
  { to: '/dashboard', label: 'Nowcast', sheet: '01', kicker: 'Live nowcast' },
  { to: '/impact', label: 'Impact', sheet: '02', kicker: 'Infrastructure impact' },
  { to: '/replay', label: 'Replay', sheet: '03', kicker: 'Historical replay' },
  { to: '/catalog', label: 'Catalog', sheet: '04', kicker: 'Recorded events' },
  { to: '/metrics', label: 'Validation', sheet: '05', kicker: 'Model validation' },
];

export function routeFor(path) {
  return ROUTES.find((r) => r.to === path) || ROUTES[0];
}