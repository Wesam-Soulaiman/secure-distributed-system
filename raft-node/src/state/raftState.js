const { NODE_ID, INITIAL_ROLE } = require("../config");

const raftState = {
  nodeId: NODE_ID,

  // follower | candidate | leader
  role: INITIAL_ROLE,

  currentTerm: 0,
  votedFor: null,
  leaderId: null,

  commitIndex: 0,
  lastApplied: 0,

  log: [],

  electionCount: 0,
  lastHeartbeatAt: null,
  lastElectionAt: null,

  nextIndex: {},
  matchIndex: {},
};

module.exports = {
  raftState,
};
