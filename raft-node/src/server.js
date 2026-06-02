const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const app = express();

const PORT = process.env.PORT || 8000;
const NODE_ID = process.env.NODE_ID || "node-unknown";
const INITIAL_ROLE = process.env.INITIAL_ROLE || "follower";

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

const raftState = {
  nodeId: NODE_ID,
  role: INITIAL_ROLE,
  currentTerm: 1,
  votedFor: null,
  leaderId: INITIAL_ROLE === "leader" ? NODE_ID : "node-a",
  commitIndex: 0,
  log: [],
};

const store = {};

app.get("/health", (req, res) => {
  res.json({
    nodeId: NODE_ID,
    status: "healthy",
    role: raftState.role,
  });
});

app.get("/api/ping", (req, res) => {
  res.json({
    message: "pong",
    servedBy: NODE_ID,
    role: raftState.role,
  });
});

app.get("/node/status", (req, res) => {
  res.json({
    nodeId: NODE_ID,
    status: "running",
    storeKeys: Object.keys(store),
    raft: raftState,
  });
});

app.get("/raft/status", (req, res) => {
  res.json(raftState);
});

app.get("/api/get/:key", (req, res) => {
  const { key } = req.params;

  res.json({
    key,
    value: store[key] ?? null,
    servedBy: NODE_ID,
  });
});

app.post("/api/set", (req, res) => {
  const { key, value } = req.body;

  if (!key) {
    return res.status(400).json({
      error: "key is required",
    });
  }

  store[key] = value;

  raftState.log.push({
    index: raftState.log.length + 1,
    operation: "SET",
    key,
    value,
    status: "local-only",
  });

  raftState.commitIndex = raftState.log.length;

  res.json({
    status: "stored",
    key,
    value,
    servedBy: NODE_ID,
    note: "Raft replication will be added in a later phase",
  });
});

app.delete("/api/delete/:key", (req, res) => {
  const { key } = req.params;

  delete store[key];

  raftState.log.push({
    index: raftState.log.length + 1,
    operation: "DELETE",
    key,
    status: "local-only",
  });

  raftState.commitIndex = raftState.log.length;

  res.json({
    status: "deleted",
    key,
    servedBy: NODE_ID,
    note: "Raft replication will be added in a later phase",
  });
});

app.listen(PORT, () => {
  console.log(`${NODE_ID} is running on port ${PORT} as ${INITIAL_ROLE}`);
});
