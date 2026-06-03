const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const axios = require("axios");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 7000;

const HEALTH_CHECK_TIMEOUT_MS = 2500;
const HEALTH_CHECK_INTERVAL_MS = 3000;
const FAILURE_THRESHOLD = 3;
const VIRTUAL_NODES_PER_WEIGHT = 20;

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

const nodes = [
  {
    id: "node-a",
    url: "http://node-a:8000",
    weight: 3,
    healthy: true,
    requestCount: 0,
    lastHealthCheck: null,
    lastHealthError: null,
    failureCount: 0,
    successCount: 0,
  },
  {
    id: "node-b",
    url: "http://node-b:8000",
    weight: 2,
    healthy: true,
    requestCount: 0,
    lastHealthCheck: null,
    lastHealthError: null,
    failureCount: 0,
    successCount: 0,
  },
  {
    id: "node-c",
    url: "http://node-c:8000",
    weight: 1,
    healthy: true,
    requestCount: 0,
    lastHealthCheck: null,
    lastHealthError: null,
    failureCount: 0,
    successCount: 0,
  },
];

let weightedSequence = [];
let weightedIndex = 0;
let lastRoutedRequest = null;

function getHealthyNodes() {
  return nodes.filter((node) => node.healthy);
}

function rebuildWeightedSequence() {
  weightedSequence = [];

  const healthyNodes = getHealthyNodes();

  healthyNodes.forEach((node) => {
    for (let i = 0; i < node.weight; i += 1) {
      weightedSequence.push(node);
    }
  });

  if (weightedIndex >= weightedSequence.length) {
    weightedIndex = 0;
  }
}

function pickNodeWeightedRoundRobin() {
  rebuildWeightedSequence();

  if (weightedSequence.length === 0) {
    return null;
  }

  const selectedNode = weightedSequence[weightedIndex];

  weightedIndex = (weightedIndex + 1) % weightedSequence.length;

  return selectedNode;
}

function hashString(input) {
  const hex = crypto.createHash("sha1").update(input).digest("hex").slice(0, 8);
  return parseInt(hex, 16);
}

function buildHashRing() {
  const ring = [];

  getHealthyNodes().forEach((node) => {
    const virtualNodeCount = node.weight * VIRTUAL_NODES_PER_WEIGHT;

    for (let i = 0; i < virtualNodeCount; i += 1) {
      ring.push({
        hash: hashString(`${node.id}-vn-${i}`),
        node,
        virtualNodeId: `${node.id}-vn-${i}`,
      });
    }
  });

  ring.sort((a, b) => a.hash - b.hash);

  return ring;
}

function pickNodeByConsistentHash(key) {
  const ring = buildHashRing();

  if (ring.length === 0) {
    return {
      selectedNode: null,
      hash: null,
      ringSize: 0,
      virtualNodeId: null,
      virtualNodeHash: null,
    };
  }

  const keyHash = hashString(key);

  const matchedVirtualNode =
    ring.find((item) => item.hash >= keyHash) || ring[0];

  return {
    selectedNode: matchedVirtualNode.node,
    hash: keyHash,
    ringSize: ring.length,
    virtualNodeId: matchedVirtualNode.virtualNodeId,
    virtualNodeHash: matchedVirtualNode.hash,
  };
}

function markNodeSuccess(node) {
  node.successCount += 1;
  node.failureCount = 0;
  node.healthy = true;
  node.lastHealthError = null;
}

function markNodeFailure(node, error) {
  node.failureCount += 1;
  node.lastHealthError = error.code || error.message;

  if (node.failureCount >= FAILURE_THRESHOLD) {
    node.healthy = false;
  }

  rebuildWeightedSequence();
}

async function refreshHealthChecks() {
  await Promise.all(
    nodes.map(async (node) => {
      node.lastHealthCheck = new Date().toISOString();

      try {
        await axios.get(`${node.url}/health`, {
          timeout: HEALTH_CHECK_TIMEOUT_MS,
        });

        markNodeSuccess(node);
      } catch (error) {
        markNodeFailure(node, error);
      }
    }),
  );

  rebuildWeightedSequence();
}

