const { NODE_ID, INITIAL_ROLE } = require("../config");

const raftState = {
  nodeId: NODE_ID,

  role: INITIAL_ROLE,

  currentTerm: 0,
  votedFor: null,

  leaderId: INITIAL_ROLE === "leader" ? NODE_ID : null,

  commitIndex: 0,
  lastApplied: 0,

  log: [],
  electionCount: 0,
  lastHeartbeatAt: null,
  lastElectionAt: null,
};

module.exports = {
  raftState,
};
