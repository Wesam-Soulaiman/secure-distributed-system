const express = require("express");

const {
  HEALTH_CHECK_INTERVAL_MS,
  HEALTH_CHECK_TIMEOUT_MS,
  FAILURE_THRESHOLD,
  VIRTUAL_NODES_PER_WEIGHT,
} = require("../config");

const {
  nodes,
  getHealthyNodes,
  resetNodeStats,
  formatNodeForStatus,
} = require("../state/nodes");

const {
  getWeightedSequence,
  resetWeightedIndex,
  rebuildWeightedSequence,
} = require("../algorithms/weightedRoundRobin");

const {
  buildHashRing,
  pickNodeByConsistentHash,
} = require("../algorithms/consistentHashing");

const { refreshHealthChecks } = require("../services/healthService");
const {
  getLastRoutedRequest,
  clearLastRoutedRequest,
} = require("../state/routingState");

const router = express.Router();

router.get("/lb/status", (req, res) => {
  rebuildWeightedSequence();

  res.json({
    service: "custom-load-balancer",
    algorithm: "weighted-round-robin",
    keyBasedRouting: "consistent-hashing",
    writeRouting: "auto-elected-raft-leader",
    healthCheckIntervalMs: HEALTH_CHECK_INTERVAL_MS,
    healthCheckTimeoutMs: HEALTH_CHECK_TIMEOUT_MS,
    failureThreshold: FAILURE_THRESHOLD,
    virtualNodesPerWeight: VIRTUAL_NODES_PER_WEIGHT,
    hashRingSize: buildHashRing().length,
    healthyNodes: getHealthyNodes().map((node) => node.id),
    unhealthyNodes: nodes
      .filter((node) => !node.healthy)
      .map((node) => node.id),
    lastRoutedRequest: getLastRoutedRequest(),
    nodes: nodes.map(formatNodeForStatus),
    weightedSequence: getWeightedSequence(),
  });
});

router.get("/lb/hash/:key", (req, res) => {
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

router.post("/lb/refresh-health", async (req, res) => {
  await refreshHealthChecks();

  res.json({
    status: "refreshed",
    healthyNodes: getHealthyNodes().map((node) => node.id),
    unhealthyNodes: nodes
      .filter((node) => !node.healthy)
      .map((node) => node.id),
    nodes: nodes.map(formatNodeForStatus),
    weightedSequence: getWeightedSequence(),
  });
});

router.post("/lb/reset-stats", (req, res) => {
  resetNodeStats();
  resetWeightedIndex();
  clearLastRoutedRequest();
  rebuildWeightedSequence();

  res.json({
    status: "reset",
    message: "Load balancer statistics were reset",
  });
});

module.exports = router;
