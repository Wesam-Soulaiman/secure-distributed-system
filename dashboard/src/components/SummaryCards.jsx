import React from "react";

function SummaryCard({
  title,
  value,
  description,
  badge,
  badgeClassName = "status-neutral",
  footer,
}) {
  return (
    <article className="summary-card">
      <div className="summary-card-top">
        <span className="summary-title">{title}</span>

        {badge && (
          <span className={`status-pill ${badgeClassName}`}>{badge}</span>
        )}
      </div>

      <div className="summary-value">{value}</div>

      <p className="summary-description">{description}</p>

      {footer && <div className="summary-footer">{footer}</div>}
    </article>
  );
}

function getLeaderTerm(currentLeader) {
  return currentLeader?.raft?.currentTerm ?? "-";
}

function getReplicationStatus(currentLeader) {
  if (!currentLeader?.raft) {
    return {
      label: "Unavailable",
      className: "status-danger",
    };
  }

  const { commitIndex = 0, lastApplied = 0 } = currentLeader.raft;

  if (commitIndex === lastApplied) {
    return {
      label: "Synchronized",
      className: "status-success",
    };
  }

  return {
    label: "Applying",
    className: "status-warning",
  };
}

function SummaryCards({
  totalNodes,
  healthyNodeCount,
  currentLeader,
  openCircuitCount,
  lbStatus,
  retryData,
}) {
  const majority = totalNodes > 0 ? Math.floor(totalNodes / 2) + 1 : 0;

  const clusterAvailable = majority > 0 && healthyNodeCount >= majority;

  const replicationStatus = getReplicationStatus(currentLeader);

  const commitIndex = currentLeader?.raft?.commitIndex ?? 0;

  const lastApplied = currentLeader?.raft?.lastApplied ?? 0;

  const logLength =
    currentLeader?.raft?.logLength ?? currentLeader?.raft?.log?.length ?? 0;

  const retryAttempts =
    retryData?.leaderDiscoveryAttempts ??
    retryData?.totalAttempts ??
    retryData?.attempts?.length ??
    0;

  const circuitBreakerEnabled = lbStatus?.circuitBreaker?.enabled === true;

  return (
    <section className="summary-grid">
      <SummaryCard
        title="Cluster Health"
        value={`${healthyNodeCount} / ${totalNodes}`}
        description="Healthy Raft nodes currently available."
        badge={clusterAvailable ? "Available" : "Unavailable"}
        badgeClassName={clusterAvailable ? "status-success" : "status-danger"}
        footer={`Majority required: ${majority}`}
      />

      <SummaryCard
        title="Raft Leader"
        value={currentLeader?.id || "None"}
        description="Writes are routed to the currently elected leader."
        badge={currentLeader ? "Leader Active" : "Election"}
        badgeClassName={currentLeader ? "status-leader" : "status-warning"}
        footer={`Current term: ${getLeaderTerm(currentLeader)}`}
      />

      <SummaryCard
        title="Replication"
        value={`${commitIndex} / ${lastApplied}`}
        description="Commit index compared with the last applied entry."
        badge={replicationStatus.label}
        badgeClassName={replicationStatus.className}
        footer={`Leader log length: ${logLength}`}
      />

      <SummaryCard
        title="Fault Tolerance"
        value={
          openCircuitCount === 0 ? "Protected" : `${openCircuitCount} Open`
        }
        description="Retry and circuit breaker protection status."
        badge={openCircuitCount === 0 ? "Operational" : "Degraded"}
        badgeClassName={
          openCircuitCount === 0 ? "status-success" : "status-danger"
        }
        footer={
          retryAttempts > 0
            ? `Last leader discovery attempts: ${retryAttempts}`
            : `Circuit breaker: ${
                circuitBreakerEnabled ? "Enabled" : "Unknown"
              }`
        }
      />
    </section>
  );
}

export default SummaryCards;
