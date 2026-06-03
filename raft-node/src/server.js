const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const axios = require("axios");

const app = express();

const PORT = process.env.PORT || 8000;
const NODE_ID = process.env.NODE_ID || "node-unknown";
const INITIAL_ROLE = process.env.INITIAL_ROLE || "follower";

const PEERS = [
  { id: "node-a", url: "http://node-a:8000" },
  { id: "node-b", url: "http://node-b:8000" },
  { id: "node-c", url: "http://node-c:8000" },
].filter((peer) => peer.id !== NODE_ID);

const REPLICATION_TIMEOUT_MS = 2000;

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

function majorityCount() {
  const clusterSize = PEERS.length + 1;
  return Math.floor(clusterSize / 2) + 1;
}

function applyEntryToStore(entry) {
  if (entry.operation === "SET") {
    store[entry.key] = entry.value;
  }

  if (entry.operation === "DELETE") {
    delete store[entry.key];
  }
}

function createLogEntry(operation, key, value = null) {
  return {
    index: raftState.log.length + 1,
    term: raftState.currentTerm,
    operation,
    key,
    value,
    status: "pending",
    createdBy: NODE_ID,
    timestamp: new Date().toISOString(),
  };
}

async function replicateEntryToFollowers(entry) {
  const results = await Promise.all(
    PEERS.map(async (peer) => {
      try {
        const response = await axios.post(
          `${peer.url}/raft/append-entry`,
          {
            leaderId: NODE_ID,
            term: raftState.currentTerm,
            entry,
            leaderCommit: raftState.commitIndex,
          },
          {
            timeout: REPLICATION_TIMEOUT_MS,
          },
        );

        return {
          peer: peer.id,
          success: true,
          response: response.data,
        };
      } catch (error) {
        return {
          peer: peer.id,
          success: false,
          error: error.code || error.message,
        };
      }
    }),
  );

  return results;
}

async function handleLeaderWrite(operation, key, value = null) {
  if (raftState.role !== "leader") {
    return {
      statusCode: 409,
      data: {
        error: "not leader",
        nodeId: NODE_ID,
        currentLeader: raftState.leaderId,
      },
    };
  }

  const entry = createLogEntry(operation, key, value);

  raftState.log.push(entry);

  const replicationResults = await replicateEntryToFollowers(entry);

  const successfulFollowers = replicationResults.filter((item) => item.success);
  const acks = 1 + successfulFollowers.length;
  const majority = majorityCount();

  if (acks >= majority) {
    entry.status = "committed";
    raftState.commitIndex = entry.index;
    applyEntryToStore(entry);

    return {
      statusCode: 200,
      data: {
        status: "committed",
        leader: NODE_ID,
        term: raftState.currentTerm,
        operation,
        key,
        value,
        acks,
        majority,
        replicatedTo: successfulFollowers.map((item) => item.peer),
        failedReplicas: replicationResults
          .filter((item) => !item.success)
          .map((item) => ({
            peer: item.peer,
            error: item.error,
          })),
        commitIndex: raftState.commitIndex,
        entry,
      },
    };
  }

  entry.status = "uncommitted";

  return {
    statusCode: 503,
    data: {
      status: "uncommitted",
      error: "majority was not reached",
      leader: NODE_ID,
      term: raftState.currentTerm,
      operation,
      key,
      value,
      acks,
      majority,
      replicatedTo: successfulFollowers.map((item) => item.peer),
      failedReplicas: replicationResults
        .filter((item) => !item.success)
        .map((item) => ({
          peer: item.peer,
          error: item.error,
        })),
      commitIndex: raftState.commitIndex,
      entry,
    },
  };
}

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
    store,
    raft: raftState,
  });
});

app.get("/raft/status", (req, res) => {
  res.json({
    ...raftState,
    logLength: raftState.log.length,
    storeKeys: Object.keys(store),
  });
});

app.get("/raft/log", (req, res) => {
  res.json({
    nodeId: NODE_ID,
    role: raftState.role,
    commitIndex: raftState.commitIndex,
    log: raftState.log,
    store,
  });
});

app.post("/raft/append-entry", (req, res) => {
  const { leaderId, term, entry, leaderCommit } = req.body;

  if (!leaderId || !entry) {
    return res.status(400).json({
      error: "leaderId and entry are required",
    });
  }

  if (term < raftState.currentTerm) {
    return res.status(409).json({
      error: "stale term",
      nodeId: NODE_ID,
      currentTerm: raftState.currentTerm,
    });
  }

  raftState.currentTerm = term;
  raftState.leaderId = leaderId;

  const alreadyExists = raftState.log.some(
    (existingEntry) =>
      existingEntry.index === entry.index &&
      existingEntry.term === entry.term &&
      existingEntry.key === entry.key &&
      existingEntry.operation === entry.operation,
  );

  if (!alreadyExists) {
    const followerEntry = {
      ...entry,
      status: "committed",
      replicatedBy: leaderId,
      receivedAt: new Date().toISOString(),
    };

    raftState.log.push(followerEntry);
    applyEntryToStore(followerEntry);
  }

  raftState.commitIndex = Math.max(
    raftState.commitIndex,
    leaderCommit,
    entry.index,
  );

  res.json({
    status: "appended",
    nodeId: NODE_ID,
    leaderId,
    term: raftState.currentTerm,
    commitIndex: raftState.commitIndex,
    receivedEntryIndex: entry.index,
  });
});

app.get("/api/get/:key", (req, res) => {
  const { key } = req.params;

  res.json({
    key,
    value: store[key] ?? null,
    servedBy: NODE_ID,
  });
});

app.post("/api/set", async (req, res) => {
  const { key, value } = req.body;

  if (!key) {
    return res.status(400).json({
      error: "key is required",
    });
  }

  const result = await handleLeaderWrite("SET", key, value);
  res.status(result.statusCode).json(result.data);
});

app.delete("/api/delete/:key", async (req, res) => {
  const { key } = req.params;

  const result = await handleLeaderWrite("DELETE", key);
  res.status(result.statusCode).json(result.data);
});

app.listen(PORT, () => {
  console.log(`${NODE_ID} is running on port ${PORT} as ${INITIAL_ROLE}`);
});
