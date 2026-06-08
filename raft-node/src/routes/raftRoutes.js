const express = require("express");

const { NODE_ID } = require("../config");
const { raftState } = require("../state/raftState");
const { store } = require("../state/store");
const { getStoreKeys } = require("../services/storeService");

const {
  appendEntryFromLeader,
  becomeLeader: legacyBecomeLeader,
  becomeFollower: legacyBecomeFollower,
} = require("../services/raftService");

const {
  handleRequestVote,
  handleAppendEntries,
  resetElectionTimer,
} = require("../services/consensusService");

const router = express.Router();

router.get("/raft/status", (req, res) => {
  res.json({
    ...raftState,
    logLength: raftState.log.length,
    storeKeys: getStoreKeys(),
  });
});

router.get("/raft/log", (req, res) => {
  res.json({
    nodeId: NODE_ID,
    role: raftState.role,
    currentTerm: raftState.currentTerm,
    leaderId: raftState.leaderId,
    commitIndex: raftState.commitIndex,
    lastApplied: raftState.lastApplied,
    log: raftState.log,
    store,
  });
});

router.post("/raft/request-vote", (req, res) => {
  const result = handleRequestVote(req.body);
  res.status(result.statusCode).json(result.data);
});

router.post("/raft/append-entries", (req, res) => {
  const result = handleAppendEntries(req.body);
  res.status(result.statusCode).json(result.data);
});

router.post("/raft/append-entry", (req, res) => {
  const result = appendEntryFromLeader(req.body);

  if (result.statusCode === 200) {
    resetElectionTimer();
  }

  res.status(result.statusCode).json(result.data);
});

router.post("/raft/become-leader", (req, res) => {
  const { term } = req.body;
  const result = legacyBecomeLeader(term);
  res.json(result);
});

router.post("/raft/become-follower", (req, res) => {
  const result = legacyBecomeFollower(req.body);
  resetElectionTimer();
  res.json(result);
});

module.exports = router;
