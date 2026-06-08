const axios = require("axios");

const { HEALTH_CHECK_TIMEOUT_MS } = require("../config");
const { getHealthyNodes, markNodeFailure } = require("../state/nodes");

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

module.exports = {
  getRaftStatus,
  discoverCurrentLeader,
};
