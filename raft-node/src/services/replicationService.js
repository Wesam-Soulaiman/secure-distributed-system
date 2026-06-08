const axios = require("axios");

const { NODE_ID, PEERS, REPLICATION_TIMEOUT_MS } = require("../config");

const { raftState } = require("../state/raftState");
const { getEntryByIndex, getLastLogIndex } = require("./stateMachineService");

function getPreviousLogInfoForEntry(entry) {
  const prevLogIndex = entry.index - 1;

  if (prevLogIndex === 0) {
    return {
      prevLogIndex: 0,
      prevLogTerm: 0,
    };
  }

  const previousEntry = getEntryByIndex(prevLogIndex);

  return {
    prevLogIndex,
    prevLogTerm: previousEntry ? previousEntry.term : 0,
  };
}

function getLastLogInfo() {
  const lastLogIndex = getLastLogIndex();

  if (lastLogIndex === 0) {
    return {
      prevLogIndex: 0,
      prevLogTerm: 0,
    };
  }

  const lastEntry = getEntryByIndex(lastLogIndex);

  return {
    prevLogIndex: lastLogIndex,
    prevLogTerm: lastEntry ? lastEntry.term : 0,
  };
}

async function sendAppendEntriesToPeer(peer, payload) {
  try {
    const response = await axios.post(
      `${peer.url}/raft/append-entries`,
      payload,
      {
        timeout: REPLICATION_TIMEOUT_MS,
      },
    );

    return {
      peer: peer.id,
      success: response.data.success === true,
      response: response.data,
    };
  } catch (error) {
    return {
      peer: peer.id,
      success: false,
      error: error.code || error.message,
    };
  }
}

async function replicateEntryToFollowers(entry) {
  const { prevLogIndex, prevLogTerm } = getPreviousLogInfoForEntry(entry);

  const payload = {
    term: raftState.currentTerm,
    leaderId: NODE_ID,
    prevLogIndex,
    prevLogTerm,
    entries: [entry],
    leaderCommit: raftState.commitIndex,
  };

  const results = await Promise.all(
    PEERS.map((peer) => sendAppendEntriesToPeer(peer, payload)),
  );

  return results;
}

async function replicateCommitIndexToFollowers() {
  const { prevLogIndex, prevLogTerm } = getLastLogInfo();

  const payload = {
    term: raftState.currentTerm,
    leaderId: NODE_ID,
    prevLogIndex,
    prevLogTerm,
    entries: [],
    leaderCommit: raftState.commitIndex,
  };

  const results = await Promise.all(
    PEERS.map((peer) => sendAppendEntriesToPeer(peer, payload)),
  );

  return results;
}

module.exports = {
  replicateEntryToFollowers,
  replicateCommitIndexToFollowers,
};