function formatNodeForStatus(node) {
  return {
    id: node.id,
    url: node.url,
    weight: node.weight,
    healthy: node.healthy,
    includedInRouting: node.healthy,
    requestCount: node.requestCount,
    lastHealthCheck: node.lastHealthCheck,
    lastHealthError: node.lastHealthError,
    failureCount: node.failureCount,
    successCount: node.successCount,
  };
}

async function getRaftStatus(node) {
  const response = await axios.get(`${node.url}/raft/status`, {
    timeout: HEALTH_CHECK_TIMEOUT_MS,
  });

  return response.data;
}

async function discoverCurrentLeader() {
  const healthyNodes = getHealthyNodes();

  for (const node of healthyNodes) {
    try {
      const status = await getRaftStatus(node);

      if (status.role === "leader") {
        return {
          leaderNode: node,
          leaderStatus: status,
        };
      }
    } catch (error) {
      markNodeFailure(node, error);
    }
  }

  return {
    leaderNode: null,
    leaderStatus: null,
  };
}

async function electNewLeader() {
  const healthyNodes = getHealthyNodes();

  if (healthyNodes.length === 0) {
    return {
      leaderNode: null,
      leaderStatus: null,
      election: {
        status: "failed",
        reason: "No healthy nodes available",
      },
    };
  }

  const candidate = healthyNodes[0];

  let highestTerm = 1;

  const statuses = await Promise.all(
    healthyNodes.map(async (node) => {
      try {
        const status = await getRaftStatus(node);
        highestTerm = Math.max(highestTerm, status.currentTerm || 1);

        return {
          node,
          status,
        };
      } catch (error) {
        markNodeFailure(node, error);
        return null;
      }
    }),
  );

  const newTerm = highestTerm + 1;

  try {
    const leaderResponse = await axios.post(
      `${candidate.url}/raft/become-leader`,
      { term: newTerm },
      { timeout: HEALTH_CHECK_TIMEOUT_MS },
    );

    await Promise.all(
      statuses
        .filter((item) => item && item.node.id !== candidate.id)
        .map(async (item) => {
          try {
            await axios.post(
              `${item.node.url}/raft/become-follower`,
              {
                leaderId: candidate.id,
                term: newTerm,
              },
              { timeout: HEALTH_CHECK_TIMEOUT_MS },
            );
          } catch (error) {
            markNodeFailure(item.node, error);
          }
        }),
    );

    return {
      leaderNode: candidate,
      leaderStatus: leaderResponse.data,
      election: {
        status: "success",
        newLeader: candidate.id,
        term: newTerm,
      },
    };
  } catch (error) {
    markNodeFailure(candidate, error);

    return {
      leaderNode: null,
      leaderStatus: null,
      election: {
        status: "failed",
        reason: error.code || error.message,
      },
    };
  }
}

async function getOrElectLeader() {
  const currentLeader = await discoverCurrentLeader();

  if (currentLeader.leaderNode) {
    return {
      ...currentLeader,
      election: {
        status: "not-needed",
        leader: currentLeader.leaderNode.id,
      },
    };
  }

  return electNewLeader();
}

async function proxyPostToLeader(path, body) {
  const { leaderNode, leaderStatus, election } = await getOrElectLeader();

  if (!leaderNode) {
    return {
      statusCode: 503,
      data: {
        error: "No Raft leader available",
        election,
      },
    };
  }

  try {
    const response = await axios.post(`${leaderNode.url}${path}`, body, {
      timeout: HEALTH_CHECK_TIMEOUT_MS,
    });

    leaderNode.requestCount += 1;
    markNodeSuccess(leaderNode);

    lastRoutedRequest = {
      method: "POST",
      path,
      routingStrategy: "leader-aware-routing",
      selectedNode: leaderNode.id,
      leaderTerm: leaderStatus.currentTerm,
      election,
      timestamp: new Date().toISOString(),
    };

    return {
      statusCode: response.status,
      data: {
        routedBy: "custom-load-balancer",
        algorithm: "leader-aware-routing",
        selectedNode: leaderNode.id,
        leader: leaderNode.id,
        leaderTerm: leaderStatus.currentTerm,
        election,
        response: response.data,
      },
    };
  } catch (error) {
    markNodeFailure(leaderNode, error);

    return {
      statusCode: 502,
      data: {
        error: "Failed to reach Raft leader",
        selectedNode: leaderNode.id,
        election,
      },
    };
  }
}

