const {
  CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  CIRCUIT_BREAKER_OPEN_DURATION_MS,
  CIRCUIT_BREAKER_HALF_OPEN_MAX_REQUESTS,
} = require("../config");

const CIRCUIT_STATES = {
  CLOSED: "CLOSED",
  OPEN: "OPEN",
  HALF_OPEN: "HALF_OPEN",
};

function initializeCircuitBreaker(node) {
  if (!node.circuitBreaker) {
    node.circuitBreaker = {
      state: CIRCUIT_STATES.CLOSED,
      consecutiveFailures: 0,
      openedAt: null,
      lastFailureAt: null,
      lastSuccessAt: null,
      halfOpenRequests: 0,
      totalTrips: 0,
    };
  }

  return node.circuitBreaker;
}

function openCircuit(node, error = null) {
  const circuit = initializeCircuitBreaker(node);

  circuit.state = CIRCUIT_STATES.OPEN;
  circuit.openedAt = new Date().toISOString();
  circuit.lastFailureAt = circuit.openedAt;
  circuit.halfOpenRequests = 0;
  circuit.totalTrips += 1;

  node.healthy = false;

  if (error) {
    node.lastHealthError = error.code || error.message || String(error);
  }
}

function closeCircuit(node) {
  const circuit = initializeCircuitBreaker(node);

  circuit.state = CIRCUIT_STATES.CLOSED;
  circuit.consecutiveFailures = 0;
  circuit.openedAt = null;
  circuit.halfOpenRequests = 0;
  circuit.lastSuccessAt = new Date().toISOString();

  node.healthy = true;
  node.lastHealthError = null;
}

function moveToHalfOpen(node) {
  const circuit = initializeCircuitBreaker(node);

  circuit.state = CIRCUIT_STATES.HALF_OPEN;
  circuit.halfOpenRequests = 0;
}

function getOpenElapsedMs(node) {
  const circuit = initializeCircuitBreaker(node);

  if (!circuit.openedAt) {
    return 0;
  }

  return Date.now() - new Date(circuit.openedAt).getTime();
}

function getRemainingCooldownMs(node) {
  const circuit = initializeCircuitBreaker(node);

  if (circuit.state !== CIRCUIT_STATES.OPEN) {
    return 0;
  }

  return Math.max(0, CIRCUIT_BREAKER_OPEN_DURATION_MS - getOpenElapsedMs(node));
}

function updateCircuitStateByTime(node) {
  const circuit = initializeCircuitBreaker(node);

  if (
    circuit.state === CIRCUIT_STATES.OPEN &&
    getOpenElapsedMs(node) >= CIRCUIT_BREAKER_OPEN_DURATION_MS
  ) {
    moveToHalfOpen(node);
  }

  return circuit.state;
}

function canSendRequest(node) {
  const circuit = initializeCircuitBreaker(node);

  updateCircuitStateByTime(node);

  if (circuit.state === CIRCUIT_STATES.OPEN) {
    return false;
  }

  if (circuit.state === CIRCUIT_STATES.HALF_OPEN) {
    if (circuit.halfOpenRequests >= CIRCUIT_BREAKER_HALF_OPEN_MAX_REQUESTS) {
      return false;
    }

    circuit.halfOpenRequests += 1;
  }

  return true;
}

function recordCircuitSuccess(node) {
  const circuit = initializeCircuitBreaker(node);

  circuit.lastSuccessAt = new Date().toISOString();

  if (
    circuit.state === CIRCUIT_STATES.HALF_OPEN ||
    circuit.state === CIRCUIT_STATES.OPEN
  ) {
    closeCircuit(node);
    return;
  }

  circuit.consecutiveFailures = 0;
}

function recordCircuitFailure(node, error) {
  const circuit = initializeCircuitBreaker(node);

  circuit.consecutiveFailures += 1;
  circuit.lastFailureAt = new Date().toISOString();

  if (circuit.state === CIRCUIT_STATES.HALF_OPEN) {
    openCircuit(node, error);
    return;
  }

  if (circuit.consecutiveFailures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
    openCircuit(node, error);
  }
}

function isNodeRoutable(node) {
  const circuit = initializeCircuitBreaker(node);

  updateCircuitStateByTime(node);

  if (!node.healthy) {
    return circuit.state === CIRCUIT_STATES.HALF_OPEN;
  }

  return circuit.state !== CIRCUIT_STATES.OPEN;
}

function formatCircuitBreaker(node) {
  const circuit = initializeCircuitBreaker(node);

  updateCircuitStateByTime(node);

  return {
    state: circuit.state,
    consecutiveFailures: circuit.consecutiveFailures,
    openedAt: circuit.openedAt,
    lastFailureAt: circuit.lastFailureAt,
    lastSuccessAt: circuit.lastSuccessAt,
    halfOpenRequests: circuit.halfOpenRequests,
    totalTrips: circuit.totalTrips,
    remainingCooldownMs: getRemainingCooldownMs(node),
    failureThreshold: CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    openDurationMs: CIRCUIT_BREAKER_OPEN_DURATION_MS,
  };
}

module.exports = {
  CIRCUIT_STATES,

  initializeCircuitBreaker,

  openCircuit,
  closeCircuit,
  moveToHalfOpen,

  canSendRequest,
  isNodeRoutable,

  recordCircuitSuccess,
  recordCircuitFailure,

  getRemainingCooldownMs,
  formatCircuitBreaker,
};
