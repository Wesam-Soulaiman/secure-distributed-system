import React from "react";

function getFollowerSyncState({ matchIndex, leaderCommitIndex, healthy }) {
  if (!healthy) {
    return {
      label: "Offline",
      className: "status-danger",
    };
  }

  if (matchIndex >= leaderCommitIndex) {
    return {
      label: "Synchronized",
      className: "status-success",
    };
  }

  return {
    label: "Catching Up",
    className: "status-warning",
  };
}

function ReplicationTable({ leaderNode, nodes }) {
  if (!leaderNode?.raft) {
    return (
      <div className="empty-state">
        No active leader is available to display replication progress.
      </div>
    );
  }

  const leaderRaft = leaderNode.raft;

  const followerNodes = nodes.filter((node) => node.id !== leaderNode.id);

  return (
    <div className="replication-section">
      <div className="subsection-header">
        <div>
          <h3>Follower Replication Progress</h3>

          <p>The leader tracks each follower using nextIndex and matchIndex.</p>
        </div>

        <div className="leader-commit-chip">
          Leader Commit Index: <strong>{leaderRaft.commitIndex ?? 0}</strong>
        </div>
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Follower</th>
              <th>Health</th>
              <th>Match Index</th>
              <th>Next Index</th>
              <th>Lag</th>
              <th>Sync State</th>
            </tr>
          </thead>

          <tbody>
            {followerNodes.map((node) => {
              const matchIndex = leaderRaft.matchIndex?.[node.id] ?? 0;

              const nextIndex = leaderRaft.nextIndex?.[node.id] ?? 1;

              const leaderCommitIndex = leaderRaft.commitIndex ?? 0;

              const lag = Math.max(0, leaderCommitIndex - matchIndex);

              const syncState = getFollowerSyncState({
                matchIndex,
                leaderCommitIndex,
                healthy: node.healthy,
              });

              return (
                <tr key={node.id}>
                  <td>
                    <strong>{node.id}</strong>
                  </td>

                  <td>
                    <span className={node.healthy ? "healthy" : "unhealthy"}>
                      {node.healthy ? "Healthy" : "Offline"}
                    </span>
                  </td>

                  <td>{matchIndex}</td>

                  <td>{nextIndex}</td>

                  <td>{lag === 0 ? "0" : `${lag} entries`}</td>

                  <td>
                    <span className={`status-pill ${syncState.className}`}>
                      {syncState.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="replication-explanation">
        <div>
          <strong>matchIndex</strong>

          <span>Highest log entry confirmed on that follower.</span>
        </div>

        <div>
          <strong>nextIndex</strong>

          <span>Next log entry the leader will send to that follower.</span>
        </div>

        <div>
          <strong>Lag</strong>

          <span>Number of committed entries the follower still needs.</span>
        </div>
      </div>
    </div>
  );
}

export default ReplicationTable;
