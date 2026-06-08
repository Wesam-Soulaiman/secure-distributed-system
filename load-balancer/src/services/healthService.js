const axios = require("axios");
const { HEALTH_CHECK_TIMEOUT_MS } = require("../config");
const { nodes, markNodeSuccess, markNodeFailure } = require("../state/nodes");
const { rebuildWeightedSequence } = require("../algorithms/weightedRoundRobin");

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

module.exports = {
  refreshHealthChecks,
};
