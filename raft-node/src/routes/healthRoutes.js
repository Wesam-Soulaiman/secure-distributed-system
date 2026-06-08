const express = require("express");
const { NODE_ID } = require("../config");
const { raftState } = require("../state/raftState");

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({
    nodeId: NODE_ID,
    status: "healthy",
    role: raftState.role,
  });
});

module.exports = router;
