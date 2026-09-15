import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { useLiveState } from '../lib/data';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: '◉' },
  { key: 'impact', label: 'Impact', icon: '✦' },
  { key: 'replay', label: 'Replay', icon: '▶' },
  { key: 'catalog', label: 'Catalog', icon: '☰' },
  { key: 'metrics', label: 'Metrics', icon: '◈' },
];

export default function Header({ view, onView, time, onLogoClick }) {
  const { systemStatus } = useLiveState();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isOnline = systemStatus.pipeline !== 'Disconnected (Offline)';

  // Sliding indicator
  const navRef = useRef(null);
  const btnRefs = useRef({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const updateIndicator = useCallback(() => {
    const navEl = navRef.current;
    const btnEl = btnRefs.current[view];
    if (!navEl || !btnEl) return;
    const navRect = navEl.getBoundingClientRect();
    const btnRect = btnEl.getBoundingClientRect();
    setIndicator({
      left: btnRect.left - navRect.left,
      width: btnRect.width,
    });
  }, [view]);

  useLayoutEffect(() => {
    updateIndicator();
  }, [view, updateIndicator]);

  useEffect(() => {
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [updateIndicator]);

  const handleView = (v) => {
    onView(v);
    setMobileMenuOpen(false);
  };

  return (
    <header className="app-header">
      <div className="header-inner">
        {/* Left: Branding */}
        <div className="header-brand" onClick={onLogoClick} style={{ cursor: 'pointer', userSelect: 'none' }}>
          <div className="brand-text">
            <span className="brand-name">STELLA</span>
            <span className="brand-sub">Aditya-L1</span>
          </div>
        </div>

        {/* Center: Navigation with sliding indicator */}
        <nav className="header-nav" ref={navRef} style={{ position: 'relative' }}>
          {/* Sliding highlight pill */}
          <div
            style={{
              position: 'absolute',
              top: 4,
              bottom: 4,
              left: indicator.left,
              width: indicator.width,
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255,255,255,0.1)',
              boxShadow: '0 0 20px rgba(255,255,255,0.05)',
              transition: 'left 0.35s cubic-bezier(0.4, 0, 0.2, 1), width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
              zIndex: 0,
              pointerEvents: 'none',
            }}
          />
          {NAV_ITEMS.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => handleView(key)}
              className={`nav-pill ${view === key ? 'nav-pill-active' : ''}`}
              ref={(el) => { btnRefs.current[key] = el; }}
            >
              <span className="nav-pill-icon">{icon}</span>
              <span className="nav-pill-label">{label}</span>
            </button>
          ))}
        </nav>

        {/* Right: Status + Clock */}
        <div className="header-right">
          <div className="header-status">
            <span className={`status-beacon ${isOnline ? 'beacon-online' : 'beacon-offline'}`}></span>
            <span className="status-label">{isOnline ? 'LIVE' : 'OFFLINE'}</span>
          </div>
          <div className="header-divider"></div>
          <div className="header-latency">{systemStatus.dataLatency}</div>
          <div className="header-divider"></div>
          <div className="header-clock">
            {time.toISOString().replace('T', ' ').slice(0, 19)} UTC
          </div>

          {/* Mobile Hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="mobile-menu-btn"
            aria-label="Toggle navigation menu"
          >
            <span>{mobileMenuOpen ? '✕' : '☰'}</span>
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileMenuOpen && (
        <div className="mobile-nav">
          {NAV_ITEMS.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => handleView(key)}
              className={`mobile-nav-item ${view === key ? 'mobile-nav-active' : ''}`}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
