import React from "react";

function SecurityMetric({ label, value }) {
  return (
    <div className="security-metric">
      <span>{label}</span>
      <strong>{value ?? "-"}</strong>
    </div>
  );
}

function SecurityPanel({
  wafStatus,
  rateLimitStatus,
  wafTestResult,
  rateLimitTestResult,
  onTestWaf,
  onTestRateLimit,
  loading,
}) {
  const wafEnabled = Boolean(wafStatus);

  const rateLimitEnabled = Boolean(rateLimitStatus);

  return (
    <section className="panel security-panel">
      <div className="panel-header">
        <div>
          <span className="panel-eyebrow">Gateway Security</span>

          <h2>WAF & Rate Limiting</h2>

          <p>
            Nginx protects the distributed system before requests reach the
            application services.
          </p>
        </div>

        <span className="status-pill status-success">Protected</span>
      </div>

      <div className="security-grid">
        <article className="security-card">
          <div className="security-card-header">
            <div>
              <span className="node-id-label">Web Application Firewall</span>

              <h3>WAF Protection</h3>
            </div>

            <span
              className={`status-pill ${
                wafEnabled ? "status-success" : "status-warning"
              }`}
            >
              {wafEnabled ? "Enabled" : "Unknown"}
            </span>
          </div>

          <p className="security-description">
            Blocks common malicious patterns before forwarding requests to the
            load balancer.
          </p>

          <div className="security-rule-list">
            {(
              wafStatus?.rules || [
                "SQL Injection",
                "Cross-Site Scripting",
                "Path Traversal",
                "Suspicious User Agents",
              ]
            ).map((rule) => (
              <span key={rule} className="security-rule">
                ✓ {rule}
              </span>
            ))}
          </div>

          <button
            type="button"
            className="button primary"
            onClick={onTestWaf}
            disabled={loading}
          >
            Run SQL Injection Test
          </button>

          {wafTestResult && (
            <div
              className={`security-test-result ${
                wafTestResult.blocked
                  ? "security-test-success"
                  : "security-test-danger"
              }`}
            >
              <strong>
                {wafTestResult.blocked
                  ? "Attack Blocked"
                  : "Attack Was Not Blocked"}
              </strong>

              <span>Status: {wafTestResult.status || "-"}</span>

              <span>
                {typeof wafTestResult.message === "string"
                  ? wafTestResult.message
                  : JSON.stringify(wafTestResult.message)}
              </span>
            </div>
          )}
        </article>

        <article className="security-card">
          <div className="security-card-header">
            <div>
              <span className="node-id-label">Traffic Protection</span>

              <h3>Rate Limiting</h3>
            </div>

            <span
              className={`status-pill ${
                rateLimitEnabled ? "status-success" : "status-warning"
              }`}
            >
              {rateLimitEnabled ? "Enabled" : "Unknown"}
            </span>
          </div>

          <p className="security-description">
            Restricts excessive traffic and protects backend services from
            request bursts.
          </p>

          <div className="security-metrics-grid">
            <SecurityMetric label="Limit" value={rateLimitStatus?.limit} />

            <SecurityMetric label="Burst" value={rateLimitStatus?.burst} />

            <SecurityMetric label="Scope" value={rateLimitStatus?.scope} />

            <SecurityMetric
              label="Status"
              value={rateLimitStatus?.rateLimit || "Enabled"}
            />
          </div>

          <button
            type="button"
            className="button primary"
            onClick={onTestRateLimit}
            disabled={loading}
          >
            Run Rate Limit Test
          </button>

          {rateLimitTestResult && (
            <div className="rate-limit-result">
              <div className="rate-limit-result-item success">
                <span>Successful</span>
                <strong>{rateLimitTestResult.successCount}</strong>
              </div>

              <div className="rate-limit-result-item blocked">
                <span>Blocked</span>
                <strong>{rateLimitTestResult.blockedCount}</strong>
              </div>

              <div className="rate-limit-result-item failed">
                <span>Other Failures</span>
                <strong>{rateLimitTestResult.failedCount}</strong>
              </div>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}

export default SecurityPanel;
