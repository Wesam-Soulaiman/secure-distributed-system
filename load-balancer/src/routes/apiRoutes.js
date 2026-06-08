const express = require("express");

const {
  proxyGetToSelectedNode,
  proxyGetByConsistentHash,
  proxyPostToLeader,
  proxyDeleteToLeader,
} = require("../services/proxyService");

const router = express.Router();

router.get("/api/ping", async (req, res) => {
  const result = await proxyGetToSelectedNode("/api/ping");
  res.status(result.statusCode).json(result.data);
});

router.get("/api/get/:key", async (req, res) => {
  const result = await proxyGetByConsistentHash(req.params.key);
  res.status(result.statusCode).json(result.data);
});

router.post("/api/set", async (req, res) => {
  const result = await proxyPostToLeader("/api/set", req.body);
  res.status(result.statusCode).json(result.data);
});

router.delete("/api/delete/:key", async (req, res) => {
  const result = await proxyDeleteToLeader(`/api/delete/${req.params.key}`);
  res.status(result.statusCode).json(result.data);
});

module.exports = router;
