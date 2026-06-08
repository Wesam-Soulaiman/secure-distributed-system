const { raftState } = require("../state/raftState");
const { applyEntryToStore } = require("./storeService");

function getLastLogIndex() {
  if (raftState.log.length === 0) {
    return 0;
  }

  return raftState.log[raftState.log.length - 1].index;
}

function getEntryByIndex(index) {
  return raftState.log.find((entry) => entry.index === index) || null;
}

function applyCommittedEntries() {
  while (raftState.lastApplied < raftState.commitIndex) {
    const nextIndex = raftState.lastApplied + 1;
    const entry = getEntryByIndex(nextIndex);

    if (!entry) {
      break;
    }

    entry.status = "committed";
    applyEntryToStore(entry);

    raftState.lastApplied = nextIndex;
  }
}

function advanceCommitIndex(newCommitIndex) {
  const lastLogIndex = getLastLogIndex();

  raftState.commitIndex = Math.min(newCommitIndex, lastLogIndex);

  applyCommittedEntries();
}

module.exports = {
  getLastLogIndex,
  getEntryByIndex,
  applyCommittedEntries,
  advanceCommitIndex,
};
