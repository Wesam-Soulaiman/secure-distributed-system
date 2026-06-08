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

async function electNewLeader() {
  const healthyNodes = getHealthyNodes();

  if (healthyNodes.length === 0) {
    return {
      leaderNode: null,
      leaderStatus: null,
      election: {
        status: "failed",
        reason: "No healthy nodes available",
      },
    };
  }

  const candidate = healthyNodes[0];

  let highestTerm = 1;

  const statuses = await Promise.all(
    healthyNodes.map(async (node) => {
      try {
        const status = await getRaftStatus(node);
        highestTerm = Math.max(highestTerm, status.currentTerm || 1);

        return {
          node,
          status,
        };
      } catch (error) {
        markNodeFailure(node, error);
        return null;
      }
    }),
  );

  const newTerm = highestTerm + 1;

  try {
    const leaderResponse = await axios.post(
      `${candidate.url}/raft/become-leader`,
      { term: newTerm },
      { timeout: HEALTH_CHECK_TIMEOUT_MS },
    );

    await Promise.all(
      statuses
        .filter((item) => item && item.node.id !== candidate.id)
        .map(async (item) => {
          try {
            await axios.post(
              `${item.node.url}/raft/become-follower`,
              {
                leaderId: candidate.id,
                term: newTerm,
              },
              { timeout: HEALTH_CHECK_TIMEOUT_MS },
            );
          } catch (error) {
            markNodeFailure(item.node, error);
          }
        }),
    );

    return {
      leaderNode: candidate,
      leaderStatus: leaderResponse.data,
      election: {
        status: "success",
        newLeader: candidate.id,
        term: newTerm,
      },
    };
  } catch (error) {
    markNodeFailure(candidate, error);

    return {
      leaderNode: null,
      leaderStatus: null,
      election: {
        status: "failed",
        reason: error.code || error.message,
      },
    };
  }
}

async function getOrElectLeader() {
  const currentLeader = await discoverCurrentLeader();

  if (currentLeader.leaderNode) {
    return {
      ...currentLeader,
      election: {
        status: "not-needed",
        leader: currentLeader.leaderNode.id,
      },
    };
  }

  return electNewLeader();
}

module.exports = {
  getRaftStatus,
  discoverCurrentLeader,
  electNewLeader,
  getOrElectLeader,
};
