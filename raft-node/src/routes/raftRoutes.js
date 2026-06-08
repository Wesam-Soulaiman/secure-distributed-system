const express = require("express");
const { NODE_ID } = require("../config");
const { raftState } = require("../state/raftState");
const { store } = require("../state/store");
const { getStoreKeys } = require("../services/storeService");

const {
  appendEntryFromLeader,
  becomeLeader,
  becomeFollower,
} = require("../services/raftService");

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
    commitIndex: raftState.commitIndex,
    log: raftState.log,
    store,
  });
});

router.post("/raft/append-entry", (req, res) => {
  const result = appendEntryFromLeader(req.body);
  res.status(result.statusCode).json(result.data);
});

router.post("/raft/become-leader", (req, res) => {
  const { term } = req.body;
  const result = becomeLeader(term);
  res.json(result);
});

router.post("/raft/become-follower", (req, res) => {
  const result = becomeFollower(req.body);
  res.json(result);
});

module.exports = router;
