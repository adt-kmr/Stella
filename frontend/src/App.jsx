import { useEffect, useState } from "react";
import { alerts, impact, metrics as fetchMetrics, status } from "./api/client.js";
import { useLiveFrame } from "./hooks/useLiveFrame.js";

const RISK_STYLE = {
  green: "#16a34a",
  yellow: "#eab308",
  orange: "#ea580c",
  red: "#dc2626",
};

function Panel({ title, children }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export default function App() {
  const { frame, connected } = useLiveFrame();
  const [sys, setSys] = useState(null);
  const [alertList, setAlertList] = useState([]);
  const [impactData, setImpactData] = useState(null);
  const [metricRows, setMetricRows] = useState([]);

  useEffect(() => {
    status().then(setSys).catch(console.error);
    alerts().then(setAlertList).catch(console.error);
    impact().then(setImpactData).catch(console.error);
    fetchMetrics().then((m) => setMetricRows(m.rows)).catch(console.error);
  }, []);

  const lead = frame.lead_minutes ?? sys?.lead_minutes ?? 30;

  return (
    <div className="app">
      <header>
        <h1>☀️ Helios-Cortex</h1>
        <span className={`badge ${connected ? "ok" : "idle"}`}>
          {connected ? "🟢 LIVE" : "⚠️ CONNECTING"}
        </span>
      </header>

      <div className="grid">
        <Panel title="Solar State">
          <p>
            <strong>Status:</strong> {connected ? "🟢 Online" : "⏳ Awaiting telemetry"}
          </p>
          <p>
            <strong>Lead time:</strong> +{lead} min until impact
          </p>
        </Panel>

        <Panel title="Nowcast">
          <p>
            <strong>Flare:</strong> {frame.flare_class ?? "—"} detected
          </p>
        </Panel>

        <Panel title="Forecast">
          <p>
            <strong>Confidence:</strong>{" "}
            {frame.forecast_confidence != null ? `${(frame.forecast_confidence * 100).toFixed(0)}%` : "—"}
          </p>
          <p>
            <strong>Lead time:</strong> +{frame.lead_minutes ?? "—"} min
          </p>
        </Panel>
      </div>

      {impactData && (
        <Panel title="Impact Assessment">
          <div className="impact">
            {impactData.domains.map((d) => (
              <div key={d.domain} className="risk-row">
                <span>{d.domain}</span>
                <span style={{ color: RISK_STYLE[d.risk], fontWeight: 700 }}>{d.risk}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {metricRows.length > 0 && (
        <Panel title="Validation Metrics">
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                <th>M-class</th>
                <th>X-class</th>
                <th>Industry floor</th>
              </tr>
            </thead>
            <tbody>
              {metricRows.map((r) => (
                <tr key={r.metric}>
                  <td>{r.metric}</td>
                  <td>{r.m_class}</td>
                  <td>{r.x_class}</td>
                  <td>{r.industry_floor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {alertList.length > 0 && (
        <Panel title="Recent Alerts">
          <ul>
            {alertList.map((a) => (
              <li key={a.id}>
                {a.flare_class} · lead +{a.lead_minutes} min · {a.issued_at}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}