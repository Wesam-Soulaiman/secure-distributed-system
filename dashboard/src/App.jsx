import React, { useCallback, useEffect, useMemo, useState } from "react";

import axios from "axios";

import Header from "./components/Header";
import SummaryCards from "./components/SummaryCards";
import ArchitecturePanel from "./components/ArchitecturePanel";
import RaftClusterPanel from "./components/RaftClusterPanel";
import CircuitBreakerPanel from "./components/CircuitBreakerPanel";
import RetryTimeline from "./components/RetryTimeline";
import LoadBalancerPanel from "./components/LoadBalancerPanel";
import SecurityPanel from "./components/SecurityPanel";
import DemoControls from "./components/DemoControls";
import JsonViewer from "./components/JsonViewer";

import "./App.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (window.location.port === "3000" ? "http://localhost:8080" : "");

const AUTO_REFRESH_INTERVAL_MS = 4000;

const STATUS_ENDPOINTS = [
  {
    name: "cluster",
    path: "/cluster/status",
  },
  {
    name: "loadBalancer",
    path: "/lb/status",
  },
  {
    name: "waf",
    path: "/gateway/waf/status",
  },
  {
    name: "rateLimit",
    path: "/gateway/rate-limit/status",
  },
  {
    name: "raftLogs",
    path: "/raft/logs",
  },
];

function getRequestError(error) {
  return {
    message: error.message,
    status: error.response?.status || null,
    data: error.response?.data || null,
  };
}

