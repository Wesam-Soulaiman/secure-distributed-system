const axios = require("axios");

const {
  NODE_ID,
  PEERS,
  REPLICATION_TIMEOUT_MS,
  ELECTION_TIMEOUT_MIN_MS,
  ELECTION_TIMEOUT_MAX_MS,
  HEARTBEAT_INTERVAL_MS,
} = require("../config");

const { raftState } = require("../state/raftState");

let electionTimer = null;
let heartbeatTimer = null;

function majorityCount() {
  const clusterSize = PEERS.length + 1;
  return Math.floor(clusterSize / 2) + 1;
}

function randomElectionTimeout() {
  const difference = ELECTION_TIMEOUT_MAX_MS - ELECTION_TIMEOUT_MIN_MS;

  return ELECTION_TIMEOUT_MIN_MS + Math.floor(Math.random() * (difference + 1));
}

function getLastLogInformation() {
  if (raftState.log.length === 0) {
    return {
      lastLogIndex: 0,
      lastLogTerm: 0,
    };
  }

  const lastEntry = raftState.log[raftState.log.length - 1];

  return {
    lastLogIndex: lastEntry.index,
    lastLogTerm: lastEntry.term,
  };
}

function stopElectionTimer() {
  if (electionTimer) {
    clearTimeout(electionTimer);
    electionTimer = null;
  }
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function becomeFollower(term, leaderId = null) {
  stopHeartbeat();

  if (term > raftState.currentTerm) {
    raftState.currentTerm = term;
    raftState.votedFor = null;
  }

  raftState.role = "follower";
  raftState.leaderId = leaderId;

  resetElectionTimer();
}

function becomeCandidate() {
  stopHeartbeat();

  raftState.role = "candidate";
  raftState.currentTerm += 1;
  raftState.votedFor = NODE_ID;
  raftState.leaderId = null;
  raftState.electionCount += 1;
  raftState.lastElectionAt = new Date().toISOString();
}

function becomeLeader() {
  stopElectionTimer();

  raftState.role = "leader";
  raftState.leaderId = NODE_ID;
  raftState.votedFor = NODE_ID;

  startHeartbeat();
}

function isCandidateLogUpToDate(candidateLastLogIndex, candidateLastLogTerm) {
  const { lastLogIndex: localLastLogIndex, lastLogTerm: localLastLogTerm } =
    getLastLogInformation();

  if (candidateLastLogTerm > localLastLogTerm) {
    return true;
  }

  if (candidateLastLogTerm < localLastLogTerm) {
    return false;
  }

  return candidateLastLogIndex >= localLastLogIndex;
}

function resetElectionTimer() {
  stopElectionTimer();

  if (raftState.role === "leader") {
    return;
  }

  const timeout = randomElectionTimeout();

  electionTimer = setTimeout(() => {
    startElection().catch((error) => {
      console.error(`[${NODE_ID}] Election failed:`, error.message);

      resetElectionTimer();
    });
  }, timeout);
}

async function requestVoteFromPeer(peer, electionTerm) {
  const { lastLogIndex, lastLogTerm } = getLastLogInformation();

  try {
    const response = await axios.post(
      `${peer.url}/raft/request-vote`,
      {
        term: electionTerm,
        candidateId: NODE_ID,
        lastLogIndex,
        lastLogTerm,
      },
      {
        timeout: REPLICATION_TIMEOUT_MS,
      },
    );

    return {
      peerId: peer.id,
      success: true,
      data: response.data,
    };
  } catch (error) {
    return {
      peerId: peer.id,
      success: false,
      error: error.code || error.message,
    };
  }
}

async function startElection() {
  becomeCandidate();

  const electionTerm = raftState.currentTerm;
  let votesReceived = 1;

  console.log(`[${NODE_ID}] Starting election for term ${electionTerm}`);

  const voteResults = await Promise.all(
    PEERS.map((peer) => requestVoteFromPeer(peer, electionTerm)),
  );

  if (
    raftState.role !== "candidate" ||
    raftState.currentTerm !== electionTerm
  ) {
    return;
  }

  for (const result of voteResults) {
    if (!result.success) {
      continue;
    }

    const responseTerm = result.data.term || 0;

    if (responseTerm > raftState.currentTerm) {
      becomeFollower(responseTerm);
      return;
    }

    if (result.data.voteGranted === true) {
      votesReceived += 1;
    }
  }

  const majority = majorityCount();

  if (votesReceived >= majority) {
    console.log(
      `[${NODE_ID}] Won election for term ${electionTerm} with ${votesReceived} votes`,
    );

    becomeLeader();
    return;
  }

  console.log(
    `[${NODE_ID}] Election lost for term ${electionTerm}. Votes: ${votesReceived}/${majority}`,
  );

  resetElectionTimer();
}

function handleRequestVote({
  term,
  candidateId,
  lastLogIndex = 0,
  lastLogTerm = 0,
}) {
  if (!term || !candidateId) {
    return {
      statusCode: 400,
      data: {
        error: "term and candidateId are required",
      },
    };
  }

  if (term < raftState.currentTerm) {
    return {
      statusCode: 200,
      data: {
        term: raftState.currentTerm,
        voteGranted: false,
        nodeId: NODE_ID,
        reason: "candidate term is stale",
      },
    };
  }

  if (term > raftState.currentTerm) {
    becomeFollower(term);
  }

  const canVote =
    raftState.votedFor === null || raftState.votedFor === candidateId;

  const candidateLogIsUpToDate = isCandidateLogUpToDate(
    lastLogIndex,
    lastLogTerm,
  );

  const voteGranted = canVote && candidateLogIsUpToDate;

  if (voteGranted) {
    raftState.votedFor = candidateId;
    raftState.leaderId = null;

    resetElectionTimer();
  }

  return {
    statusCode: 200,
    data: {
      term: raftState.currentTerm,
      voteGranted,
      nodeId: NODE_ID,
      votedFor: raftState.votedFor,
      reason: voteGranted
        ? "vote granted"
        : canVote
          ? "candidate log is older"
          : "node already voted in this term",
    },
  };
}

async function sendHeartbeatToPeer(peer) {
  try {
    const response = await axios.post(
      `${peer.url}/raft/append-entries`,
      {
        term: raftState.currentTerm,
        leaderId: NODE_ID,
        entries: [],

        leaderCommit: raftState.commitIndex,
      },
      {
        timeout: REPLICATION_TIMEOUT_MS,
      },
    );

    return {
      peerId: peer.id,
      success: true,
      data: response.data,
    };
  } catch (error) {
    return {
      peerId: peer.id,
      success: false,
      error: error.code || error.message,
    };
  }
}

async function sendHeartbeats() {
  if (raftState.role !== "leader") {
    return;
  }

  const heartbeatTerm = raftState.currentTerm;

  const results = await Promise.all(
    PEERS.map((peer) => sendHeartbeatToPeer(peer)),
  );

  for (const result of results) {
    if (!result.success) {
      continue;
    }

    const responseTerm = result.data.term || 0;

    if (responseTerm > heartbeatTerm) {
      becomeFollower(responseTerm);
      return;
    }
  }
}

function startHeartbeat() {
  stopHeartbeat();

  if (raftState.role !== "leader") {
    return;
  }

  sendHeartbeats().catch((error) => {
    console.error(`[${NODE_ID}] Initial heartbeat failed:`, error.message);
  });

  heartbeatTimer = setInterval(() => {
    sendHeartbeats().catch((error) => {
      console.error(`[${NODE_ID}] Heartbeat failed:`, error.message);
    });
  }, HEARTBEAT_INTERVAL_MS);
}

function handleAppendEntries({
  term,
  leaderId,
  entries = [],
  leaderCommit = 0,
}) {
  if (!term || !leaderId) {
    return {
      statusCode: 400,
      data: {
        error: "term and leaderId are required",
      },
    };
  }

  if (term < raftState.currentTerm) {
    return {
      statusCode: 200,
      data: {
        term: raftState.currentTerm,
        success: false,
        nodeId: NODE_ID,
        reason: "leader term is stale",
      },
    };
  }

  becomeFollower(term, leaderId);

  raftState.lastHeartbeatAt = new Date().toISOString();

  if (entries.length > 0) {
    console.log(
      `[${NODE_ID}] Received ${entries.length} entries through append-entries`,
    );
  }

  raftState.commitIndex = Math.max(raftState.commitIndex, leaderCommit);

  return {
    statusCode: 200,
    data: {
      term: raftState.currentTerm,
      success: true,
      nodeId: NODE_ID,
      role: raftState.role,
      leaderId: raftState.leaderId,
      commitIndex: raftState.commitIndex,
    },
  };
}

function startConsensus() {
  if (raftState.role === "leader") {
    startHeartbeat();
  } else {
    resetElectionTimer();
  }
}

function stopConsensus() {
  stopElectionTimer();
  stopHeartbeat();
}

module.exports = {
  majorityCount,
  randomElectionTimeout,
  getLastLogInformation,

  startConsensus,
  stopConsensus,

  resetElectionTimer,
  startElection,

  becomeFollower,
  becomeCandidate,
  becomeLeader,

  handleRequestVote,
  handleAppendEntries,

  startHeartbeat,
  stopHeartbeat,
};
