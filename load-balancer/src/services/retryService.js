const { RETRY_INITIAL_DELAY_MS, RETRY_MAX_DELAY_MS } = require("../config");

function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function calculateExponentialDelay(
  retryNumber,
  initialDelayMs = RETRY_INITIAL_DELAY_MS,
  maximumDelayMs = RETRY_MAX_DELAY_MS,
) {
  const exponentialDelay = initialDelayMs * 2 ** retryNumber;

  return Math.min(exponentialDelay, maximumDelayMs);
}

async function executeWithExponentialBackoff({
  operation,
  shouldRetry,
  maxAttempts,
  initialDelayMs = RETRY_INITIAL_DELAY_MS,
  maximumDelayMs = RETRY_MAX_DELAY_MS,
  operationName = "operation",
}) {
  const attempts = [];

  let lastResult = null;
  let lastError = null;

  for (
    let attemptNumber = 1;
    attemptNumber <= maxAttempts;
    attemptNumber += 1
  ) {
    const startedAt = new Date().toISOString();

    try {
      const result = await operation(attemptNumber);

      lastResult = result;

      const retryRequired =
        attemptNumber < maxAttempts &&
        shouldRetry({
          result,
          error: null,
          attemptNumber,
        });

      attempts.push({
        attemptNumber,
        startedAt,
        status: retryRequired ? "retry-required" : "completed",
      });

      if (!retryRequired) {
        return {
          success: true,
          result,
          attempts,
          totalAttempts: attemptNumber,
        };
      }
    } catch (error) {
      lastError = error;

      const retryRequired =
        attemptNumber < maxAttempts &&
        shouldRetry({
          result: null,
          error,
          attemptNumber,
        });

      attempts.push({
        attemptNumber,
        startedAt,
        status: retryRequired ? "failed-will-retry" : "failed",
        error: error.code || error.message,
      });

      if (!retryRequired) {
        throw Object.assign(error, {
          retryMetadata: {
            operationName,
            attempts,
            totalAttempts: attemptNumber,
          },
        });
      }
    }

    const retryNumber = attemptNumber - 1;

    const delayMs = calculateExponentialDelay(
      retryNumber,
      initialDelayMs,
      maximumDelayMs,
    );

    attempts[attempts.length - 1].delayBeforeNextAttemptMs = delayMs;

    console.log(
      `[retry] ${operationName}: attempt ${attemptNumber} failed; ` +
        `retrying after ${delayMs}ms`,
    );

    await sleep(delayMs);
  }

  return {
    success: false,
    result: lastResult,
    error: lastError,
    attempts,
    totalAttempts: maxAttempts,
  };
}

module.exports = {
  sleep,
  calculateExponentialDelay,
  executeWithExponentialBackoff,
};
