const express = require("express");
const { NODE_ID } = require("../config");
const { raftState } = require("../state/raftState");
const { store } = require("../state/store");
const { getStoreKeys } = require("../services/storeService");

const router = express.Router();

router.get("/node/status", (req, res) => {
  res.json({
    nodeId: NODE_ID,
    status: "running",
    storeKeys: getStoreKeys(),
    store,
    raft: raftState,
  });
});

module.exports = router;
