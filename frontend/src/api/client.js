// Typed API client for the STELLA backend.
// In development the Vite proxy forwards /api and /ws to :8000.
const BASE = import.meta.env.VITE_API_URL || "/api";

async function get(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE}${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

export const status = () => get("/status");
export const timeseries = (hours = 6) => get("/timeseries", { hours });
export const alerts = () => get("/alerts");
export const catalog = () => get("/catalog");
export const impact = (flareClass = "M3.5") => get("/impact", { flare_class: flareClass });
export const indiaImpact = (flareClass = "M3.5") => get("/india-impact", { flare_class: flareClass });
export const explain = (flareClass = "M3.5") => get("/explain", { flare_class: flareClass });
export const metrics = () => get("/metrics");

export function connectLive(onFrame, onError) {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${window.location.host}/ws/live`);
  ws.onmessage = (ev) => onFrame(JSON.parse(ev.data));
  ws.onerror = onError;
  return () => ws.close();
}