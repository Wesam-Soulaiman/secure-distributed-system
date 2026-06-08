const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const { PORT, HEALTH_CHECK_INTERVAL_MS } = require("./config");
const { refreshHealthChecks } = require("./services/healthService");

const lbRoutes = require("./routes/lbRoutes");
const clusterRoutes = require("./routes/clusterRoutes");
const raftRoutes = require("./routes/raftRoutes");
const apiRoutes = require("./routes/apiRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.use(lbRoutes);
app.use(clusterRoutes);
app.use(raftRoutes);
app.use(apiRoutes);

setInterval(refreshHealthChecks, HEALTH_CHECK_INTERVAL_MS);

refreshHealthChecks().catch((error) => {
  console.error("Initial health check failed:", error.message);
});

app.listen(PORT, () => {
  console.log(`Custom Load Balancer is running on port ${PORT}`);
});
