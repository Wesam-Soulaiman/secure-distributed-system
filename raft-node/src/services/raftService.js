const { NODE_ID, PEERS } = require("../config");
const { raftState } = require("../state/raftState");

const {
  replicateEntryToFollowers,
  replicateCommitIndexToFollowers,
} = require("./replicationService");

const { applyCommittedEntries } = require("./stateMachineService");

function majorityCount() {
  const clusterSize = PEERS.length + 1;
  return Math.floor(clusterSize / 2) + 1;
}

function createLogEntry(operation, key, value = null) {
  return {
    index: raftState.log.length + 1,
    term: raftState.currentTerm,
    operation,
    key,
    value,
    status: "pending",
    createdBy: NODE_ID,
    timestamp: new Date().toISOString(),
  };
}

async function handleLeaderWrite(operation, key, value = null) {
  if (raftState.role !== "leader") {
    return {
      statusCode: 409,
      data: {
        error: "not leader",
        nodeId: NODE_ID,
        currentLeader: raftState.leaderId,
      },
    };
  }

  const entry = createLogEntry(operation, key, value);

  raftState.log.push(entry);

  const replicationResults = await replicateEntryToFollowers(entry);

  const successfulFollowers = replicationResults.filter((item) => item.success);
  const acks = 1 + successfulFollowers.length;
  const majority = majorityCount();

  if (acks >= majority) {
    entry.status = "committed";
    raftState.commitIndex = entry.index;

    applyCommittedEntries();

    await replicateCommitIndexToFollowers();

    return {
      statusCode: 200,
      data: {
        status: "committed",
        leader: NODE_ID,
        term: raftState.currentTerm,
        operation,
        key,
        value,
        acks,
        majority,
        replicatedTo: successfulFollowers.map((item) => item.peer),
        failedReplicas: replicationResults
          .filter((item) => !item.success)
          .map((item) => ({
            peer: item.peer,
            error:
              item.error || item.response?.reason || "append entries rejected",
          })),
        commitIndex: raftState.commitIndex,
        lastApplied: raftState.lastApplied,
        entry,
      },
    };
  }

  entry.status = "uncommitted";

  return {
    statusCode: 503,
    data: {
      status: "uncommitted",
      error: "majority was not reached",
      leader: NODE_ID,
      term: raftState.currentTerm,
      operation,
      key,
      value,
      acks,
      majority,
      replicatedTo: successfulFollowers.map((item) => item.peer),
      failedReplicas: replicationResults
        .filter((item) => !item.success)
        .map((item) => ({
          peer: item.peer,
          error:
            item.error || item.response?.reason || "append entries rejected",
        })),
      commitIndex: raftState.commitIndex,
      lastApplied: raftState.lastApplied,
      entry,
    },
  };
}

module.exports = {
  majorityCount,
  createLogEntry,
  handleLeaderWrite,
};
