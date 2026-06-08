const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const { PORT, NODE_ID, INITIAL_ROLE } = require("./config");

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

app.listen(PORT, () => {
  console.log(`${NODE_ID} is running on port ${PORT} as ${INITIAL_ROLE}`);
});
