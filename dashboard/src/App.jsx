import React, { useEffect, useState } from "react";
import axios from "axios";

const API_BASE_URL = "http://localhost:8080";

function App() {
  const [clusterStatus, setClusterStatus] = useState(null);
  const [lbStatus, setLbStatus] = useState(null);
  const [pingResult, setPingResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function fetchStatus() {
    setLoading(true);

    try {
      const [clusterResponse, lbResponse] = await Promise.all([
        axios.get(`${API_BASE_URL}/cluster/status`),
        axios.get(`${API_BASE_URL}/lb/status`),
      ]);

      setClusterStatus(clusterResponse.data);
      setLbStatus(lbResponse.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function sendPing() {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/ping`);
      setPingResult(response.data);
      await fetchStatus();
    } catch (error) {
      setPingResult({
        error: error.message,
      });
    }
  }

  useEffect(() => {
    fetchStatus();

    const interval = setInterval(fetchStatus, 4000);

    return () => clearInterval(interval);
  }, []);

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <h1>Secure Distributed System Dashboard</h1>
        <p>
          Nginx Gateway + Custom Load Balancer + Express Raft Nodes + React UI
        </p>
      </section>

      <section style={styles.grid}>
        <div style={styles.card}>
          <h2>Architecture</h2>
          <pre style={styles.diagram}>
            {`Browser / Client
      |
      v
Nginx Gateway
      |
      v
Custom Load Balancer
      |
      +--> node-a
      +--> node-b
      +--> node-c`}
          </pre>
        </div>

        <div style={styles.card}>
          <h2>Gateway</h2>
          <p>
            <strong>Status:</strong> Running through Nginx on port 8080
          </p>
          <p>
            <strong>Role:</strong> Reverse Proxy / Gateway
          </p>
        </div>

        <div style={styles.card}>
          <h2>Load Balancer</h2>
          <p>
            <strong>Algorithm:</strong> {lbStatus?.algorithm || "loading..."}
          </p>
          <p>
            <strong>Healthy Nodes:</strong>{" "}
            {lbStatus?.healthyNodes?.join(", ") || "loading..."}
          </p>
        </div>

        <div style={styles.card}>
          <h2>Raft Leader</h2>
          <p>
            <strong>Current Leader:</strong>{" "}
            {clusterStatus?.raft?.currentLeader || "unknown"}
          </p>
        </div>
      </section>

      <section style={styles.card}>
        <h2>Nodes</h2>

        {loading && <p>Refreshing cluster status...</p>}

        <div style={styles.nodeGrid}>
          {clusterStatus?.raft?.nodes?.map((node) => (
            <div key={node.id} style={styles.nodeCard}>
              <h3>{node.id}</h3>
              <p>
                <strong>Health:</strong>{" "}
                {node.healthy ? "Healthy" : "Unhealthy"}
              </p>
              <p>
                <strong>Role:</strong> {node.raft?.role || "offline"}
              </p>
              <p>
                <strong>Term:</strong> {node.raft?.currentTerm ?? "-"}
              </p>
              <p>
                <strong>Commit Index:</strong> {node.raft?.commitIndex ?? "-"}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section style={styles.card}>
        <h2>Demo Controls</h2>

        <button style={styles.button} onClick={sendPing}>
          Send Ping Request
        </button>

        <button style={styles.buttonSecondary} onClick={fetchStatus}>
          Refresh Status
        </button>

        {pingResult && (
          <>
            <h3>Last Ping Result</h3>
            <pre style={styles.output}>
              {JSON.stringify(pingResult, null, 2)}
            </pre>
          </>
        )}
      </section>
    </main>
  );
}

const styles = {
  page: {
    fontFamily: "Arial, sans-serif",
    padding: "24px",
    background: "#f5f7fb",
    minHeight: "100vh",
    color: "#172033",
  },
  header: {
    marginBottom: "24px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "16px",
    marginBottom: "16px",
  },
  card: {
    background: "white",
    borderRadius: "12px",
    padding: "18px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
    marginBottom: "16px",
  },
  nodeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "16px",
  },
  nodeCard: {
    border: "1px solid #d9e0ef",
    borderRadius: "10px",
    padding: "14px",
    background: "#fbfcff",
  },
  diagram: {
    background: "#101827",
    color: "#d8e2ff",
    padding: "12px",
    borderRadius: "8px",
    overflowX: "auto",
  },
  output: {
    background: "#101827",
    color: "#d8e2ff",
    padding: "12px",
    borderRadius: "8px",
    overflowX: "auto",
  },
  button: {
    padding: "10px 14px",
    borderRadius: "8px",
    border: "none",
    background: "#2563eb",
    color: "white",
    cursor: "pointer",
    marginRight: "8px",
  },
  buttonSecondary: {
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid #b8c2d8",
    background: "white",
    color: "#172033",
    cursor: "pointer",
  },
};

export default App;