async function proxyDeleteToLeader(path) {
  const { leaderNode, leaderStatus, election } = await getOrElectLeader();

  if (!leaderNode) {
    return {
      statusCode: 503,
      data: {
        error: "No Raft leader available",
        election,
      },
    };
  }

  try {
    const response = await axios.delete(`${leaderNode.url}${path}`, {
      timeout: HEALTH_CHECK_TIMEOUT_MS,
    });

    leaderNode.requestCount += 1;
    markNodeSuccess(leaderNode);

    lastRoutedRequest = {
      method: "DELETE",
      path,
      routingStrategy: "leader-aware-routing",
      selectedNode: leaderNode.id,
      leaderTerm: leaderStatus.currentTerm,
      election,
      timestamp: new Date().toISOString(),
    };

    return {
      statusCode: response.status,
      data: {
        routedBy: "custom-load-balancer",
        algorithm: "leader-aware-routing",
        selectedNode: leaderNode.id,
        leader: leaderNode.id,
        leaderTerm: leaderStatus.currentTerm,
        election,
        response: response.data,
      },
    };
  } catch (error) {
    markNodeFailure(leaderNode, error);

    return {
      statusCode: 502,
      data: {
        error: "Failed to reach Raft leader",
        selectedNode: leaderNode.id,
        election,
      },
    };
  }
}

async function proxyGetToSelectedNode(path) {
  const selectedNode = pickNodeWeightedRoundRobin();

  if (!selectedNode) {
    return {
      statusCode: 503,
      data: {
        error: "No healthy nodes available",
      },
    };
  }

  try {
    const response = await axios.get(`${selectedNode.url}${path}`, {
      timeout: HEALTH_CHECK_TIMEOUT_MS,
    });

    selectedNode.requestCount += 1;
    markNodeSuccess(selectedNode);

    lastRoutedRequest = {
      method: "GET",
      path,
      routingStrategy: "weighted-round-robin",
      selectedNode: selectedNode.id,
      timestamp: new Date().toISOString(),
    };

    return {
      statusCode: response.status,
      data: {
        routedBy: "custom-load-balancer",
        algorithm: "weighted-round-robin",
        selectedNode: selectedNode.id,
        response: response.data,
      },
    };
  } catch (error) {
    markNodeFailure(selectedNode, error);

    return {
      statusCode: 502,
      data: {
        error: "Failed to reach selected node",
        selectedNode: selectedNode.id,
      },
    };
  }
}

async function proxyGetByConsistentHash(key) {
  const hashResult = pickNodeByConsistentHash(key);
  const selectedNode = hashResult.selectedNode;

  if (!selectedNode) {
    return {
      statusCode: 503,
      data: {
        error: "No healthy nodes available",
      },
    };
  }

  try {
    const response = await axios.get(`${selectedNode.url}/api/get/${key}`, {
      timeout: HEALTH_CHECK_TIMEOUT_MS,
    });

    selectedNode.requestCount += 1;
    markNodeSuccess(selectedNode);

    lastRoutedRequest = {
      method: "GET",
      path: `/api/get/${key}`,
      routingStrategy: "consistent-hashing",
      key,
      keyHash: hashResult.hash,
      selectedNode: selectedNode.id,
      virtualNodeId: hashResult.virtualNodeId,
      timestamp: new Date().toISOString(),
    };

    return {
      statusCode: response.status,
      data: {
        routedBy: "custom-load-balancer",
        algorithm: "consistent-hashing",
        key,
        keyHash: hashResult.hash,
        selectedNode: selectedNode.id,
        virtualNodeId: hashResult.virtualNodeId,
        ringSize: hashResult.ringSize,
        response: response.data,
      },
    };
  } catch (error) {
    markNodeFailure(selectedNode, error);

    return {
      statusCode: 502,
      data: {
        error: "Failed to reach selected node",
        selectedNode: selectedNode.id,
      },
    };
  }
}

