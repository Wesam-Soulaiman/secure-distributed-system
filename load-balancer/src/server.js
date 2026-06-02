const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const axios = require("axios");

const app = express();

const PORT = process.env.PORT || 7000;

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
  },
  {
    id: "node-b",
    url: "http://node-b:8000",
    weight: 2,
    healthy: true,
    requestCount: 0,
  },
  {
    id: "node-c",
    url: "http://node-c:8000",
    weight: 1,
    healthy: true,
    requestCount: 0,
  },
];

let weightedSequence = [];
let weightedIndex = 0;
let lastRoutedRequest = null;

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

function getHealthyNodes() {
  return nodes.filter((node) => node.healthy);
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

async function refreshHealthChecks() {
  await Promise.all(
    nodes.map(async (node) => {
      try {
        await axios.get(`${node.url}/health`, { timeout: 1000 });
        node.healthy = true;
      } catch (error) {
        node.healthy = false;
      }
    }),
  );
}

async function proxyGetToSelectedNode(path) {
  await refreshHealthChecks();

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
    const response = await axios.get(`${selectedNode.url}${path}`);

    selectedNode.requestCount += 1;

    lastRoutedRequest = {
      method: "GET",
      path,
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
    selectedNode.healthy = false;

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
  await refreshHealthChecks();

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
    const response = await axios.post(`${selectedNode.url}${path}`, body);

    selectedNode.requestCount += 1;

    lastRoutedRequest = {
      method: "POST",
      path,
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
    selectedNode.healthy = false;

    return {
      statusCode: 502,
      data: {
        error: "Failed to reach selected node",
        selectedNode: selectedNode.id,
      },
    };
  }
}

setInterval(refreshHealthChecks, 3000);

app.get("/lb/status", async (req, res) => {
  await refreshHealthChecks();
  rebuildWeightedSequence();

  res.json({
    service: "custom-load-balancer",
    algorithm: "weighted-round-robin",
    healthyNodes: getHealthyNodes().map((node) => node.id),
    lastRoutedRequest,
    nodes: nodes.map((node) => ({
      id: node.id,
      url: node.url,
      weight: node.weight,
      healthy: node.healthy,
      requestCount: node.requestCount,
    })),
    weightedSequence: weightedSequence.map((node) => node.id),
  });
});

app.post("/lb/reset-stats", (req, res) => {
  nodes.forEach((node) => {
    node.requestCount = 0;
  });

  weightedIndex = 0;
  lastRoutedRequest = null;

  res.json({
    status: "reset",
    message: "Load balancer statistics were reset",
  });
});

app.get("/cluster/status", async (req, res) => {
  await refreshHealthChecks();

  const raftStatuses = await Promise.all(
    nodes.map(async (node) => {
      if (!node.healthy) {
        return {
          id: node.id,
          healthy: false,
          raft: null,
        };
      }

      try {
        const response = await axios.get(`${node.url}/raft/status`, {
          timeout: 1000,
        });

        return {
          id: node.id,
          healthy: true,
          raft: response.data,
        };
      } catch (error) {
        return {
          id: node.id,
          healthy: false,
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
      healthyNodes: getHealthyNodes().map((node) => node.id),
      lastRoutedRequest,
    },
    raft: {
      currentLeader: leader ? leader.id : null,
      nodes: raftStatuses,
    },
  });
});

app.get("/api/ping", async (req, res) => {
  const result = await proxyGetToSelectedNode("/api/ping");
  res.status(result.statusCode).json(result.data);
});

app.get("/api/get/:key", async (req, res) => {
  const result = await proxyGetToSelectedNode(`/api/get/${req.params.key}`);
  res.status(result.statusCode).json(result.data);
});

app.post("/api/set", async (req, res) => {
  const result = await proxyPostToSelectedNode("/api/set", req.body);
  res.status(result.statusCode).json(result.data);
});

app.listen(PORT, () => {
  console.log(`Custom Load Balancer is running on port ${PORT}`);
});
