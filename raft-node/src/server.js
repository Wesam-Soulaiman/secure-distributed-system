const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const { PORT, NODE_ID, INITIAL_ROLE } = require("./config");

const {
  startConsensus,
  stopConsensus,
} = require("./services/consensusService");

const healthRoutes = require("./routes/healthRoutes");
const nodeRoutes = require("./routes/nodeRoutes");
const apiRoutes = require("./routes/apiRoutes");
const raftRoutes = require("./routes/raftRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.use(healthRoutes);
app.use(nodeRoutes);
app.use(apiRoutes);
app.use(raftRoutes);

const server = app.listen(PORT, () => {
  console.log(`${NODE_ID} is running on port ${PORT} as ${INITIAL_ROLE}`);

  startConsensus();
});

function gracefulShutdown(signal) {
  console.log(`${NODE_ID} received ${signal}. Shutting down...`);

  stopConsensus();

  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
