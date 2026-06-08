const express = require("express");
const { NODE_ID } = require("../config");
const { raftState } = require("../state/raftState");
const { getValue } = require("../services/storeService");
const { handleLeaderWrite } = require("../services/raftService");

const router = express.Router();

router.get("/api/ping", (req, res) => {
  res.json({
    message: "pong",
    servedBy: NODE_ID,
    role: raftState.role,
  });
});

router.get("/api/get/:key", (req, res) => {
  const { key } = req.params;

  res.json({
    key,
    value: getValue(key),
    servedBy: NODE_ID,
  });
});

router.post("/api/set", async (req, res) => {
  const { key, value } = req.body;

  if (!key) {
    return res.status(400).json({
      error: "key is required",
    });
  }

  const result = await handleLeaderWrite("SET", key, value);
  res.status(result.statusCode).json(result.data);
});

router.delete("/api/delete/:key", async (req, res) => {
  const { key } = req.params;

  const result = await handleLeaderWrite("DELETE", key);
  res.status(result.statusCode).json(result.data);
});

module.exports = router;
