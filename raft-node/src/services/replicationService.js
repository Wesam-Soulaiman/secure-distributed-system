const axios = require("axios");

const { NODE_ID, PEERS, REPLICATION_TIMEOUT_MS } = require("../config");

const { raftState } = require("../state/raftState");

const { getEntryByIndex, getLastLogIndex } = require("./stateMachineService");

function initializeLeaderReplicationState() {
  const nextLogIndex = getLastLogIndex() + 1;

  raftState.nextIndex = {};
  raftState.matchIndex = {};

  PEERS.forEach((peer) => {
    raftState.nextIndex[peer.id] = nextLogIndex;
    raftState.matchIndex[peer.id] = 0;
  });
}

function getPeerNextIndex(peerId) {
  const defaultNextIndex = getLastLogIndex() + 1;

  return raftState.nextIndex[peerId] || defaultNextIndex;
}

function createAppendEntriesPayload(peerId) {
  const nextIndex = getPeerNextIndex(peerId);
  const prevLogIndex = Math.max(0, nextIndex - 1);

  const previousEntry = prevLogIndex > 0 ? getEntryByIndex(prevLogIndex) : null;

  const entries = raftState.log.filter((entry) => entry.index >= nextIndex);

  return {
    term: raftState.currentTerm,
    leaderId: NODE_ID,
    prevLogIndex,
    prevLogTerm: previousEntry ? previousEntry.term : 0,
    entries,
    leaderCommit: raftState.commitIndex,
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
      networkSuccess: true,
      response: response.data,
    };
  } catch (error) {
    return {
      peer: peer.id,
      networkSuccess: false,
      success: false,
      error: error.code || error.message,
    };
  }
}

function reduceNextIndex(peerId, response) {
  const currentNextIndex = getPeerNextIndex(peerId);

  const suggestedIndex = Number(response?.conflictIndex);

  if (
    Number.isInteger(suggestedIndex) &&
    suggestedIndex >= 1 &&
    suggestedIndex < currentNextIndex
  ) {
    raftState.nextIndex[peerId] = suggestedIndex;
    return;
  }

  raftState.nextIndex[peerId] = Math.max(1, currentNextIndex - 1);
}

async function replicateToPeer(peer) {
  const maximumAttempts = getLastLogIndex() + 2;
  let attempts = 0;

  while (raftState.role === "leader" && attempts < maximumAttempts) {
    attempts += 1;

    const payload = createAppendEntriesPayload(peer.id);

    const result = await sendAppendEntriesToPeer(peer, payload);

    if (!result.networkSuccess) {
      return {
        peer: peer.id,
        success: false,
        error: result.error,
        attempts,
      };
    }

    const responseTerm = result.response?.term || 0;

    if (responseTerm > raftState.currentTerm) {
      return {
        peer: peer.id,
        success: false,
        higherTerm: responseTerm,
        error: "Follower has a higher term",
        attempts,
      };
    }

    if (result.response?.success === true) {
      const lastSentIndex =
        payload.entries.length > 0
          ? payload.entries[payload.entries.length - 1].index
          : payload.prevLogIndex;

      const matchedIndex = result.response.matchIndex ?? lastSentIndex;

      raftState.matchIndex[peer.id] = matchedIndex;
      raftState.nextIndex[peer.id] = matchedIndex + 1;

      return {
        peer: peer.id,
        success: true,
        matchIndex: matchedIndex,
        nextIndex: raftState.nextIndex[peer.id],
        attempts,
      };
    }

    reduceNextIndex(peer.id, result.response);
  }

  return {
    peer: peer.id,
    success: false,
    error: "Maximum replication attempts reached",
    attempts,
    nextIndex: getPeerNextIndex(peer.id),
  };
}

async function replicateLogToFollowers() {
  return Promise.all(PEERS.map((peer) => replicateToPeer(peer)));
}

module.exports = {
  initializeLeaderReplicationState,
  createAppendEntriesPayload,
  replicateToPeer,
  replicateLogToFollowers,
};
