const express = require("express");
const axios = require("axios");

const { HEALTH_CHECK_TIMEOUT_MS } = require("../config");
const { nodes, getHealthyNodes, markNodeFailure } = require("../state/nodes");
const { getWeightedSequence } = require("../algorithms/weightedRoundRobin");
const { getLastRoutedRequest } = require("../state/routingState");

const router = express.Router();

router.get("/cluster/status", async (req, res) => {
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
      lastRoutedRequest: getLastRoutedRequest(),
      weightedSequence: getWeightedSequence(),
    },
    raft: {
      currentLeader: leader ? leader.id : null,
      nodes: raftStatuses,
    },
  });
});

module.exports = router;
