const axios = require("axios");

const { HEALTH_CHECK_TIMEOUT_MS, RAFT_WRITE_TIMEOUT_MS } = require("../config");

const { markNodeSuccess, markNodeFailure } = require("../state/nodes");

const {
  pickNodeWeightedRoundRobin,
} = require("../algorithms/weightedRoundRobin");

const { pickNodeByConsistentHash } = require("../algorithms/consistentHashing");

const { discoverCurrentLeaderWithRetry } = require("./leaderService");

const { setLastRoutedRequest } = require("../state/routingState");

const {
  canSendRequest,
  formatCircuitBreaker,
} = require("./circuitBreakerService");

function createCircuitOpenResult(node, message) {
  return {
    statusCode: 503,
    data: {
      error: message,
      selectedNode: node.id,
      circuitBreaker: formatCircuitBreaker(node),
    },
  };
}

async function proxyGetToSelectedNode(path) {
  const selectedNode = pickNodeWeightedRoundRobin();

  if (!selectedNode) {
    return {
      statusCode: 503,
      data: {
        error: "No routable nodes are currently available",
      },
    };
  }

  if (!canSendRequest(selectedNode)) {
    return createCircuitOpenResult(
      selectedNode,
      "Selected node circuit breaker is open",
    );
  }

  try {
    const response = await axios.get(`${selectedNode.url}${path}`, {
      timeout: HEALTH_CHECK_TIMEOUT_MS,
    });

    selectedNode.requestCount += 1;

    markNodeSuccess(selectedNode);

    setLastRoutedRequest({
      method: "GET",
      path,
      routingStrategy: "weighted-round-robin",
      selectedNode: selectedNode.id,
      timestamp: new Date().toISOString(),
    });

    return {
      statusCode: response.status,
      data: {
        routedBy: "custom-load-balancer",
        algorithm: "weighted-round-robin",
        selectedNode: selectedNode.id,
        circuitBreaker: formatCircuitBreaker(selectedNode),
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
        reason: error.code || error.response?.data || error.message,
        circuitBreaker: formatCircuitBreaker(selectedNode),
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
        error: "No routable nodes are currently available",
      },
    };
  }

  if (!canSendRequest(selectedNode)) {
    return createCircuitOpenResult(
      selectedNode,
      "Responsible node circuit breaker is open",
    );
  }

  try {
    const response = await axios.get(
      `${selectedNode.url}/api/get/${encodeURIComponent(key)}`,
      {
        timeout: HEALTH_CHECK_TIMEOUT_MS,
      },
    );

    selectedNode.requestCount += 1;
    markNodeSuccess(selectedNode);

    setLastRoutedRequest({
      method: "GET",
      path: `/api/get/${key}`,
      routingStrategy: "consistent-hashing",
      key,
      keyHash: hashResult.hash,
      selectedNode: selectedNode.id,
      virtualNodeId: hashResult.virtualNodeId,
      timestamp: new Date().toISOString(),
    });

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

        circuitBreaker: formatCircuitBreaker(selectedNode),

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
        reason: error.code || error.response?.data || error.message,
        circuitBreaker: formatCircuitBreaker(selectedNode),
      },
    };
  }
}

async function retryWriteAfterStaleLeader(
  path,
  body,
  previousLeader,
  originalError,
) {
  const { leaderNode, leaderStatus, retry } =
    await discoverCurrentLeaderWithRetry();

  if (!leaderNode) {
    return {
      statusCode: 503,
      data: {
        error: "A new Raft leader was not discovered",
        previousLeader: previousLeader.id,
        originalStatus: originalError.response?.status,
        originalResponse: originalError.response?.data,
        retry,
      },
    };
  }

  if (leaderNode.id === previousLeader.id) {
    return {
      statusCode: 503,
      data: {
        error: "Leader discovery still returned the stale leader",
        previousLeader: previousLeader.id,
        retry,
      },
    };
  }

  if (!canSendRequest(leaderNode)) {
    return {
      statusCode: 503,
      data: {
        error: "New Raft leader circuit breaker is open",
        previousLeader: previousLeader.id,
        selectedNode: leaderNode.id,
        circuitBreaker: formatCircuitBreaker(leaderNode),
        retry,
      },
    };
  }

  try {
    const response = await axios.post(`${leaderNode.url}${path}`, body, {
      timeout: RAFT_WRITE_TIMEOUT_MS,
    });

    leaderNode.requestCount += 1;
    markNodeSuccess(leaderNode);

    setLastRoutedRequest({
      method: "POST",
      path,
      routingStrategy: "leader-aware-routing-with-retry",
      previousLeader: previousLeader.id,
      selectedNode: leaderNode.id,
      leaderTerm: leaderStatus.currentTerm,
      retryAttempts: retry.totalAttempts,
      timestamp: new Date().toISOString(),
    });

    return {
      statusCode: response.status,
      data: {
        routedBy: "custom-load-balancer",
        algorithm: "leader-aware-routing-with-retry",

        previousLeader: previousLeader.id,
        selectedNode: leaderNode.id,

        leader: leaderNode.id,
        leaderTerm: leaderStatus.currentTerm,

        retry: {
          reason:
            "Previous node rejected the request because it was not leader",
          strategy: "exponential-backoff",
          leaderDiscoveryAttempts: retry.totalAttempts,
          attempts: retry.attempts,
        },

        circuitBreaker: formatCircuitBreaker(leaderNode),

        response: response.data,
      },
    };
  } catch (error) {
    markNodeFailure(leaderNode, error);

    return {
      statusCode: error.response?.status || 502,
      data: {
        error: "Write failed after discovering a new leader",

        previousLeader: previousLeader.id,
        selectedNode: leaderNode.id,

        ambiguousWriteResult: !error.response,

        message: error.response?.data || error.code || error.message,

        circuitBreaker: formatCircuitBreaker(leaderNode),
      },
    };
  }
}

