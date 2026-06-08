const { NODE_ID, PEERS } = require("../config");
const { raftState } = require("../state/raftState");

const { replicateLogToFollowers } = require("./replicationService");

const { applyCommittedEntries } = require("./stateMachineService");

const { becomeFollower } = require("./consensusService");

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

function findHigherTerm(replicationResults) {
  return replicationResults.reduce(
    (highestTerm, result) => Math.max(highestTerm, result.higherTerm || 0),
    0,
  );
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

  const replicationResults = await replicateLogToFollowers();

  const higherTerm = findHigherTerm(replicationResults);

  if (higherTerm > raftState.currentTerm) {
    becomeFollower(higherTerm);

    return {
      statusCode: 409,
      data: {
        error: "leadership lost during replication",
        nodeId: NODE_ID,
        currentTerm: raftState.currentTerm,
      },
    };
  }

  const successfulFollowers = replicationResults.filter(
    (result) => result.success && result.matchIndex >= entry.index,
  );

  const acknowledgements = 1 + successfulFollowers.length;

  const majority = majorityCount();

  if (acknowledgements >= majority) {
    entry.status = "committed";
    raftState.commitIndex = entry.index;

    applyCommittedEntries();

    replicateLogToFollowers().catch((error) => {
      console.error(
        `[${NODE_ID}] Failed to propagate commit index:`,
        error.message,
      );
    });

    return {
      statusCode: 200,
      data: {
        status: "committed",
        leader: NODE_ID,
        term: raftState.currentTerm,
        operation,
        key,
        value,
        acks: acknowledgements,
        majority,
        replicatedTo: successfulFollowers.map((result) => result.peer),
        failedReplicas: replicationResults
          .filter((result) => !result.success)
          .map((result) => ({
            peer: result.peer,
            error: result.error,
          })),
        commitIndex: raftState.commitIndex,
        lastApplied: raftState.lastApplied,
        nextIndex: raftState.nextIndex,
        matchIndex: raftState.matchIndex,
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
      acks: acknowledgements,
      majority,
      replicatedTo: successfulFollowers.map((result) => result.peer),
      failedReplicas: replicationResults
        .filter((result) => !result.success)
        .map((result) => ({
          peer: result.peer,
          error: result.error,
        })),
      commitIndex: raftState.commitIndex,
      lastApplied: raftState.lastApplied,
      nextIndex: raftState.nextIndex,
      matchIndex: raftState.matchIndex,
      entry,
    },
  };
}

module.exports = {
  majorityCount,
  createLogEntry,
  handleLeaderWrite,
};
