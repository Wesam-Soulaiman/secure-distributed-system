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
  },
  {
    id: "node-b",
    url: "http://node-b:8000",
    weight: 2,
    healthy: true,
  },
  {
    id: "node-c",
    url: "http://node-c:8000",
    weight: 1,
    healthy: true,
  },
];

let requestCounter = 0;

function getHealthyNodes() {
  return nodes.filter((node) => node.healthy);
}

function pickNodeBasicRoundRobin() {
  const healthyNodes = getHealthyNodes();

  if (healthyNodes.length === 0) {
    return null;
  }

  const node = healthyNodes[requestCounter % healthyNodes.length];
  requestCounter += 1;
  return node;
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

setInterval(refreshHealthChecks, 3000);

app.get("/lb/status", async (req, res) => {
  await refreshHealthChecks();

  res.json({
    service: "custom-load-balancer",
    algorithm: "basic-round-robin-now-weighted-later",
    nodes,
    healthyNodes: getHealthyNodes().map((node) => node.id),
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
      algorithm: "basic-round-robin-now-weighted-later",
      healthyNodes: getHealthyNodes().map((node) => node.id),
    },
    raft: {
      currentLeader: leader ? leader.id : null,
      nodes: raftStatuses,
    },
  });
});

app.get("/api/ping", async (req, res) => {
  await refreshHealthChecks();

  const selectedNode = pickNodeBasicRoundRobin();

  if (!selectedNode) {
    return res.status(503).json({
      error: "No healthy nodes available",
    });
  }

  try {
    const response = await axios.get(`${selectedNode.url}/api/ping`);

    res.json({
      routedBy: "custom-load-balancer",
      selectedNode: selectedNode.id,
      response: response.data,
    });
  } catch (error) {
    selectedNode.healthy = false;

    res.status(502).json({
      error: "Failed to reach selected node",
      selectedNode: selectedNode.id,
    });
  }
});

app.get("/api/get/:key", async (req, res) => {
  await refreshHealthChecks();

  const selectedNode = pickNodeBasicRoundRobin();

  if (!selectedNode) {
    return res.status(503).json({
      error: "No healthy nodes available",
    });
  }

  try {
    const response = await axios.get(
      `${selectedNode.url}/api/get/${req.params.key}`,
    );

    res.json({
      routedBy: "custom-load-balancer",
      selectedNode: selectedNode.id,
      response: response.data,
    });
  } catch (error) {
    selectedNode.healthy = false;

    res.status(502).json({
      error: "Failed to get key from selected node",
      selectedNode: selectedNode.id,
    });
  }
});

app.post("/api/set", async (req, res) => {
  await refreshHealthChecks();

  const selectedNode = pickNodeBasicRoundRobin();

  if (!selectedNode) {
    return res.status(503).json({
      error: "No healthy nodes available",
    });
  }

  try {
    const response = await axios.post(`${selectedNode.url}/api/set`, req.body);

    res.json({
      routedBy: "custom-load-balancer",
      selectedNode: selectedNode.id,
      response: response.data,
    });
  } catch (error) {
    selectedNode.healthy = false;

    res.status(502).json({
      error: "Failed to set key on selected node",
      selectedNode: selectedNode.id,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Custom Load Balancer is running on port ${PORT}`);
});
