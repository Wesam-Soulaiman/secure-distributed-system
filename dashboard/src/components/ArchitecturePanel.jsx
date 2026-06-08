import React from "react";

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isEnabledStatus(value) {
  return ["enabled", "active", "running", "on"].includes(
    normalizeStatus(value),
  );
}

function LayerStatus({ label, value, state = "healthy" }) {
  const className =
    state === "healthy"
      ? "architecture-status-success"
      : state === "warning"
        ? "architecture-status-warning"
        : "architecture-status-danger";

  return (
    <div className="architecture-status-row">
      <span>{label}</span>

      <span className={`architecture-status-value ${className}`}>{value}</span>
    </div>
  );
}

function FlowNode({
  title,
  subtitle,
  badge,
  badgeClassName = "status-neutral",
}) {
  return (
    <div className="flow-node">
      <div className="flow-node-header">
        <strong>{title}</strong>

        {badge && (
          <span className={`status-pill ${badgeClassName}`}>{badge}</span>
        )}
      </div>

      <span className="flow-node-subtitle">{subtitle}</span>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flow-arrow" aria-hidden="true">
      ↓
    </div>
  );
}

function ArchitecturePanel({ clusterStatus, wafStatus, rateLimitStatus }) {
  const leader = clusterStatus?.raft?.currentLeader;

  const nodes = clusterStatus?.raft?.nodes || [];

  const healthyNodes = nodes.filter((node) => node.healthy).length;

  const wafState = wafStatus?.waf ?? wafStatus?.status ?? null;

  const rateLimitState =
    rateLimitStatus?.rateLimit ?? rateLimitStatus?.status ?? null;

  const wafEnabled = isEnabledStatus(wafState);

  const rateLimitEnabled = isEnabledStatus(rateLimitState);

  const wafLabel = wafStatus
    ? wafEnabled
      ? "Enabled"
      : normalizeStatus(wafState) || "Disabled"
    : "Unknown";

  const rateLimitLabel = rateLimitStatus
    ? rateLimitEnabled
      ? "Enabled"
      : normalizeStatus(rateLimitState) || "Disabled"
    : "Unknown";

  return (
    <section className="panel architecture-panel">
      <div className="panel-header">
        <div>
          <span className="panel-eyebrow">System Design</span>

          <h2>Request Flow Architecture</h2>

          <p>
            Each request passes through the security gateway before reaching the
            load balancer and Raft cluster.
          </p>
        </div>
      </div>

      <div className="architecture-layout">
        <div className="architecture-flow">
          <FlowNode
            title="Client / Browser"
            subtitle="React dashboard or external API client"
            badge="Entry"
          />

          <FlowArrow />

          <FlowNode
            title="Nginx Gateway"
            subtitle="Reverse proxy and security boundary"
            badge="Running"
            badgeClassName="status-success"
          />

          <div className="security-flow-row">
            <FlowNode
              title="WAF"
              subtitle="SQL injection, XSS, traversal, and suspicious clients"
              badge={wafLabel}
              badgeClassName={
                wafEnabled
                  ? "status-success"
                  : wafStatus
                    ? "status-danger"
                    : "status-warning"
              }
            />

            <FlowNode
              title="Rate Limiting"
              subtitle="Controls request frequency and traffic bursts"
              badge={rateLimitLabel}
              badgeClassName={
                rateLimitEnabled
                  ? "status-success"
                  : rateLimitStatus
                    ? "status-danger"
                    : "status-warning"
              }
            />
          </div>

          <FlowArrow />

          <FlowNode
            title="Custom Load Balancer"
            subtitle="Weighted routing, hashing, retry, and circuit breaker"
            badge="Active"
            badgeClassName="status-success"
          />

          <FlowArrow />

          <FlowNode
            title="Raft Cluster"
            subtitle={`${healthyNodes}/${nodes.length} nodes healthy`}
            badge={leader ? `Leader: ${leader}` : "Election"}
            badgeClassName={leader ? "status-leader" : "status-warning"}
          />
        </div>

        <aside className="architecture-status-card">
          <h3>Layer Status</h3>

          <LayerStatus label="Gateway" value="Running" />

          <LayerStatus
            label="WAF"
            value={wafLabel}
            state={wafEnabled ? "healthy" : wafStatus ? "danger" : "warning"}
          />

          <LayerStatus
            label="Rate Limit"
            value={rateLimitLabel}
            state={
              rateLimitEnabled
                ? "healthy"
                : rateLimitStatus
                  ? "danger"
                  : "warning"
            }
          />

          <LayerStatus label="Load Balancer" value="Running" />

          <LayerStatus
            label="Healthy Nodes"
            value={`${healthyNodes}/${nodes.length}`}
            state={
              nodes.length === 0
                ? "warning"
                : healthyNodes === nodes.length
                  ? "healthy"
                  : healthyNodes > 0
                    ? "warning"
                    : "danger"
            }
          />

          <LayerStatus
            label="Raft Leader"
            value={leader || "Election in progress"}
            state={leader ? "healthy" : "warning"}
          />
        </aside>
      </div>
    </section>
  );
}

export default ArchitecturePanel;
