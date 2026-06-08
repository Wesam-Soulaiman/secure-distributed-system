import React from "react";

function getAttemptClass(status) {
  if (status === "completed" || status === "success") {
    return "retry-success";
  }

  if (status === "retry-required" || status === "failed-will-retry") {
    return "retry-warning";
  }

  return "retry-danger";
}

function getAttemptLabel(status) {
  if (status === "completed") {
    return "Success";
  }

  if (status === "retry-required") {
    return "Retry Required";
  }

  if (status === "failed-will-retry") {
    return "Failed, Retrying";
  }

  if (status === "failed") {
    return "Failed";
  }

  return status || "Unknown";
}

function formatAttemptTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString();
}

function findCommittedStatus(lastResult) {
  return (
    lastResult?.result?.response?.status ||
    lastResult?.response?.status ||
    lastResult?.result?.status ||
    null
  );
}

function RetryTimeline({ retry, lastResult }) {
  const attempts = retry?.attempts || [];

  const totalAttempts =
    retry?.leaderDiscoveryAttempts ?? retry?.totalAttempts ?? attempts.length;

  const finalAttempt = attempts[attempts.length - 1];

  const operationStatus = findCommittedStatus(lastResult);

  const succeeded =
    finalAttempt?.status === "completed" ||
    operationStatus === "committed" ||
    operationStatus === "stored";

  const delays = attempts
    .map((attempt) => attempt.delayBeforeNextAttemptMs || 0)
    .filter((delay) => delay > 0);

  const maxDelay = delays.length > 0 ? Math.max(...delays) : 1;

  return (
    <section className="panel retry-panel">
      <div className="panel-header">
        <div>
          <span className="panel-eyebrow">Resilience Strategy</span>

          <h2>Retry & Exponential Backoff</h2>

          <p>
            Leader discovery retries use increasing delays instead of failing
            immediately.
          </p>
        </div>
      </div>

      {retry ? (
        <>
          <div className="retry-summary-grid">
            <div className="retry-summary-item">
              <span>Strategy</span>

              <strong>{retry.strategy || "exponential-backoff"}</strong>
            </div>

            <div className="retry-summary-item">
              <span>Total Attempts</span>

              <strong>{totalAttempts}</strong>
            </div>

            <div className="retry-summary-item">
              <span>Final Result</span>

              <strong className={succeeded ? "text-success" : "text-warning"}>
                {succeeded ? "Success" : "Incomplete"}
              </strong>
            </div>

            <div className="retry-summary-item">
              <span>Operation</span>

              <strong>{lastResult?.operation || "Leader Discovery"}</strong>
            </div>
          </div>

          <div className="retry-timeline">
            {attempts.map((attempt, index) => (
              <div
                key={`${attempt.attemptNumber}-${index}`}
                className="retry-attempt"
              >
                <div
                  className={`retry-marker ${getAttemptClass(attempt.status)}`}
                >
                  {attempt.attemptNumber}
                </div>

                <div className="retry-attempt-content">
                  <div className="retry-attempt-header">
                    <strong>Attempt {attempt.attemptNumber}</strong>

                    <span
                      className={`status-pill ${
                        attempt.status === "completed"
                          ? "status-success"
                          : attempt.status === "failed"
                            ? "status-danger"
                            : "status-warning"
                      }`}
                    >
                      {getAttemptLabel(attempt.status)}
                    </span>
                  </div>

                  <div className="retry-attempt-details">
                    <span>
                      Started:{" "}
                      <strong>{formatAttemptTime(attempt.startedAt)}</strong>
                    </span>

                    {attempt.delayBeforeNextAttemptMs != null && (
                      <span>
                        Next Delay:{" "}
                        <strong>{attempt.delayBeforeNextAttemptMs} ms</strong>
                      </span>
                    )}

                    {attempt.error && (
                      <span className="retry-error-text">
                        Error: <strong>{attempt.error}</strong>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {delays.length > 0 && (
            <div className="backoff-visualization">
              <span>Backoff Pattern</span>

              <div className="backoff-bars">
                {attempts
                  .filter((attempt) => attempt.delayBeforeNextAttemptMs != null)
                  .map((attempt) => {
                    const delay = attempt.delayBeforeNextAttemptMs;

                    const width = (delay / maxDelay) * 100;

                    return (
                      <div
                        key={`delay-${attempt.attemptNumber}`}
                        className="backoff-row"
                      >
                        <span>Retry {attempt.attemptNumber}</span>

                        <div className="backoff-track">
                          <div
                            className="backoff-fill"
                            style={{
                              width: `${width}%`,
                            }}
                          />
                        </div>

                        <strong>{delay} ms</strong>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="empty-state">
          No retry operation has been recorded yet. Stop the current leader and
          immediately send a write request to demonstrate exponential backoff.
        </div>
      )}
    </section>
  );
}

export default RetryTimeline;
