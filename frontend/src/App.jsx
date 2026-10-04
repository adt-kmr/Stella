import React, { useEffect } from 'react';

import { Link, usePath, ROUTES, routeFor } from './router.jsx';
import { initWebSocketConnection, requestNotificationPermission, useNotificationWatcher } from './lib/data.js';

import Landing from './components/Landing.jsx';
import Dashboard from './components/Dashboard.jsx';
import Impact from './components/ImpactPanel.jsx';
import Replay from './components/Replay.jsx';
import Catalog from './components/Catalog.jsx';
import Metrics from './components/Metrics.jsx';

/**
 * The sheet both routes are printed on: `/` is the index, the console routes
 * are the working sheets. Masthead, registration marks and the footer stamp
 * are shared, which is what keeps the index and the console reading as one
 * document rather than two sites.
 */
const VIEWS = {
  '/dashboard': Dashboard,
  '/impact': Impact,
  '/replay': Replay,
  '/catalog': Catalog,
  '/metrics': Metrics,
};

export default function App() {
  const path = usePath();
  const onIndex = path === '/';
  const route = routeFor(path);
  const View = VIEWS[path];

  // The pipe is opened once. The console lives on the socket; if it drops,
  // data.js falls back to REST polling and retries the socket.
  useEffect(() => {
    initWebSocketConnection();
    const id = setTimeout(() => requestNotificationPermission(), 3000);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="sheet">
      <span className="reg reg--tl" aria-hidden="true" />
      <span className="reg reg--tr" aria-hidden="true" />
      <span className="reg reg--bl" aria-hidden="true" />
      <span className="reg reg--br" aria-hidden="true" />

      <header className="masthead">
        <Link className="masthead__mark" to="/">
          STELLA
        </Link>

        <nav className="masthead__nav">
          {ROUTES.map((r) => (
            <Link key={r.to} className={r.to === path ? 'is-here' : ''} to={r.to}>
              {r.label}
            </Link>
          ))}
        </nav>

        {/* Sheet metadata. This is what makes the index and the console read as
            one document: both are sheets of the same drawing set. */}
        <div className="masthead__meta">
          <span>
            Sheet <b>{route.sheet}</b>
          </span>
          <span>
            Rev <b>{route.label}</b>
          </span>
        </div>
      </header>

      <main>{onIndex ? <Landing /> : <View route={route} />}</main>

      <footer className="stamp">
        <span>STELLA</span>
        <span>Solar Temporal Event Learning &amp; Likelihood Assessment</span>
        <span>Software Engineering Project · Course Code UCS503</span>
      </footer>
    </div>
  );
}