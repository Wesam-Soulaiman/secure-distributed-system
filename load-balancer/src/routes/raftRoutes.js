const express = require("express");
const axios = require("axios");

const { HEALTH_CHECK_TIMEOUT_MS } = require("../config");
const { nodes, markNodeFailure } = require("../state/nodes");

const router = express.Router();

router.get("/raft/logs", async (req, res) => {
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
      electionMode: "automatic-node-driven",
    },
    logs,
  });
});

module.exports = router;
