const { NODE_ID, INITIAL_ROLE } = require("../config");

const raftState = {
  nodeId: NODE_ID,
  role: INITIAL_ROLE,
  currentTerm: 1,
  votedFor: null,
  leaderId: INITIAL_ROLE === "leader" ? NODE_ID : "node-a",
  commitIndex: 0,
  log: [],
};

module.exports = {
  raftState,
};
