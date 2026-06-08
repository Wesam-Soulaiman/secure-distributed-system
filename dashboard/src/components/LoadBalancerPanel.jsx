import React from "react";

function calculateRequestPercentage(requestCount, totalRequests) {
  if (!totalRequests) {
    return 0;
  }

  return Math.round((requestCount / totalRequests) * 100);
}

function LoadBalancerPanel({ lbStatus }) {
  const nodes = lbStatus?.nodes || [];

  const totalRequests = nodes.reduce(
    (total, node) => total + (node.requestCount || 0),
    0,
  );

  const weightedSequence = lbStatus?.weightedSequence || [];

  const lastRoutedRequest = lbStatus?.lastRoutedRequest || null;

  return (
    <section className="panel load-balancer-panel">
      <div className="panel-header">
        <div>
          <span className="panel-eyebrow">Traffic Distribution</span>

          <h2>Custom Load Balancer</h2>

          <p>
            Routes general requests using Weighted Round Robin and key-based
            reads using Consistent Hashing.
          </p>
        </div>

        <div className="load-balancer-header-badges">
          <span className="status-pill status-success">Running</span>

          <span className="status-pill status-neutral">
            {lbStatus?.algorithm || "Loading"}
          </span>
        </div>
      </div>

      <div className="load-balancer-summary">
        <div className="lb-summary-item">
          <span>Routing Algorithm</span>
          <strong>{lbStatus?.algorithm || "-"}</strong>
        </div>

        <div className="lb-summary-item">
          <span>Key-Based Routing</span>
          <strong>{lbStatus?.keyBasedRouting || "-"}</strong>
        </div>

        <div className="lb-summary-item">
          <span>Write Routing</span>
          <strong>{lbStatus?.writeRouting || "-"}</strong>
        </div>

        <div className="lb-summary-item">
          <span>Total Requests</span>
          <strong>{totalRequests}</strong>
        </div>
      </div>

      <div className="weighted-sequence-box">
        <div className="subsection-header">
          <div>
            <h3>Weighted Routing Sequence</h3>

            <p>Higher-weight nodes appear more frequently in the sequence.</p>
          </div>
        </div>

        <div className="weighted-sequence">
          {weightedSequence.length > 0 ? (
            weightedSequence.map((nodeId, index) => (
              <React.Fragment key={`${nodeId}-${index}`}>
                <span className="sequence-node">{nodeId}</span>

                {index < weightedSequence.length - 1 && (
                  <span className="sequence-arrow">→</span>
                )}
              </React.Fragment>
            ))
          ) : (
            <span className="empty-inline">No routable nodes available.</span>
          )}
        </div>
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Node</th>
              <th>Weight</th>
              <th>Health</th>
              <th>Routing</th>
              <th>Requests</th>
              <th>Distribution</th>
              <th>Circuit</th>
            </tr>
          </thead>

          <tbody>
            {nodes.map((node) => {
              const percentage = calculateRequestPercentage(
                node.requestCount || 0,
                totalRequests,
              );

              const circuitState = node.circuitBreaker?.state || "UNKNOWN";

              return (
                <tr key={node.id}>
                  <td>
                    <strong>{node.id}</strong>
                  </td>

                  <td>{node.weight}</td>

                  <td>
                    <span className={node.healthy ? "healthy" : "unhealthy"}>
                      {node.healthy ? "Healthy" : "Unhealthy"}
                    </span>
                  </td>

                  <td>
                    <span
                      className={`status-pill ${
                        node.includedInRouting
                          ? "status-success"
                          : "status-danger"
                      }`}
                    >
                      {node.includedInRouting ? "Included" : "Excluded"}
                    </span>
                  </td>

                  <td>{node.requestCount || 0}</td>

                  <td>
                    <div className="request-distribution">
                      <div className="request-distribution-track">
                        <div
                          className="request-distribution-fill"
                          style={{
                            width: `${percentage}%`,
                          }}
                        />
                      </div>

                      <strong>{percentage}%</strong>
                    </div>
                  </td>

                  <td>
                    <span
                      className={`status-pill ${
                        circuitState === "OPEN"
                          ? "status-danger"
                          : circuitState === "HALF_OPEN"
                            ? "status-warning"
                            : "status-success"
                      }`}
                    >
                      {circuitState}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="last-route-box">
        <div>
          <span className="last-route-label">Last Routed Request</span>

          {lastRoutedRequest ? (
            <>
              <strong>
                {lastRoutedRequest.method} {lastRoutedRequest.path}
              </strong>

              <span>
                Selected Node:{" "}
                <strong>{lastRoutedRequest.selectedNode || "-"}</strong>
              </span>

              <span>
                Strategy:{" "}
                <strong>{lastRoutedRequest.routingStrategy || "-"}</strong>
              </span>
            </>
          ) : (
            <span>No routed requests recorded yet.</span>
          )}
        </div>
      </div>
    </section>
  );
}

export default LoadBalancerPanel;