async function proxyPostToLeader(path, body) {
  const { leaderNode, leaderStatus, retry } =
    await discoverCurrentLeaderWithRetry();

  if (!leaderNode) {
    return {
      statusCode: 503,
      data: {
        error: "No Raft leader is currently available",
        reason:
          "The cluster did not elect a leader before retry attempts were exhausted",
        retry,
      },
    };
  }

  if (!canSendRequest(leaderNode)) {
    return {
      statusCode: 503,
      data: {
        error: "Raft leader circuit breaker is open",
        selectedNode: leaderNode.id,
        retry,
        circuitBreaker: formatCircuitBreaker(leaderNode),
      },
    };
  }

  try {
    const response = await axios.post(`${leaderNode.url}${path}`, body, {
      timeout: RAFT_WRITE_TIMEOUT_MS,
    });

    leaderNode.requestCount += 1;
    markNodeSuccess(leaderNode);

    setLastRoutedRequest({
      method: "POST",
      path,
      routingStrategy: "leader-aware-routing",
      selectedNode: leaderNode.id,
      leaderTerm: leaderStatus.currentTerm,
      retryAttempts: retry.totalAttempts,
      timestamp: new Date().toISOString(),
    });

    return {
      statusCode: response.status,
      data: {
        routedBy: "custom-load-balancer",
        algorithm: "leader-aware-routing",

        selectedNode: leaderNode.id,
        leader: leaderNode.id,
        leaderTerm: leaderStatus.currentTerm,

        retry: {
          strategy: "exponential-backoff",
          leaderDiscoveryAttempts: retry.totalAttempts,
          attempts: retry.attempts,
        },

        circuitBreaker: formatCircuitBreaker(leaderNode),

        response: response.data,
      },
    };
  } catch (error) {
    const responseStatus = error.response?.status;

    if (responseStatus === 409) {
      return retryWriteAfterStaleLeader(path, body, leaderNode, error);
    }

    markNodeFailure(leaderNode, error);

    return {
      statusCode: error.response?.status || 502,
      data: {
        error: "Failed to reach Raft leader",
        selectedNode: leaderNode.id,

        ambiguousWriteResult: !error.response,

        reason: error.response
          ? error.response.data
          : "The request may have reached the leader, so it was not automatically retried",

        retry: {
          strategy: "exponential-backoff",
          leaderDiscoveryAttempts: retry.totalAttempts,
          attempts: retry.attempts,
        },

        circuitBreaker: formatCircuitBreaker(leaderNode),
      },
    };
  }
}

async function proxyDeleteToLeader(path) {
  const { leaderNode, leaderStatus, retry } =
    await discoverCurrentLeaderWithRetry();

  if (!leaderNode) {
    return {
      statusCode: 503,
      data: {
        error: "No Raft leader is currently available",
        reason:
          "The cluster did not elect a leader before retry attempts were exhausted",
        retry,
      },
    };
  }

  if (!canSendRequest(leaderNode)) {
    return {
      statusCode: 503,
      data: {
        error: "Raft leader circuit breaker is open",
        selectedNode: leaderNode.id,
        retry,
        circuitBreaker: formatCircuitBreaker(leaderNode),
      },
    };
  }

  try {
    const response = await axios.delete(`${leaderNode.url}${path}`, {
      timeout: RAFT_WRITE_TIMEOUT_MS,
    });

    leaderNode.requestCount += 1;
    markNodeSuccess(leaderNode);

    setLastRoutedRequest({
      method: "DELETE",
      path,
      routingStrategy: "leader-aware-routing",
      selectedNode: leaderNode.id,
      leaderTerm: leaderStatus.currentTerm,
      retryAttempts: retry.totalAttempts,
      timestamp: new Date().toISOString(),
    });

    return {
      statusCode: response.status,
      data: {
        routedBy: "custom-load-balancer",
        algorithm: "leader-aware-routing",

        selectedNode: leaderNode.id,
        leader: leaderNode.id,
        leaderTerm: leaderStatus.currentTerm,

        retry: {
          strategy: "exponential-backoff",
          leaderDiscoveryAttempts: retry.totalAttempts,
          attempts: retry.attempts,
        },

        circuitBreaker: formatCircuitBreaker(leaderNode),

        response: response.data,
      },
    };
  } catch (error) {
    const responseStatus = error.response?.status;

    /*
     * لا نعيد DELETE بعد timeout غامض.
     * لكن إذا ردت العقدة 409، نوضح أن القائد تغير.
     */
    if (responseStatus === 409) {
      return {
        statusCode: 409,
        data: {
          error: "Selected node is no longer the Raft leader",
          selectedNode: leaderNode.id,
          currentLeader: error.response?.data?.currentLeader || null,
          message: error.response?.data,
          retry,
        },
      };
    }

    markNodeFailure(leaderNode, error);

    return {
      statusCode: error.response?.status || 502,
      data: {
        error: "Failed to reach Raft leader",
        selectedNode: leaderNode.id,

        ambiguousWriteResult: !error.response,

        message: error.response?.data || error.code || error.message,

        retry: {
          strategy: "exponential-backoff",
          leaderDiscoveryAttempts: retry.totalAttempts,
          attempts: retry.attempts,
        },

        circuitBreaker: formatCircuitBreaker(leaderNode),
      },
    };
  }
}

module.exports = {
  proxyGetToSelectedNode,
  proxyGetByConsistentHash,
  proxyPostToLeader,
  proxyDeleteToLeader,
};
