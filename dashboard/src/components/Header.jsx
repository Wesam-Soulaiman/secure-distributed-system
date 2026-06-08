import React from "react";

function formatRefreshTime(date) {
  if (!date) {
    return "Not refreshed yet";
  }

  return date.toLocaleTimeString();
}

function getClusterState(clusterStatus) {
  const nodes = clusterStatus?.raft?.nodes || [];

  const healthyNodes = nodes.filter((node) => node.healthy);

  const leader = clusterStatus?.raft?.currentLeader;

  const majority = Math.floor(nodes.length / 2) + 1;

  if (nodes.length === 0) {
    return {
      label: "Loading",
      className: "status-neutral",
    };
  }

  if (healthyNodes.length < majority) {
    return {
      label: "Unavailable",
      className: "status-danger",
    };
  }

  if (!leader) {
    return {
      label: "Election in progress",
      className: "status-warning",
    };
  }

  if (healthyNodes.length < nodes.length) {
    return {
      label: "Degraded",
      className: "status-warning",
    };
  }

  return {
    label: "Healthy",
    className: "status-success",
  };
}

function Header({
  loading,
  autoRefresh,
  lastRefreshAt,
  clusterStatus,
  onRefresh,
  onToggleAutoRefresh,
  onResetStats,
}) {
  const clusterState = getClusterState(clusterStatus);

  const currentLeader = clusterStatus?.raft?.currentLeader || "None";

  return (
    <header className="dashboard-header">
      <div className="header-main">
        <div>
          <div className="eyebrow">Distributed Systems Demo</div>

          <h1>Secure Distributed System</h1>

          <p className="header-description">
            Nginx Gateway, WAF, Rate Limiting, Load Balancing, Raft Consensus,
            Retry, and Circuit Breaker
          </p>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>

          <button
            type="button"
            className={
              autoRefresh ? "button toggle-active" : "button secondary"
            }
            onClick={onToggleAutoRefresh}
          >
            Auto Refresh: {autoRefresh ? "ON" : "OFF"}
          </button>

          <button
            type="button"
            className="button danger-outline"
            onClick={onResetStats}
          >
            Reset Statistics
          </button>
        </div>
      </div>

      <div className="header-status-bar">
        <div className="header-status-item">
          <span className="status-label">Cluster</span>

          <span className={`status-pill ${clusterState.className}`}>
            {clusterState.label}
          </span>
        </div>

        <div className="header-status-item">
          <span className="status-label">Leader</span>

          <strong>{currentLeader}</strong>
        </div>

        <div className="header-status-item">
          <span className="status-label">Last Refresh</span>

          <strong>{formatRefreshTime(lastRefreshAt)}</strong>
        </div>
      </div>
    </header>
  );
}

export default Header;
