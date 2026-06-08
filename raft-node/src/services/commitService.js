const { PEERS } = require("../config");
const { raftState } = require("../state/raftState");

const {
  getEntryByIndex,
  getLastLogIndex,
  applyCommittedEntries,
} = require("./stateMachineService");

function majorityCount() {
  const clusterSize = PEERS.length + 1;
  return Math.floor(clusterSize / 2) + 1;
}

function replicationCountForIndex(index) {
  let replicatedCount = 1;

  PEERS.forEach((peer) => {
    const followerMatchIndex = raftState.matchIndex[peer.id] || 0;

    if (followerMatchIndex >= index) {
      replicatedCount += 1;
    }
  });

  return replicatedCount;
}

function advanceLeaderCommitIndex() {
  if (raftState.role !== "leader") {
    return {
      advanced: false,
      previousCommitIndex: raftState.commitIndex,
      commitIndex: raftState.commitIndex,
      reason: "node is not leader",
    };
  }

  const previousCommitIndex = raftState.commitIndex;
  const lastLogIndex = getLastLogIndex();
  const majority = majorityCount();

  for (
    let candidateIndex = lastLogIndex;
    candidateIndex > raftState.commitIndex;
    candidateIndex -= 1
  ) {
    const entry = getEntryByIndex(candidateIndex);

    if (!entry) {
      continue;
    }

    if (entry.term !== raftState.currentTerm) {
      continue;
    }

    const replicatedCount = replicationCountForIndex(candidateIndex);

    if (replicatedCount >= majority) {
      raftState.commitIndex = candidateIndex;

      applyCommittedEntries();

      return {
        advanced: true,
        previousCommitIndex,
        commitIndex: raftState.commitIndex,
        replicatedCount,
        majority,
        committedEntryTerm: entry.term,
      };
    }
  }

  return {
    advanced: false,
    previousCommitIndex,
    commitIndex: raftState.commitIndex,
    majority,
    reason: "no current-term entry is stored on a majority",
  };
}

module.exports = {
  majorityCount,
  replicationCountForIndex,
  advanceLeaderCommitIndex,
};
