const { NODE_ID } = require("../config");
const { raftState } = require("../state/raftState");

const { replicateLogToFollowers } = require("./replicationService");

const { majorityCount, advanceLeaderCommitIndex } = require("./commitService");

const { becomeFollower } = require("./consensusService");

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

function formatFailedReplicas(replicationResults, requiredEntryIndex) {
  return replicationResults
    .filter(
      (result) =>
        !result.success || (result.matchIndex || 0) < requiredEntryIndex,
    )
    .map((result) => ({
      peer: result.peer,
      error:
        result.error ||
        `Follower did not replicate entry ${requiredEntryIndex}`,
      matchIndex: result.matchIndex || 0,
    }));
}

function propagateCommitIndexInBackground() {
  replicateLogToFollowers().catch((error) => {
    console.error(
      `[${NODE_ID}] Failed to propagate commit index:`,
      error.message,
    );
  });
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

  const commitResult = advanceLeaderCommitIndex();

  const entryCommitted = raftState.commitIndex >= entry.index;

  /*
   * قد يقوم Heartbeat متزامن بتحديث commitIndex قبل أن تصل
   * هذه الدالة إلى هنا. عندها تكون العملية committed فعلاً،
   * حتى لو أعادت advanceLeaderCommitIndex قيمة advanced=false.
   */
  const normalizedCommitResult =
    entryCommitted && !commitResult.advanced
      ? {
          ...commitResult,
          entryAlreadyCommitted: true,
          reason:
            "entry was committed by a concurrent heartbeat or replication cycle",
        }
      : commitResult;

  const replicatedFollowers = replicationResults.filter(
    (result) => result.success && (result.matchIndex || 0) >= entry.index,
  );

  const acknowledgements = 1 + replicatedFollowers.length;

  const majority = majorityCount();

  if (entryCommitted) {
    propagateCommitIndexInBackground();

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

        replicatedTo: replicatedFollowers.map((result) => result.peer),

        failedReplicas: formatFailedReplicas(replicationResults, entry.index),

        commitIndex: raftState.commitIndex,
        lastApplied: raftState.lastApplied,

        commitRule: {
          strategy: "majority-match-index",
          currentTermOnly: true,
          result: normalizedCommitResult,
        },

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
      error: "entry is not replicated on a majority in the current term",

      leader: NODE_ID,
      term: raftState.currentTerm,
      operation,
      key,
      value,

      acks: acknowledgements,
      majority,

      replicatedTo: replicatedFollowers.map((result) => result.peer),

      failedReplicas: formatFailedReplicas(replicationResults, entry.index),

      commitIndex: raftState.commitIndex,
      lastApplied: raftState.lastApplied,

      commitRule: {
        strategy: "majority-match-index",
        currentTermOnly: true,
        result: commitResult,
      },

      nextIndex: raftState.nextIndex,
      matchIndex: raftState.matchIndex,

      entry,
    },
  };
}

module.exports = {
  createLogEntry,
  handleLeaderWrite,
};