async function proxyPostToSelectedNode(path, body) {
  const selectedNode = pickNodeWeightedRoundRobin();

  if (!selectedNode) {
    return {
      statusCode: 503,
      data: {
        error: "No healthy nodes available",
      },
    };
  }

  try {
    const response = await axios.post(`${selectedNode.url}${path}`, body, {
      timeout: HEALTH_CHECK_TIMEOUT_MS,
    });

    selectedNode.requestCount += 1;
    markNodeSuccess(selectedNode);

    lastRoutedRequest = {
      method: "POST",
      path,
      routingStrategy: "weighted-round-robin",
      selectedNode: selectedNode.id,
      timestamp: new Date().toISOString(),
    };

    return {
      statusCode: response.status,
      data: {
        routedBy: "custom-load-balancer",
        algorithm: "weighted-round-robin",
        selectedNode: selectedNode.id,
        response: response.data,
      },
    };
  } catch (error) {
    markNodeFailure(selectedNode, error);

    return {
      statusCode: 502,
      data: {
        error: "Failed to reach selected node",
        selectedNode: selectedNode.id,
      },
    };
  }
}

async function proxyDeleteToSelectedNode(path) {
  const selectedNode = pickNodeWeightedRoundRobin();

  if (!selectedNode) {
    return {
      statusCode: 503,
      data: {
        error: "No healthy nodes available",
      },
    };
  }

  try {
    const response = await axios.delete(`${selectedNode.url}${path}`, {
      timeout: HEALTH_CHECK_TIMEOUT_MS,
    });

    selectedNode.requestCount += 1;
    markNodeSuccess(selectedNode);

    lastRoutedRequest = {
      method: "DELETE",
      path,
      routingStrategy: "weighted-round-robin",
      selectedNode: selectedNode.id,
      timestamp: new Date().toISOString(),
    };

    return {
      statusCode: response.status,
      data: {
        routedBy: "custom-load-balancer",
        algorithm: "weighted-round-robin",
        selectedNode: selectedNode.id,
        response: response.data,
      },
    };
  } catch (error) {
    markNodeFailure(selectedNode, error);

    return {
      statusCode: 502,
      data: {
        error: "Failed to reach selected node",
        selectedNode: selectedNode.id,
      },
    };
  }
}

setInterval(refreshHealthChecks, HEALTH_CHECK_INTERVAL_MS);

refreshHealthChecks().catch((error) => {
  console.error("Initial health check failed:", error.message);
});

app.get("/lb/status", (req, res) => {
  rebuildWeightedSequence();

  const hashRingSize = buildHashRing().length;

  res.json({
    service: "custom-load-balancer",
    algorithm: "weighted-round-robin",
    keyBasedRouting: "consistent-hashing",
    writeRouting: "raft-leader",
    healthCheckIntervalMs: HEALTH_CHECK_INTERVAL_MS,
    healthCheckTimeoutMs: HEALTH_CHECK_TIMEOUT_MS,
    failureThreshold: FAILURE_THRESHOLD,
    virtualNodesPerWeight: VIRTUAL_NODES_PER_WEIGHT,
    hashRingSize,
    healthyNodes: getHealthyNodes().map((node) => node.id),
    unhealthyNodes: nodes
      .filter((node) => !node.healthy)
      .map((node) => node.id),
    lastRoutedRequest,
    nodes: nodes.map(formatNodeForStatus),
    weightedSequence: weightedSequence.map((node) => node.id),
  });
});

app.get("/lb/hash/:key", (req, res) => {
  rebuildWeightedSequence();

  const { key } = req.params;
  const hashResult = pickNodeByConsistentHash(key);

  if (!hashResult.selectedNode) {
    return res.status(503).json({
      error: "No healthy nodes available",
    });
  }

  res.json({
    algorithm: "consistent-hashing",
    key,
    keyHash: hashResult.hash,
    selectedNode: hashResult.selectedNode.id,
    virtualNodeId: hashResult.virtualNodeId,
    virtualNodeHash: hashResult.virtualNodeHash,
    ringSize: hashResult.ringSize,
    healthyNodes: getHealthyNodes().map((node) => node.id),
  });
});

app.post("/lb/refresh-health", async (req, res) => {
  await refreshHealthChecks();

  res.json({
    status: "refreshed",
    healthyNodes: getHealthyNodes().map((node) => node.id),
    unhealthyNodes: nodes
      .filter((node) => !node.healthy)
      .map((node) => node.id),
    nodes: nodes.map(formatNodeForStatus),
    weightedSequence: weightedSequence.map((node) => node.id),
  });
});

