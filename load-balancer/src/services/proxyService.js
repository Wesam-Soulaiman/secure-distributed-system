const axios = require("axios");
const { HEALTH_CHECK_TIMEOUT_MS } = require("../config");
const { markNodeSuccess, markNodeFailure } = require("../state/nodes");
const {
  pickNodeWeightedRoundRobin,
} = require("../algorithms/weightedRoundRobin");
const { pickNodeByConsistentHash } = require("../algorithms/consistentHashing");
const { discoverCurrentLeader } = require("./leaderService");
const { setLastRoutedRequest } = require("../state/routingState");

async function proxyGetToSelectedNode(path) {
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
        error: "No healthy nodes available",
      },
    };
  }

  try {
    const response = await axios.get(`${selectedNode.url}/api/get/${key}`, {
      timeout: HEALTH_CHECK_TIMEOUT_MS,
    });

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
      },
    };
  }
}

async function proxyPostToLeader(path, body) {
  const { leaderNode, leaderStatus } = await discoverCurrentLeader();

  if (!leaderNode) {
    return {
      statusCode: 503,
      data: {
        error: "No Raft leader is currently available",
        reason: "Raft election may still be in progress",
        retryAfterMs: 1000,
      },
    };
  }

  try {
    const response = await axios.post(`${leaderNode.url}${path}`, body, {
      timeout: HEALTH_CHECK_TIMEOUT_MS,
    });

    leaderNode.requestCount += 1;
    markNodeSuccess(leaderNode);

    setLastRoutedRequest({
      method: "POST",
      path,
      routingStrategy: "leader-aware-routing",
      selectedNode: leaderNode.id,
      leaderTerm: leaderStatus.currentTerm,
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
        response: response.data,
      },
    };
  } catch (error) {
    markNodeFailure(leaderNode, error);

    return {
      statusCode: 502,
      data: {
        error: "Failed to reach Raft leader",
        selectedNode: leaderNode.id,
      },
    };
  }
}

async function proxyDeleteToLeader(path) {
  const { leaderNode, leaderStatus } = await discoverCurrentLeader();

  if (!leaderNode) {
    return {
      statusCode: 503,
      data: {
        error: "No Raft leader is currently available",
        reason: "Raft election may still be in progress",
        retryAfterMs: 1000,
      },
    };
  }

  try {
    const response = await axios.delete(`${leaderNode.url}${path}`, {
      timeout: HEALTH_CHECK_TIMEOUT_MS,
    });

    leaderNode.requestCount += 1;
    markNodeSuccess(leaderNode);

    setLastRoutedRequest({
      method: "DELETE",
      path,
      routingStrategy: "leader-aware-routing",
      selectedNode: leaderNode.id,
      leaderTerm: leaderStatus.currentTerm,
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
        response: response.data,
      },
    };
  } catch (error) {
    markNodeFailure(leaderNode, error);

    return {
      statusCode: 502,
      data: {
        error: "Failed to reach Raft leader",
        selectedNode: leaderNode.id,
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
