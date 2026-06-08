import React from "react";

function getRoleBadgeClass(role, healthy) {
  if (!healthy) {
    return "status-danger";
  }

  if (role === "leader") {
    return "status-leader";
  }

  if (role === "candidate") {
    return "status-warning";
  }

  return "status-neutral";
}

function getRoleLabel(role, healthy) {
  if (!healthy) {
    return "OFFLINE";
  }

  if (!role) {
    return "UNKNOWN";
  }

  return role.toUpperCase();
}

function formatHeartbeat(value, role) {
  if (role === "leader") {
    return "Leader sends heartbeats";
  }

  if (!value) {
    return "Not received";
  }

  const timestamp = new Date(value);
  const elapsedMs = Date.now() - timestamp.getTime();

  if (Number.isNaN(elapsedMs)) {
    return value;
  }

  if (elapsedMs < 1000) {
    return `${elapsedMs} ms ago`;
  }

  const elapsedSeconds = elapsedMs / 1000;

  if (elapsedSeconds < 60) {
    return `${elapsedSeconds.toFixed(1)} seconds ago`;
  }

  return timestamp.toLocaleTimeString();
}

function DetailItem({ label, value, highlight = false }) {
  return (
    <div className="raft-detail-item">
      <span className="raft-detail-label">{label}</span>

      <strong
        className={
          highlight ? "raft-detail-value highlight" : "raft-detail-value"
        }
      >
        {value ?? "-"}
      </strong>
    </div>
  );
}

function RaftNodeCard({ node, isCurrentLeader }) {
  const raft = node.raft;
  const role = raft?.role || null;

  const logLength = raft?.logLength ?? raft?.log?.length ?? 0;

  const synchronized = raft && raft.commitIndex === raft.lastApplied;

  return (
    <article
      className={[
        "raft-node-card",
        isCurrentLeader ? "raft-node-card-leader" : "",
        !node.healthy ? "raft-node-card-offline" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="raft-node-card-header">
        <div>
          <span className="node-id-label">Raft Node</span>

          <h3>{node.id}</h3>
        </div>

        <span
          className={`status-pill ${getRoleBadgeClass(role, node.healthy)}`}
        >
          {getRoleLabel(role, node.healthy)}
        </span>
      </div>

      <div className="node-health-line">
        <span
          className={
            node.healthy
              ? "health-dot health-dot-success"
              : "health-dot health-dot-danger"
          }
        />

        <span>
          {node.healthy
            ? "Node is healthy and reachable"
            : "Node is unavailable"}
        </span>
      </div>

      {raft ? (
        <>
          <div className="raft-details-grid">
            <DetailItem
              label="Current Term"
              value={raft.currentTerm}
              highlight
            />

            <DetailItem label="Leader ID" value={raft.leaderId || "None"} />

            <DetailItem label="Voted For" value={raft.votedFor || "None"} />

            <DetailItem
              label="Election Count"
              value={raft.electionCount ?? 0}
            />

            <DetailItem
              label="Commit Index"
              value={raft.commitIndex ?? 0}
              highlight
            />

            <DetailItem label="Last Applied" value={raft.lastApplied ?? 0} />

            <DetailItem label="Log Length" value={logLength} />

            <DetailItem
              label="Routing"
              value={node.includedInRouting ? "Included" : "Excluded"}
            />
          </div>

          <div className="raft-node-footer">
            <div>
              <span className="footer-label">Last Heartbeat</span>

              <strong>{formatHeartbeat(raft.lastHeartbeatAt, role)}</strong>
            </div>

            <span
              className={`sync-badge ${
                synchronized ? "sync-success" : "sync-warning"
              }`}
            >
              {synchronized ? "State Applied" : "Applying Entries"}
            </span>
          </div>
        </>
      ) : (
        <div className="node-offline-message">
          Raft status is unavailable because this node is offline.
        </div>
      )}
    </article>
  );
}

export default RaftNodeCard;
