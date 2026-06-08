const axios = require("axios");

const {
  HEALTH_CHECK_TIMEOUT_MS,
  LEADER_DISCOVERY_MAX_ATTEMPTS,
} = require("../config");

const { getHealthyNodes, markNodeFailure } = require("../state/nodes");

const { executeWithExponentialBackoff } = require("./retryService");

async function getRaftStatus(node) {
  const response = await axios.get(`${node.url}/raft/status`, {
    timeout: HEALTH_CHECK_TIMEOUT_MS,
  });

  return response.data;
}

async function discoverCurrentLeaderOnce() {
  const healthyNodes = getHealthyNodes();

  const statuses = await Promise.all(
    healthyNodes.map(async (node) => {
      try {
        const status = await getRaftStatus(node);

        return {
          node,
          status,
          reachable: true,
        };
      } catch (error) {
        markNodeFailure(node, error);

        return {
          node,
          status: null,
          reachable: false,
          error: error.code || error.message,
        };
      }
    }),
  );

  const leaderResult = statuses.find(
    (item) => item.reachable && item.status?.role === "leader",
  );

  if (!leaderResult) {
    return {
      leaderNode: null,
      leaderStatus: null,
      checkedNodes: statuses.map((item) => ({
        id: item.node.id,
        reachable: item.reachable,
        role: item.status?.role || null,
        term: item.status?.currentTerm ?? null,
        error: item.error || null,
      })),
    };
  }

  return {
    leaderNode: leaderResult.node,
    leaderStatus: leaderResult.status,
    checkedNodes: statuses.map((item) => ({
      id: item.node.id,
      reachable: item.reachable,
      role: item.status?.role || null,
      term: item.status?.currentTerm ?? null,
      error: item.error || null,
    })),
  };
}

async function discoverCurrentLeaderWithRetry() {
  const retryResult = await executeWithExponentialBackoff({
    operationName: "discover-raft-leader",
    maxAttempts: LEADER_DISCOVERY_MAX_ATTEMPTS,

    operation: async () => discoverCurrentLeaderOnce(),

    shouldRetry: ({ result, error }) => {
      if (error) {
        return true;
      }

      return !result?.leaderNode;
    },
  });

  return {
    ...retryResult.result,
    retry: {
      strategy: "exponential-backoff",
      totalAttempts: retryResult.totalAttempts,
      attempts: retryResult.attempts,
    },
  };
}

module.exports = {
  getRaftStatus,
  discoverCurrentLeaderOnce,
  discoverCurrentLeaderWithRetry,
};
