import React, { useMemo } from "react";

import RaftNodeCard from "./RaftNodeCard";
import ReplicationTable from "./ReplicationTable";
import JsonViewer from "./JsonViewer";

function calculateClusterState(nodes, leaderId) {
  const healthyCount = nodes.filter((node) => node.healthy).length;

  const majority = nodes.length > 0 ? Math.floor(nodes.length / 2) + 1 : 0;

  if (healthyCount < majority) {
    return {
      label: "Unavailable",
      className: "status-danger",
      description: "The cluster does not have a majority.",
    };
  }

  if (!leaderId) {
    return {
      label: "Election",
      className: "status-warning",
      description:
        "The cluster has a majority but no leader is currently visible.",
    };
  }

  if (healthyCount < nodes.length) {
    return {
      label: "Degraded",
      className: "status-warning",
      description:
        "The cluster is available, but at least one node is offline.",
    };
  }

  return {
    label: "Healthy",
    className: "status-success",
    description: "The cluster has a leader and all nodes are reachable.",
  };
}

function RaftClusterPanel({ nodes, currentLeaderId, raftLogs }) {
  const leaderNode = useMemo(
    () =>
      nodes.find(
        (node) => node.id === currentLeaderId || node.raft?.role === "leader",
      ) || null,
    [nodes, currentLeaderId],
  );

  const clusterState = calculateClusterState(nodes, currentLeaderId);

  const healthyCount = nodes.filter((node) => node.healthy).length;

  const majority = nodes.length > 0 ? Math.floor(nodes.length / 2) + 1 : 0;

  const highestCommitIndex = Math.max(
    0,
    ...nodes.map((node) => node.raft?.commitIndex ?? 0),
  );

  return (
    <section className="panel raft-cluster-panel">
      <div className="panel-header raft-panel-header">
        <div>
          <span className="panel-eyebrow">Consensus Layer</span>

          <h2>Raft Cluster</h2>

          <p>
            Automatic leader election, log replication, majority commit, and
            follower catch-up.
          </p>
        </div>

        <div className="raft-cluster-meta">
          <span className={`status-pill ${clusterState.className}`}>
            {clusterState.label}
          </span>

          <span>
            Leader: <strong>{currentLeaderId || "None"}</strong>
          </span>

          <span>
            Majority: <strong>{majority}</strong>
          </span>
        </div>
      </div>

      <div className="cluster-state-banner">
        <div>
          <strong>{clusterState.label}</strong>

          <span>{clusterState.description}</span>
        </div>

        <div className="cluster-banner-stats">
          <span>
            Healthy{" "}
            <strong>
              {healthyCount}/{nodes.length}
            </strong>
          </span>

          <span>
            Commit Index <strong>{highestCommitIndex}</strong>
          </span>
        </div>
      </div>

      <div className="raft-node-grid">
        {nodes.length > 0 ? (
          nodes.map((node) => (
            <RaftNodeCard
              key={node.id}
              node={node}
              isCurrentLeader={node.id === currentLeaderId}
            />
          ))
        ) : (
          <div className="empty-state">Waiting for Raft node status...</div>
        )}
      </div>

      <ReplicationTable leaderNode={leaderNode} nodes={nodes} />

      <JsonViewer
        title="Raft Logs Raw Data"
        data={raftLogs}
        defaultOpen={false}
      />
    </section>
  );
}

export default RaftClusterPanel;
