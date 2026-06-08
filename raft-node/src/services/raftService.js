const { NODE_ID, PEERS } = require("../config");
const { raftState } = require("../state/raftState");
const { applyEntryToStore } = require("./storeService");
const { replicateEntryToFollowers } = require("./replicationService");

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
    applyEntryToStore(entry);

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
            error: item.error,
          })),
        commitIndex: raftState.commitIndex,
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
          error: item.error,
        })),
      commitIndex: raftState.commitIndex,
      entry,
    },
  };
}

function appendEntryFromLeader({ leaderId, term, entry, leaderCommit }) {
  if (!leaderId || !entry) {
    return {
      statusCode: 400,
      data: {
        error: "leaderId and entry are required",
      },
    };
  }

  if (term < raftState.currentTerm) {
    return {
      statusCode: 409,
      data: {
        error: "stale term",
        nodeId: NODE_ID,
        currentTerm: raftState.currentTerm,
      },
    };
  }

  raftState.currentTerm = term;
  raftState.leaderId = leaderId;

  const alreadyExists = raftState.log.some(
    (existingEntry) =>
      existingEntry.index === entry.index &&
      existingEntry.term === entry.term &&
      existingEntry.key === entry.key &&
      existingEntry.operation === entry.operation,
  );

  if (!alreadyExists) {
    const followerEntry = {
      ...entry,
      status: "committed",
      replicatedBy: leaderId,
      receivedAt: new Date().toISOString(),
    };

    raftState.log.push(followerEntry);
    applyEntryToStore(followerEntry);
  }

  raftState.commitIndex = Math.max(
    raftState.commitIndex,
    leaderCommit,
    entry.index,
  );

  return {
    statusCode: 200,
    data: {
      status: "appended",
      nodeId: NODE_ID,
      leaderId,
      term: raftState.currentTerm,
      commitIndex: raftState.commitIndex,
      receivedEntryIndex: entry.index,
    },
  };
}

module.exports = {
  majorityCount,
  createLogEntry,
  handleLeaderWrite,
  appendEntryFromLeader,
};
