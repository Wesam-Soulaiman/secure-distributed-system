import React, { useEffect, useState } from "react";
import axios from "axios";
import "./App.css";

const API_BASE_URL = "http://localhost:8080";

function App() {
  const [clusterStatus, setClusterStatus] = useState(null);
  const [lbStatus, setLbStatus] = useState(null);
  const [pingResult, setPingResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const [wafStatus, setWafStatus] = useState(null);
  const [wafTestResult, setWafTestResult] = useState(null);

  const [rateLimitStatus, setRateLimitStatus] = useState(null);
  const [rateLimitTestResult, setRateLimitTestResult] = useState(null);

  const [hashKey, setHashKey] = useState("course");
  const [hashResult, setHashResult] = useState(null);

  const [kvKey, setKvKey] = useState("course");
  const [kvValue, setKvValue] = useState("Distributed Systems");
  const [kvResult, setKvResult] = useState(null);

  const [raftLogs, setRaftLogs] = useState(null);
  const [raftLogsLoading, setRaftLogsLoading] = useState(false);

  const [electionResult, setElectionResult] = useState(null);

  async function fetchStatus() {
    setLoading(true);

    try {
      const [clusterResponse, lbResponse, wafResponse, rateLimitResponse] =
        await Promise.all([
          axios.get(`${API_BASE_URL}/cluster/status`),
          axios.get(`${API_BASE_URL}/lb/status`),
          axios.get(`${API_BASE_URL}/gateway/waf/status`),
          axios.get(`${API_BASE_URL}/gateway/rate-limit/status`),
        ]);

      setClusterStatus(clusterResponse.data);
      setLbStatus(lbResponse.data);
      setWafStatus(wafResponse.data);
      setRateLimitStatus(rateLimitResponse.data);
    } catch (error) {
      console.error("Failed to fetch system status:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchRaftLogs() {
    setRaftLogsLoading(true);

    try {
      const response = await axios.get(`${API_BASE_URL}/raft/logs`);
      setRaftLogs(response.data);
    } catch (error) {
      setRaftLogs({
        error: error.message,
        status: error.response?.status,
        message: error.response?.data,
      });
    } finally {
      setRaftLogsLoading(false);
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
        status: error.response?.status,
        message: error.response?.data,
      });
    }
  }

  async function sendMultiplePingRequests() {
    const totalRequests = 12;

    const requests = Array.from({ length: totalRequests }, async (_, index) => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/ping`);

        return {
          request: index + 1,
          status: response.status,
          selectedNode: response.data.selectedNode,
        };
      } catch (error) {
        return {
          request: index + 1,
          status: error.response?.status || 0,
          selectedNode: null,
          error: error.message,
        };
      }
    });

    const results = await Promise.all(requests);

    setPingResult({
      test: "weighted-round-robin",
      totalRequests,
      expectedDistributionWhenAllNodesHealthy: {
        "node-a": 6,
        "node-b": 4,
        "node-c": 2,
      },
      expectedDistributionIfNodeBIsDown: {
        "node-a": 9,
        "node-c": 3,
      },
      results,
    });

    await fetchStatus();
  }

  async function resetLoadBalancerStats() {
    try {
      await axios.post(`${API_BASE_URL}/lb/reset-stats`);
      setPingResult(null);
      await fetchStatus();
    } catch (error) {
      setPingResult({
        error: error.message,
        status: error.response?.status,
        message: error.response?.data,
      });
    }
  }

  async function refreshHealthChecks() {
    try {
      await axios.post(`${API_BASE_URL}/lb/refresh-health`);
      await fetchStatus();
    } catch (error) {
      setPingResult({
        error: error.message,
        status: error.response?.status,
        message: error.response?.data,
      });
    }
  }

  async function electLeader() {
    try {
      const response = await axios.post(`${API_BASE_URL}/raft/elect-leader`);

      setElectionResult(response.data);

      await fetchStatus();
      await fetchRaftLogs();
    } catch (error) {
      setElectionResult({
        error: error.message,
        status: error.response?.status,
        message: error.response?.data,
      });
    }
  }

  async function testConsistentHashing() {
    try {
      const response = await axios.get(`${API_BASE_URL}/lb/hash/${hashKey}`);

      setHashResult(response.data);
      await fetchStatus();
    } catch (error) {
      setHashResult({
        error: error.message,
        status: error.response?.status,
        message: error.response?.data,
      });
    }
  }

  async function setKeyValue() {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/set`, {
        key: kvKey,
        value: kvValue,
      });

      setKvResult({
        operation: "SET",
        result: response.data,
      });

      await fetchStatus();
      await fetchRaftLogs();
    } catch (error) {
      setKvResult({
        operation: "SET",
        error: error.message,
        status: error.response?.status,
        message: error.response?.data,
      });
    }
  }

  async function getKeyValue() {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/get/${kvKey}`);

      setKvResult({
        operation: "GET",
        result: response.data,
      });

      await fetchStatus();
    } catch (error) {
      setKvResult({
        operation: "GET",
        error: error.message,
        status: error.response?.status,
        message: error.response?.data,
      });
    }
  }

  async function deleteKeyValue() {
    try {
      const response = await axios.delete(
        `${API_BASE_URL}/api/delete/${kvKey}`,
      );

      setKvResult({
        operation: "DELETE",
        result: response.data,
      });

      await fetchStatus();
      await fetchRaftLogs();
    } catch (error) {
      setKvResult({
        operation: "DELETE",
        error: error.message,
        status: error.response?.status,
        message: error.response?.data,
      });
    }
  }

  async function testWafAttack() {
    try {
      await axios.get(
        `${API_BASE_URL}/api/get/user?id=1%27%20OR%20%271%27=%271`,
      );

      setWafTestResult({
        blocked: false,
        message: "Attack passed unexpectedly",
      });
    } catch (error) {
      setWafTestResult({
        blocked: true,
        status: error.response?.status,
        message: error.response?.data || error.message,
      });
    }
  }

  async function testRateLimit() {
    const totalRequests = 40;
    let successCount = 0;
    let blockedCount = 0;
    let failedCount = 0;
    const statusCodes = [];

    const requests = Array.from({ length: totalRequests }, async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/ping`);
        statusCodes.push(response.status);
        successCount += 1;
      } catch (error) {
        const status = error.response?.status || 0;
        statusCodes.push(status);

        if (status === 429 || status === 503) {
          blockedCount += 1;
        } else {
          failedCount += 1;
        }
      }
    });

    await Promise.all(requests);

    setRateLimitTestResult({
      totalRequests,
      successCount,
      blockedCount,
      failedCount,
      statusCodes,
      note:
        blockedCount > 0
          ? "Rate limiting is working. Some requests were blocked by Nginx."
          : "No requests were blocked. Try clicking again quickly or reduce the rate limit.",
    });

    await fetchStatus();
  }

  useEffect(() => {
    fetchStatus();
    fetchRaftLogs();

    const interval = setInterval(() => {
      fetchStatus();
      fetchRaftLogs();
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  return (
    <main className="page">
      <section className="header">
        <h1>Secure Distributed System Dashboard</h1>
        <p>
          Nginx Gateway + WAF + Rate Limiting + Custom Load Balancer + Express
          Raft Nodes + React UI
        </p>
      </section>

      <section className="grid">
        <div className="card">
          <h2>Architecture</h2>
          <pre className="diagram">
            {`Browser / Client
      |
      v
Nginx Gateway
      |
      +--> WAF Rules
      +--> Rate Limiting
      |
      v
Custom Load Balancer
      |
      +--> node-a
      +--> node-b
      +--> node-c`}
          </pre>
        </div>

        <div className="card">
          <h2>Gateway</h2>
          <p>
            <strong>Status:</strong> Running through Nginx on port 8080
          </p>
          <p>
            <strong>Role:</strong> Reverse Proxy / Gateway
          </p>
        </div>

        <div className="card">
          <h2>WAF Gateway</h2>
          <p>
            <strong>Status:</strong> {wafStatus?.waf || "loading..."}
          </p>
          <p>
            <strong>Rules:</strong>{" "}
            {wafStatus?.rules?.join(", ") || "loading..."}
          </p>

          <button className="button primary" onClick={testWafAttack}>
            Test SQL Injection Attack
          </button>

          {wafTestResult && (
            <>
              <h3>WAF Test Result</h3>
              <pre className="output">
                {JSON.stringify(wafTestResult, null, 2)}
              </pre>
            </>
          )}
        </div>

        <div className="card">
          <h2>Rate Limiting</h2>
          <p>
            <strong>Status:</strong>{" "}
            {rateLimitStatus?.rateLimit || "loading..."}
          </p>
          <p>
            <strong>Limit:</strong> {rateLimitStatus?.limit || "loading..."}
          </p>
          <p>
            <strong>Burst:</strong> {rateLimitStatus?.burst ?? "loading..."}
          </p>
          <p>
            <strong>Scope:</strong> {rateLimitStatus?.scope || "loading..."}
          </p>

          <button className="button primary" onClick={testRateLimit}>
            Run Rate Limit Test
          </button>

          {rateLimitTestResult && (
            <>
              <h3>Rate Limit Test Result</h3>
              <pre className="output">
                {JSON.stringify(rateLimitTestResult, null, 2)}
              </pre>
            </>
          )}
        </div>

        <div className="card">
          <h2>Load Balancer</h2>

          <p>
            <strong>Algorithm:</strong> {lbStatus?.algorithm || "loading..."}
          </p>

          <p>
            <strong>Key-based Routing:</strong>{" "}
            {lbStatus?.keyBasedRouting || "loading..."}
          </p>

          <p>
            <strong>Write Routing:</strong>{" "}
            {lbStatus?.writeRouting || "loading..."}
          </p>

          <p>
            <strong>Healthy Nodes:</strong>{" "}
            {lbStatus?.healthyNodes?.join(", ") || "loading..."}
          </p>

          <p>
            <strong>Unhealthy Nodes:</strong>{" "}
            {lbStatus?.unhealthyNodes?.length
              ? lbStatus.unhealthyNodes.join(", ")
              : "none"}
          </p>

          <p>
            <strong>Weighted Sequence:</strong>{" "}
            {lbStatus?.weightedSequence?.join(" → ") || "loading..."}
          </p>

          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Node</th>
                  <th>Weight</th>
                  <th>Health</th>
                  <th>Included</th>
                  <th>Requests</th>
                  <th>Last Check</th>
                </tr>
              </thead>

              <tbody>
                {lbStatus?.nodes?.map((node) => (
                  <tr key={node.id}>
                    <td>{node.id}</td>
                    <td>{node.weight}</td>
                    <td>
                      <span className={node.healthy ? "healthy" : "unhealthy"}>
                        {node.healthy ? "Healthy" : "Unhealthy"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={
                          node.includedInRouting ? "healthy" : "unhealthy"
                        }
                      >
                        {node.includedInRouting ? "Yes" : "No"}
                      </span>
                    </td>
                    <td>{node.requestCount}</td>
                    <td>
                      {node.lastHealthCheck
                        ? new Date(node.lastHealthCheck).toLocaleTimeString()
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {lbStatus?.lastRoutedRequest && (
            <div className="mini-box">
              <strong>Last Routed Request:</strong>
              <pre className="mini-output">
                {JSON.stringify(lbStatus.lastRoutedRequest, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div className="card">
          <h2>Consistent Hashing</h2>

          <p>
            <strong>Strategy:</strong>{" "}
            {lbStatus?.keyBasedRouting || "loading..."}
          </p>

          <p>
            <strong>Virtual Nodes per Weight:</strong>{" "}
            {lbStatus?.virtualNodesPerWeight ?? "loading..."}
          </p>

          <p>
            <strong>Hash Ring Size:</strong>{" "}
            {lbStatus?.hashRingSize ?? "loading..."}
          </p>

          <div className="input-row">
            <input
              className="text-input"
              value={hashKey}
              onChange={(event) => setHashKey(event.target.value)}
              placeholder="Enter key, e.g. course"
            />

            <button className="button primary" onClick={testConsistentHashing}>
              Find Responsible Node
            </button>
          </div>

          {hashResult && (
            <>
              <h3>Hash Result</h3>
              <pre className="output">
                {JSON.stringify(hashResult, null, 2)}
              </pre>
            </>
          )}
        </div>

        <div className="card">
          <h2>Key-Value Store</h2>

          <p>
            <strong>SET / DELETE routing:</strong> Raft Leader
          </p>

          <p>
            <strong>GET routing:</strong> Consistent Hashing by key
          </p>

          <div className="input-row">
            <input
              className="text-input"
              value={kvKey}
              onChange={(event) => setKvKey(event.target.value)}
              placeholder="Key, e.g. course"
            />

            <input
              className="text-input"
              value={kvValue}
              onChange={(event) => setKvValue(event.target.value)}
              placeholder="Value, e.g. Distributed Systems"
            />
          </div>

          <div className="input-row">
            <button className="button primary" onClick={setKeyValue}>
              SET
            </button>

            <button className="button primary" onClick={getKeyValue}>
              GET
            </button>

            <button className="button secondary" onClick={deleteKeyValue}>
              DELETE
            </button>
          </div>

          {kvResult && (
            <>
              <h3>Key-Value Result</h3>
              <pre className="output">{JSON.stringify(kvResult, null, 2)}</pre>
            </>
          )}
        </div>

        <div className="card">
          <h2>Raft Leader</h2>

          <p>
            <strong>Current Leader:</strong>{" "}
            {clusterStatus?.raft?.currentLeader || "unknown"}
          </p>

          <button className="button primary" onClick={electLeader}>
            Elect Leader
          </button>

          {electionResult && (
            <>
              <h3>Election Result</h3>
              <pre className="output">
                {JSON.stringify(electionResult, null, 2)}
              </pre>
            </>
          )}
        </div>
      </section>

      <section className="card">
        <div className="section-title">
          <h2>Nodes</h2>
          {loading && <span className="badge">Refreshing...</span>}
        </div>

        <div className="node-grid">
          {clusterStatus?.raft?.nodes?.map((node) => (
            <div key={node.id} className="node-card">
              <h3>{node.id}</h3>

              <p>
                <strong>Health:</strong>{" "}
                <span className={node.healthy ? "healthy" : "unhealthy"}>
                  {node.healthy ? "Healthy" : "Unhealthy"}
                </span>
              </p>

              <p>
                <strong>Included in Routing:</strong>{" "}
                <span
                  className={node.includedInRouting ? "healthy" : "unhealthy"}
                >
                  {node.includedInRouting ? "Yes" : "No"}
                </span>
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

      <section className="card">
        <div className="section-title">
          <h2>Raft Logs & Replication</h2>
          {raftLogsLoading && <span className="badge">Loading logs...</span>}
        </div>

        <p>
          <strong>Leader:</strong> {raftLogs?.cluster?.leader || "unknown"}
        </p>

        <p>
          <strong>Majority:</strong>{" "}
          {raftLogs?.cluster
            ? `${raftLogs.cluster.majority} / ${raftLogs.cluster.totalNodes}`
            : "loading..."}
        </p>

        <button className="button secondary" onClick={fetchRaftLogs}>
          Refresh Raft Logs
        </button>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Node</th>
                <th>Health</th>
                <th>Role</th>
                <th>Commit Index</th>
                <th>Log Length</th>
                <th>Store Keys</th>
              </tr>
            </thead>

            <tbody>
              {raftLogs?.logs?.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>
                    <span className={item.healthy ? "healthy" : "unhealthy"}>
                      {item.healthy ? "Healthy" : "Unhealthy"}
                    </span>
                  </td>
                  <td>{item.data?.role || "-"}</td>
                  <td>{item.data?.commitIndex ?? "-"}</td>
                  <td>{item.data?.log?.length ?? "-"}</td>
                  <td>
                    {item.data?.store
                      ? Object.keys(item.data.store).join(", ") || "empty"
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="raft-log-grid">
          {raftLogs?.logs?.map((item) => (
            <div key={item.id} className="mini-box">
              <strong>{item.id} log</strong>

              {item.data?.log?.length ? (
                <pre className="mini-output">
                  {JSON.stringify(item.data.log.slice(-5), null, 2)}
                </pre>
              ) : (
                <p>{item.error || "No log entries"}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Demo Controls</h2>

        <button className="button primary" onClick={sendPing}>
          Send Ping Request
        </button>

        <button className="button primary" onClick={sendMultiplePingRequests}>
          Send 12 Requests
        </button>

        <button className="button secondary" onClick={resetLoadBalancerStats}>
          Reset LB Stats
        </button>

        <button className="button secondary" onClick={refreshHealthChecks}>
          Refresh Health Checks
        </button>

        <button className="button secondary" onClick={fetchStatus}>
          Refresh Status
        </button>

        {pingResult && (
          <>
            <h3>Last Ping Result</h3>
            <pre className="output">{JSON.stringify(pingResult, null, 2)}</pre>
          </>
        )}
      </section>
    </main>
  );
}

export default App;
