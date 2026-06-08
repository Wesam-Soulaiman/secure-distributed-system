const PORT = process.env.PORT || 8000;
const NODE_ID = process.env.NODE_ID || "node-unknown";
const INITIAL_ROLE = process.env.INITIAL_ROLE || "follower";

const PEERS = [
  { id: "node-a", url: "http://node-a:8000" },
  { id: "node-b", url: "http://node-b:8000" },
  { id: "node-c", url: "http://node-c:8000" },
].filter((peer) => peer.id !== NODE_ID);

const REPLICATION_TIMEOUT_MS = 2000;

const ELECTION_TIMEOUT_MIN_MS = 1500;
const ELECTION_TIMEOUT_MAX_MS = 3000;

const HEARTBEAT_INTERVAL_MS = 500;

module.exports = {
  PORT,
  NODE_ID,
  INITIAL_ROLE,
  PEERS,
  REPLICATION_TIMEOUT_MS,
  ELECTION_TIMEOUT_MIN_MS,
  ELECTION_TIMEOUT_MAX_MS,
  HEARTBEAT_INTERVAL_MS,
};
