# Queue Alarms

Alerting templates for the Prometheus metrics exposed at `GET /metrics`
(admin-token-guarded). Adapt thresholds to your traffic volume — these
are starting points calibrated for the current hobbyist-scale workload.

## Available metrics

| Metric | Labels | What it means |
|---|---|---|
| `tweetly_queue_depth` | `type`, `status` | Row count per `(action_type, status)`. Pending = waiting; claimed/running = mid-flight; failed/dead = retry exhausted. |
| `tweetly_queue_lag_seconds` | `type` | Age of the oldest pending action per type. High = workers can't keep up or executor stuck. |
| `tweetly_action_total` | `type`, `outcome` | Cumulative count of completed actions, labeled with `success`/`failure`. |
| `tweetly_action_duration_ms` | `type` | Histogram of execution time per action. p99 detects slow Playwright flows. |
| `tweetly_circuit_breaker_paused` | `account_id` | 1 if the circuit breaker for that account is open. |

## Recommended alarms

### 1. Stuck queue (executor missing or DB lock contention)

```
ALERT QueueStuck
  IF tweetly_queue_lag_seconds{type=~".+"} > 600
  FOR 10m
  ANNOTATIONS {
    summary = "Queue lag for {{ $labels.type }} > 10m",
    description = "Oldest pending action of type {{ $labels.type }} is {{ $value }}s old. Check ClaimWorker logs and ExecutorRegistry registrations."
  }
```

The first thing to check: is the executor for that type registered?
`grep 'Registered executor:' app.log | sort -u` should list all 15 types.
If a type is missing, the worker silently skips it — pending rows pile up.

### 2. Pending depth overflow (capacity issue)

```
ALERT QueueBacklog
  IF tweetly_queue_depth{status="pending"} > 1000
  FOR 5m
  ANNOTATIONS {
    summary = "Pending depth for {{ $labels.type }} > 1000",
    description = "More than 1000 pending {{ $labels.type }} actions. Consider scaling workers (WORKER_BATCH_SIZE) or rate-limiting at the MCP layer."
  }
```

### 3. Auth failures spiking (cookie expiration)

```
ALERT AuthFailureSpike
  IF rate(tweetly_action_total{outcome="failure"}[5m]) > 0.5
  FOR 10m
  ANNOTATIONS {
    summary = "Action failure rate elevated",
    description = "{{ $labels.type }} failing at {{ $value | humanize }}/s. If error_class=auth dominates, account session expired — run reauth_x_account."
  }
```

(For finer auth-specific alerts, add an `error_class` label to
`actionTotal` — see `metrics.service.ts`. Future enhancement.)

### 4. Dead-letter accumulation

```
ALERT DeadActions
  IF tweetly_queue_depth{status="dead"} > 50
  FOR 1h
  ANNOTATIONS {
    summary = "{{ $labels.type }} dead-letter depth > 50",
    description = "Actions exhausted retries. Inspect via list_actions(type, status=dead). Common causes: invalid tweet URLs, deleted accounts, or X API changes."
  }
```

### 5. Circuit breaker open

```
ALERT CircuitBreakerOpen
  IF tweetly_circuit_breaker_paused == 1
  FOR 15m
  ANNOTATIONS {
    summary = "Circuit breaker open for account {{ $labels.account_id }}",
    description = "All actions for this account paused. Likely cause: repeated auth failures. Run get_account_health for diagnostics."
  }
```

## Triage flow

When an alert fires:

1. Hit `GET /metrics` with the admin token and inspect queue gauges, or query
   `actions_all` directly for a human-readable overview:
   ```sql
   SELECT type, status, COUNT(*) FROM actions_all GROUP BY type, status ORDER BY type, status;
   ```
2. Check ClaimWorker logs for the affected `type` — boot logs include
   `Registered executor: <type>`.
3. Inspect a failed row: `SELECT id, account_id, last_error, error_class
   FROM <type>_actions WHERE status='failed' ORDER BY updated_at DESC
   LIMIT 5;`
4. If `error_class=auth`, run `reauth_x_account` and check
   `get_account_health`.
5. If `error_class=permanent`, the action is poisoned — `cancel_action`
   it; root-cause separately.
