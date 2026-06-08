const axios = require("axios");

const { NODE_ID, PEERS, REPLICATION_TIMEOUT_MS } = require("../config");

const { raftState } = require("../state/raftState");

async function replicateEntryToFollowers(entry) {
  const results = await Promise.all(
    PEERS.map(async (peer) => {
      try {
        const response = await axios.post(
          `${peer.url}/raft/append-entry`,
          {
            leaderId: NODE_ID,
            term: raftState.currentTerm,
            entry,
            leaderCommit: raftState.commitIndex,
          },
          {
            timeout: REPLICATION_TIMEOUT_MS,
          },
        );

        return {
          peer: peer.id,
          success: true,
          response: response.data,
        };
      } catch (error) {
        return {
          peer: peer.id,
          success: false,
          error: error.code || error.message,
        };
      }
    }),
  );

  return results;
}

module.exports = {
  replicateEntryToFollowers,
};
