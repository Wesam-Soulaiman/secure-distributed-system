import React, { useState } from "react";

function DemoControls({
  loading,
  onPing,
  onMultiplePing,
  onSet,
  onGet,
  onDelete,
  onRefreshHealth,
}) {
  const [key, setKey] = useState("demo-key");
  const [value, setValue] = useState("distributed value");

  function validateKey() {
    return key.trim().length > 0;
  }

  async function handleSet() {
    if (!validateKey()) {
      return;
    }

    await onSet(key.trim(), value);
  }

  async function handleGet() {
    if (!validateKey()) {
      return;
    }

    await onGet(key.trim());
  }

  async function handleDelete() {
    if (!validateKey()) {
      return;
    }

    await onDelete(key.trim());
  }

  return (
    <section className="panel demo-controls-panel">
      <div className="panel-header">
        <div>
          <span className="panel-eyebrow">Interactive Demonstration</span>

          <h2>Demo Controls</h2>

          <p>
            Trigger routing, replication, health checks, and key-value
            operations directly from the dashboard.
          </p>
        </div>

        {loading && (
          <span className="status-pill status-warning">Running Operation</span>
        )}
      </div>

      <div className="demo-control-grid">
        <article className="demo-control-card">
          <h3>Load Balancing</h3>

          <p>
            Send requests through Nginx and observe Weighted Round Robin
            distribution.
          </p>

          <div className="demo-button-group">
            <button
              type="button"
              className="button primary"
              onClick={onPing}
              disabled={loading}
            >
              Send Ping
            </button>

            <button
              type="button"
              className="button secondary"
              onClick={onMultiplePing}
              disabled={loading}
            >
              Send 12 Requests
            </button>
          </div>
        </article>

        <article className="demo-control-card">
          <h3>Raft Key-Value Store</h3>

          <p>
            Writes go to the current leader and commit after replication to the
            majority.
          </p>

          <div className="form-field">
            <label htmlFor="demo-key">Key</label>

            <input
              id="demo-key"
              type="text"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder="Enter key"
            />
          </div>

          <div className="form-field">
            <label htmlFor="demo-value">Value</label>

            <input
              id="demo-value"
              type="text"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Enter value"
            />
          </div>

          <div className="demo-button-group">
            <button
              type="button"
              className="button primary"
              onClick={handleSet}
              disabled={loading || !validateKey()}
            >
              SET Value
            </button>

            <button
              type="button"
              className="button secondary"
              onClick={handleGet}
              disabled={loading || !validateKey()}
            >
              GET Value
            </button>

            <button
              type="button"
              className="button danger"
              onClick={handleDelete}
              disabled={loading || !validateKey()}
            >
              DELETE Value
            </button>
          </div>
        </article>

        <article className="demo-control-card">
          <h3>Fault Tolerance</h3>

          <p>
            Stop a follower or leader using Docker, then refresh the health
            state and observe election, retry, and circuit breaker behavior.
          </p>

          <div className="command-box">
            <span>Stop a node</span>
            <code>docker stop node-a</code>
          </div>

          <div className="command-box">
            <span>Start a node</span>
            <code>docker start node-a</code>
          </div>

          <button
            type="button"
            className="button secondary"
            onClick={onRefreshHealth}
            disabled={loading}
          >
            Refresh Health Checks
          </button>
        </article>
      </div>
    </section>
  );
}

export default DemoControls;