function App() {
  const [clusterStatus, setClusterStatus] = useState(null);

  const [lbStatus, setLbStatus] = useState(null);

  const [wafStatus, setWafStatus] = useState(null);

  const [rateLimitStatus, setRateLimitStatus] = useState(null);

  const [raftLogs, setRaftLogs] = useState(null);

  const [lastResult, setLastResult] = useState(null);

  const [wafTestResult, setWafTestResult] = useState(null);

  const [rateLimitTestResult, setRateLimitTestResult] = useState(null);

  const [loading, setLoading] = useState(false);

  const [actionLoading, setActionLoading] = useState(false);

  const [autoRefresh, setAutoRefresh] = useState(true);

  const [lastRefreshAt, setLastRefreshAt] = useState(null);

  const [statusError, setStatusError] = useState(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setStatusError(null);

    const requests = STATUS_ENDPOINTS.map((endpoint) =>
      axios.get(`${API_BASE_URL}${endpoint.path}`),
    );

    const results = await Promise.allSettled(requests);

    const failedServices = [];

    results.forEach((result, index) => {
      const endpoint = STATUS_ENDPOINTS[index];

      if (result.status === "rejected") {
        console.error(`Failed to fetch ${endpoint.name}:`, result.reason);

        failedServices.push({
          service: endpoint.name,
          ...getRequestError(result.reason),
        });

        return;
      }

      const data = result.value.data;

      if (endpoint.name === "cluster") {
        setClusterStatus(data);
      }

      if (endpoint.name === "loadBalancer") {
        setLbStatus(data);
      }

      if (endpoint.name === "waf") {
        setWafStatus(data);
      }

      if (endpoint.name === "rateLimit") {
        setRateLimitStatus(data);
      }

      if (endpoint.name === "raftLogs") {
        setRaftLogs(data);
      }
    });

    if (failedServices.length > 0) {
      setStatusError({
        message: `${failedServices.length} dashboard service(s) could not be refreshed.`,
        services: failedServices,
      });
    }

    if (results.some((result) => result.status === "fulfilled")) {
      setLastRefreshAt(new Date());
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!autoRefresh) {
      return undefined;
    }

    const interval = setInterval(fetchStatus, AUTO_REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [autoRefresh, fetchStatus]);

  const raftNodes = useMemo(
    () => clusterStatus?.raft?.nodes || [],
    [clusterStatus],
  );

  const currentLeader = useMemo(
    () => raftNodes.find((node) => node.raft?.role === "leader") || null,
    [raftNodes],
  );

  const healthyNodeCount = useMemo(
    () => raftNodes.filter((node) => node.healthy).length,
    [raftNodes],
  );

  const openCircuitCount = useMemo(
    () =>
      (lbStatus?.nodes || []).filter(
        (node) => node.circuitBreaker?.state === "OPEN",
      ).length,
    [lbStatus],
  );

  const retryData = useMemo(
    () =>
      lastResult?.retry ||
      lastResult?.result?.retry ||
      lastResult?.data?.retry ||
      null,
    [lastResult],
  );

  async function runAction(action) {
    setActionLoading(true);

    try {
      const result = await action();

      setLastResult(result);

      await fetchStatus();

      return result;
    } catch (error) {
      const result = {
        operation: "FAILED_ACTION",
        error: error.message,
        status: error.response?.status || null,
        data: error.response?.data || null,
      };

      setLastResult(result);

      await fetchStatus();

      return result;
    } finally {
      setActionLoading(false);
    }
  }

  async function sendPing() {
    return runAction(async () => {
      const response = await axios.get(`${API_BASE_URL}/api/ping`);

      return {
        operation: "PING",
        status: response.status,
        result: response.data,
      };
    });
  }

  async function sendMultiplePingRequests() {
    return runAction(async () => {
      const totalRequests = 12;
      const results = [];

      for (
        let requestNumber = 1;
        requestNumber <= totalRequests;
        requestNumber += 1
      ) {
        try {
          const response = await axios.get(`${API_BASE_URL}/api/ping`);

          results.push({
            request: requestNumber,
            status: response.status,
            selectedNode: response.data.selectedNode,
          });
        } catch (error) {
          results.push({
            request: requestNumber,
            status: error.response?.status || 0,
            selectedNode: null,
            error: error.response?.data || error.message,
          });
        }
      }

      const distribution = results.reduce((accumulator, result) => {
        const nodeId = result.selectedNode || "blocked";

        accumulator[nodeId] = (accumulator[nodeId] || 0) + 1;

        return accumulator;
      }, {});

      return {
        operation: "WEIGHTED_ROUND_ROBIN_TEST",
        totalRequests,
        distribution,
        results,
      };
    });
  }

  async function setKeyValue(key, value) {
    return runAction(async () => {
      const response = await axios.post(`${API_BASE_URL}/api/set`, {
        key,
        value,
      });

      return {
        operation: "SET",
        key,
        value,
        status: response.status,
        retry: response.data.retry || null,
        result: response.data,
      };
    });
  }

  async function getKeyValue(key) {
    return runAction(async () => {
      const response = await axios.get(
        `${API_BASE_URL}/api/get/${encodeURIComponent(key)}`,
      );

      return {
        operation: "GET",
        key,
        status: response.status,
        result: response.data,
      };
    });
  }

  async function deleteKey(key) {
    return runAction(async () => {
      const response = await axios.delete(
        `${API_BASE_URL}/api/delete/${encodeURIComponent(key)}`,
      );

      return {
        operation: "DELETE",
        key,
        status: response.status,
        retry: response.data.retry || null,
        result: response.data,
      };
    });
  }

  async function resetLoadBalancerStats() {
    return runAction(async () => {
      const response = await axios.post(`${API_BASE_URL}/lb/reset-stats`);

      return {
        operation: "RESET_LOAD_BALANCER_STATS",
        status: response.status,
        result: response.data,
      };
    });
  }

  async function refreshHealthChecks() {
    return runAction(async () => {
      const response = await axios.post(`${API_BASE_URL}/lb/refresh-health`);

      return {
        operation: "REFRESH_HEALTH_CHECKS",
        status: response.status,
        result: response.data,
      };
    });
  }

  async function testWafAttack() {
    setActionLoading(true);

    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/get/user?id=1%27%20OR%20%271%27=%271`,
      );

      const result = {
        operation: "WAF_SQL_INJECTION_TEST",
        blocked: false,
        status: response.status,
        message: "The request passed through the WAF unexpectedly.",
      };

      setWafTestResult(result);
      setLastResult(result);
    } catch (error) {
      const status = error.response?.status || null;

      const blocked = status === 403 || status === 406;

      const result = {
        operation: "WAF_SQL_INJECTION_TEST",
        blocked,
        status,
        message: error.response?.data || error.message,
      };

      setWafTestResult(result);
      setLastResult(result);
    } finally {
      setActionLoading(false);
      await fetchStatus();
    }
  }

  async function testRateLimit() {
    setActionLoading(true);

    try {
      const totalRequests = 40;

      const requests = Array.from(
        {
          length: totalRequests,
        },
        async (_, index) => {
          try {
            const response = await axios.get(`${API_BASE_URL}/api/ping`);

            return {
              request: index + 1,
              status: response.status,
              blocked: false,
            };
          } catch (error) {
            const status = error.response?.status || 0;

            return {
              request: index + 1,
              status,
              blocked: status === 429 || status === 503,
              error: error.response?.data || error.message,
            };
          }
        },
      );

      const results = await Promise.all(requests);

      const successCount = results.filter(
        (result) => result.status >= 200 && result.status < 300,
      ).length;

      const blockedCount = results.filter((result) => result.blocked).length;

      const failedCount = totalRequests - successCount - blockedCount;

      const result = {
        operation: "RATE_LIMIT_TEST",
        totalRequests,
        successCount,
        blockedCount,
        failedCount,
        results,
      };

      setRateLimitTestResult(result);
      setLastResult(result);
    } catch (error) {
      const result = {
        operation: "RATE_LIMIT_TEST",
        error: error.message,
        status: error.response?.status || null,
        data: error.response?.data || null,
      };

      setRateLimitTestResult(result);
      setLastResult(result);
    } finally {
      setActionLoading(false);
      await fetchStatus();
    }
  }

  return (
    <main className="dashboard-page">
      <Header
        loading={loading}
        autoRefresh={autoRefresh}
        lastRefreshAt={lastRefreshAt}
        clusterStatus={clusterStatus}
        onRefresh={fetchStatus}
        onToggleAutoRefresh={() => setAutoRefresh((current) => !current)}
        onResetStats={resetLoadBalancerStats}
      />

      {statusError && (
        <section className="alert alert-danger">
          <strong>Partial dashboard refresh</strong>

          <span>{statusError.message}</span>

          {statusError.services?.map((service) => (
            <span key={service.service}>
              {service.service}: {service.message}
            </span>
          ))}
        </section>
      )}

      <SummaryCards
        totalNodes={raftNodes.length}
        healthyNodeCount={healthyNodeCount}
        currentLeader={currentLeader}
        openCircuitCount={openCircuitCount}
        lbStatus={lbStatus}
        retryData={retryData}
      />

      <ArchitecturePanel
        clusterStatus={clusterStatus}
        wafStatus={wafStatus}
        rateLimitStatus={rateLimitStatus}
      />

      <RaftClusterPanel
        nodes={raftNodes}
        currentLeaderId={clusterStatus?.raft?.currentLeader}
        raftLogs={raftLogs}
      />

      <section className="dashboard-two-column">
        <CircuitBreakerPanel
          nodes={lbStatus?.nodes || []}
          configuration={lbStatus?.circuitBreaker || null}
          onRefreshHealth={refreshHealthChecks}
        />

        <RetryTimeline retry={retryData} lastResult={lastResult} />
      </section>

      <LoadBalancerPanel lbStatus={lbStatus} />

      <SecurityPanel
        wafStatus={wafStatus}
        rateLimitStatus={rateLimitStatus}
        wafTestResult={wafTestResult}
        rateLimitTestResult={rateLimitTestResult}
        onTestWaf={testWafAttack}
        onTestRateLimit={testRateLimit}
        loading={actionLoading}
      />

      <DemoControls
        loading={actionLoading}
        onPing={sendPing}
        onMultiplePing={sendMultiplePingRequests}
        onSet={setKeyValue}
        onGet={getKeyValue}
        onDelete={deleteKey}
        onRefreshHealth={refreshHealthChecks}
      />

      <JsonViewer
        title="Last Operation Result"
        data={lastResult}
        defaultOpen={false}
      />
    </main>
  );
}

export default App;