app.post("/lb/reset-stats", (req, res) => {
  nodes.forEach((node) => {
    node.requestCount = 0;
    node.failureCount = 0;
    node.successCount = 0;
    node.lastHealthError = null;
    node.healthy = true;
  });

  weightedIndex = 0;
  lastRoutedRequest = null;
  rebuildWeightedSequence();

  res.json({
    status: "reset",
    message: "Load balancer statistics were reset",
  });
});

app.post("/raft/elect-leader", async (req, res) => {
  await refreshHealthChecks();

  const result = await getOrElectLeader();

  if (!result.leaderNode) {
    return res.status(503).json({
      error: "Leader election failed",
      election: result.election,
    });
  }

  res.json({
    status: "leader-ready",
    leader: result.leaderNode.id,
    leaderStatus: result.leaderStatus,
    election: result.election,
  });
});

app.get("/cluster/status", async (req, res) => {
  rebuildWeightedSequence();

  const raftStatuses = await Promise.all(
    nodes.map(async (node) => {
      if (!node.healthy) {
        return {
          id: node.id,
          healthy: false,
          includedInRouting: false,
          raft: null,
        };
      }

      try {
        const response = await axios.get(`${node.url}/raft/status`, {
          timeout: HEALTH_CHECK_TIMEOUT_MS,
        });

        return {
          id: node.id,
          healthy: true,
          includedInRouting: true,
          raft: response.data,
        };
      } catch (error) {
        markNodeFailure(node, error);

        return {
          id: node.id,
          healthy: false,
          includedInRouting: false,
          raft: null,
        };
      }
    }),
  );

  const leader = raftStatuses.find(
    (item) => item.raft && item.raft.role === "leader",
  );

  res.json({
    gateway: "nginx",
    loadBalancer: {
      service: "custom-load-balancer",
      algorithm: "weighted-round-robin",
      keyBasedRouting: "consistent-hashing",
      writeRouting: "raft-leader",
      healthyNodes: getHealthyNodes().map((node) => node.id),
      unhealthyNodes: nodes
        .filter((node) => !node.healthy)
        .map((node) => node.id),
      lastRoutedRequest,
      weightedSequence: weightedSequence.map((node) => node.id),
    },
    raft: {
      currentLeader: leader ? leader.id : null,
      nodes: raftStatuses,
    },
  });
});

app.get("/raft/logs", async (req, res) => {
  const logs = await Promise.all(
    nodes.map(async (node) => {
      if (!node.healthy) {
        return {
          id: node.id,
          healthy: false,
          error: "Node is marked unhealthy",
          data: null,
        };
      }

      try {
        const response = await axios.get(`${node.url}/raft/log`, {
          timeout: HEALTH_CHECK_TIMEOUT_MS,
        });

        return {
          id: node.id,
          healthy: true,
          data: response.data,
        };
      } catch (error) {
        markNodeFailure(node, error);

        return {
          id: node.id,
          healthy: false,
          error: error.code || error.message,
          data: null,
        };
      }
    }),
  );

  const leader = logs.find((item) => item.data?.role === "leader");

  res.json({
    cluster: {
      leader: leader?.id || null,
      majority: Math.floor(nodes.length / 2) + 1,
      totalNodes: nodes.length,
    },
    logs,
  });
});

app.get("/api/ping", async (req, res) => {
  const result = await proxyGetToSelectedNode("/api/ping");
  res.status(result.statusCode).json(result.data);
});

app.get("/api/get/:key", async (req, res) => {
  const result = await proxyGetByConsistentHash(req.params.key);
  res.status(result.statusCode).json(result.data);
});

app.post("/api/set", async (req, res) => {
  const result = await proxyPostToLeader("/api/set", req.body);
  res.status(result.statusCode).json(result.data);
});

app.delete("/api/delete/:key", async (req, res) => {
  const result = await proxyDeleteToLeader(`/api/delete/${req.params.key}`);
  res.status(result.statusCode).json(result.data);
});

app.listen(PORT, () => {
  console.log(`Custom Load Balancer is running on port ${PORT}`);
});
