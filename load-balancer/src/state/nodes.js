const { FAILURE_THRESHOLD } = require("../config");

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

function getHealthyNodes() {
  return nodes.filter((node) => node.healthy);
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
}

function resetNodeStats() {
  nodes.forEach((node) => {
    node.requestCount = 0;
    node.failureCount = 0;
    node.successCount = 0;
    node.lastHealthError = null;
    node.healthy = true;
  });
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

module.exports = {
  nodes,
  getHealthyNodes,
  markNodeSuccess,
  markNodeFailure,
  resetNodeStats,
  formatNodeForStatus,
};
