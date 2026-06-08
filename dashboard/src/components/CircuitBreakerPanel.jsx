import React from "react";

function getCircuitClass(state) {
  if (state === "OPEN") {
    return "status-danger";
  }

  if (state === "HALF_OPEN") {
    return "status-warning";
  }

  return "status-success";
}

function getCircuitDescription(state) {
  if (state === "OPEN") {
    return "Requests are blocked until the cooldown expires.";
  }

  if (state === "HALF_OPEN") {
    return "A limited recovery request is allowed.";
  }

  return "Requests are allowed normally.";
}

function formatCooldown(milliseconds) {
  if (!milliseconds || milliseconds <= 0) {
    return "Ready";
  }

  if (milliseconds < 1000) {
    return `${milliseconds} ms`;
  }

  return `${(milliseconds / 1000).toFixed(1)} s`;
}

function calculateCooldownProgress(remainingCooldownMs, openDurationMs) {
  if (!openDurationMs || openDurationMs <= 0) {
    return 0;
  }

  const remainingPercentage = (remainingCooldownMs / openDurationMs) * 100;

  return Math.min(100, Math.max(0, remainingPercentage));
}

function CircuitNodeCard({ node, configuration }) {
  const circuit = node.circuitBreaker || {};

  const state = circuit.state || "UNKNOWN";

  const openDurationMs =
    circuit.openDurationMs || configuration?.openDurationMs || 0;

  const remainingCooldownMs = circuit.remainingCooldownMs || 0;

  const cooldownProgress = calculateCooldownProgress(
    remainingCooldownMs,
    openDurationMs,
  );

  return (
    <article className="circuit-node-card">
      <div className="circuit-node-header">
        <div>
          <span className="node-id-label">Protected Node</span>

          <h3>{node.id}</h3>
        </div>

        <span className={`status-pill ${getCircuitClass(state)}`}>{state}</span>
      </div>

      <p className="circuit-description">{getCircuitDescription(state)}</p>

      <div className="circuit-metrics-grid">
        <div className="circuit-metric">
          <span>Consecutive Failures</span>
          <strong>{circuit.consecutiveFailures ?? 0}</strong>
        </div>

        <div className="circuit-metric">
          <span>Total Trips</span>
          <strong>{circuit.totalTrips ?? 0}</strong>
        </div>

        <div className="circuit-metric">
          <span>Half-Open Requests</span>
          <strong>{circuit.halfOpenRequests ?? 0}</strong>
        </div>

        <div className="circuit-metric">
          <span>Routing</span>
          <strong>{node.includedInRouting ? "Included" : "Excluded"}</strong>
        </div>
      </div>

      <div className="circuit-cooldown">
        <div className="circuit-cooldown-header">
          <span>Recovery Cooldown</span>

          <strong>{formatCooldown(remainingCooldownMs)}</strong>
        </div>

        <div className="cooldown-track">
          <div
            className={`cooldown-fill cooldown-${state.toLowerCase()}`}
            style={{
              width: `${cooldownProgress}%`,
            }}
          />
        </div>
      </div>

      <div className="circuit-timestamps">
        <div>
          <span>Last Failure</span>
          <strong>
            {circuit.lastFailureAt
              ? new Date(circuit.lastFailureAt).toLocaleTimeString()
              : "None"}
          </strong>
        </div>

        <div>
          <span>Last Success</span>
          <strong>
            {circuit.lastSuccessAt
              ? new Date(circuit.lastSuccessAt).toLocaleTimeString()
              : "None"}
          </strong>
        </div>
      </div>
    </article>
  );
}

function CircuitBreakerPanel({ nodes, configuration, onRefreshHealth }) {
  const openCount = nodes.filter(
    (node) => node.circuitBreaker?.state === "OPEN",
  ).length;

  const halfOpenCount = nodes.filter(
    (node) => node.circuitBreaker?.state === "HALF_OPEN",
  ).length;

  const closedCount = nodes.filter(
    (node) => node.circuitBreaker?.state === "CLOSED",
  ).length;

  return (
    <section className="panel circuit-panel">
      <div className="panel-header">
        <div>
          <span className="panel-eyebrow">Fault Tolerance</span>

          <h2>Circuit Breaker</h2>

          <p>
            Protects the load balancer from repeatedly calling failing nodes.
          </p>
        </div>

        <button
          type="button"
          className="button secondary"
          onClick={onRefreshHealth}
        >
          Refresh Health
        </button>
      </div>

      <div className="circuit-summary">
        <div>
          <span className="status-pill status-success">
            CLOSED {closedCount}
          </span>
        </div>

        <div>
          <span className="status-pill status-warning">
            HALF_OPEN {halfOpenCount}
          </span>
        </div>

        <div>
          <span className="status-pill status-danger">OPEN {openCount}</span>
        </div>
      </div>

      <div className="circuit-configuration">
        <span>
          Failure Threshold:{" "}
          <strong>{configuration?.failureThreshold ?? "-"}</strong>
        </span>

        <span>
          Open Duration:{" "}
          <strong>
            {configuration?.openDurationMs
              ? `${configuration.openDurationMs / 1000}s`
              : "-"}
          </strong>
        </span>
      </div>

      <div className="circuit-node-list">
        {nodes.length > 0 ? (
          nodes.map((node) => (
            <CircuitNodeCard
              key={node.id}
              node={node}
              configuration={configuration}
            />
          ))
        ) : (
          <div className="empty-state">
            Waiting for circuit breaker status...
          </div>
        )}
      </div>
    </section>
  );
}

export default CircuitBreakerPanel;
