// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

package catalog

// Query defines a preloaded diagnostic query.
type Query struct {
	ID           string `json:"id"`
	Category     string `json:"category"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	SQL          string `json:"sql"`
	DBFilterExpr string `json:"db_filter_expr,omitempty"`
}

// All returns all preloaded queries in display order.
func All() []Query {
	return append(append(append(statementQueries, transactionQueries...), indexQueries...), clusterQueries...)
}

var statementQueries = []Query{
	{
		ID:           "stmt-slowest-latency",
		Category:     "Statements",
		Name:         "Slowest by Mean Latency",
		Description:  "Top 25 statement fingerprints ranked by execution-count-weighted mean run latency across the export window.",
		DBFilterExpr: "database",
		SQL: `SELECT
  fingerprint_id,
  database,
  query AS query_text,
  SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS BIGINT)) AS total_executions,
  ROUND(
    SUM(
      CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) *
      CAST(json_extract(statistics, '$.statistics.runLat.mean') AS DOUBLE)
    ) / NULLIF(SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE)), 0),
    4
  ) AS weighted_mean_run_lat_sec,
  ROUND(MAX(CAST(json_extract(statistics, '$.statistics.latencyInfo.max') AS DOUBLE)), 4) AS max_latency_sec,
  BOOL_OR(CAST(json_extract(metadata, '$.fullScan') AS BOOLEAN)) AS full_scan
FROM stmt_stats
GROUP BY ALL
ORDER BY weighted_mean_run_lat_sec DESC NULLS LAST
LIMIT 25`,
	},
	{
		ID:           "stmt-top-cpu",
		Category:     "Statements",
		Name:         "Top CPU Consumers",
		Description:  "Top 25 statement fingerprints by weighted mean CPU time (from sampled execution_statistics). Rows without CPU samples are excluded.",
		DBFilterExpr: "database",
		SQL: `SELECT
  fingerprint_id,
  database,
  query AS query_text,
  SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS BIGINT)) AS total_executions,
  ROUND(
    SUM(
      CAST(json_extract(statistics, '$.execution_statistics.cnt') AS DOUBLE) *
      CAST(json_extract(statistics, '$.execution_statistics.cpuSQLNanos.mean') AS DOUBLE)
    ) / NULLIF(SUM(CAST(json_extract(statistics, '$.execution_statistics.cnt') AS DOUBLE)), 0) / 1e9,
    4
  ) AS weighted_mean_cpu_sec
FROM stmt_stats
WHERE json_extract(statistics, '$.execution_statistics.cpuSQLNanos.mean') IS NOT NULL
GROUP BY ALL
ORDER BY weighted_mean_cpu_sec DESC NULLS LAST
LIMIT 25`,
	},
	{
		ID:           "stmt-full-scans",
		Category:     "Statements",
		Name:         "Full Table Scans",
		Description:  "All statement fingerprints that performed full table scans, sorted by execution count. These are candidates for index creation.",
		DBFilterExpr: "database",
		SQL: `SELECT
  fingerprint_id,
  database,
  query AS query_text,
  SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS BIGINT)) AS total_executions,
  ROUND(
    SUM(
      CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) *
      CAST(json_extract(statistics, '$.statistics.runLat.mean') AS DOUBLE)
    ) / NULLIF(SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE)), 0),
    4
  ) AS weighted_mean_run_lat_sec
FROM stmt_stats
WHERE CAST(json_extract(metadata, '$.fullScan') AS BOOLEAN) = true
GROUP BY ALL
ORDER BY total_executions DESC
LIMIT 25`,
	},
	{
		ID:           "stmt-index-recs",
		Category:     "Statements",
		Name:         "Index Recommendations",
		Description:  "Distinct statement fingerprints that carry index recommendations from the query optimizer.",
		DBFilterExpr: "database",
		SQL: `SELECT DISTINCT
  fingerprint_id,
  database,
  query AS query_text,
  json_extract_string(statistics, '$.index_recommendations') AS index_recommendations
FROM stmt_stats
WHERE json_extract(statistics, '$.index_recommendations') IS NOT NULL
  AND json_extract_string(statistics, '$.index_recommendations') NOT IN ('null', '[]', '{}')
ORDER BY database, query_text`,
	},
	{
		ID:           "stmt-high-error-rate",
		Category:     "Statements",
		Name:         "High Error Rates",
		Description:  "Statement fingerprints where more than 1% of executions failed, sorted by failure rate.",
		DBFilterExpr: "database",
		SQL: `SELECT
  fingerprint_id,
  database,
  query AS query_text,
  SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS BIGINT)) AS total_executions,
  SUM(CAST(json_extract(statistics, '$.statistics.failureCount') AS BIGINT)) AS total_failures,
  ROUND(
    SUM(CAST(json_extract(statistics, '$.statistics.failureCount') AS DOUBLE)) /
    NULLIF(SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE)), 0) * 100,
    2
  ) AS failure_rate_pct
FROM stmt_stats
GROUP BY ALL
HAVING failure_rate_pct > 1.0
ORDER BY failure_rate_pct DESC
LIMIT 25`,
	},
	{
		ID:           "stmt-contention-time",
		Category:     "Statements",
		Name:         "High Contention Time",
		Description:  "Statement fingerprints by execution-weighted mean contention time (seconds), from sampled execution_statistics. High contention points at lock/row conflicts.",
		DBFilterExpr: "database",
		SQL: `SELECT
  fingerprint_id,
  database,
  query AS query_text,
  SUM(CAST(json_extract(statistics, '$.execution_statistics.cnt') AS BIGINT)) AS sampled_executions,
  ROUND(
    SUM(
      CAST(json_extract(statistics, '$.execution_statistics.cnt') AS DOUBLE) *
      CAST(json_extract(statistics, '$.execution_statistics.contentionTime.mean') AS DOUBLE)
    ) / NULLIF(SUM(CAST(json_extract(statistics, '$.execution_statistics.cnt') AS DOUBLE)), 0),
    4
  ) AS weighted_mean_contention_sec
FROM stmt_stats
WHERE json_extract(statistics, '$.execution_statistics.cnt') IS NOT NULL
GROUP BY ALL
HAVING weighted_mean_contention_sec > 0
ORDER BY weighted_mean_contention_sec DESC
LIMIT 25`,
	},
	{
		ID:           "stmt-memory-disk",
		Category:     "Statements",
		Name:         "Memory & Disk Spill",
		Description:  "Statement fingerprints by peak memory usage (MiB), with any disk spill. Sampled from execution_statistics; disk usage > 0 means the query spilled to disk.",
		DBFilterExpr: "database",
		SQL: `SELECT
  fingerprint_id,
  database,
  query AS query_text,
  ROUND(MAX(CAST(json_extract(statistics, '$.execution_statistics.maxMemUsage.mean') AS DOUBLE)) / 1048576.0, 2) AS max_mem_mib,
  ROUND(MAX(CAST(json_extract(statistics, '$.execution_statistics.maxDiskUsage.mean') AS DOUBLE)) / 1048576.0, 2) AS max_disk_mib
FROM stmt_stats
WHERE json_extract(statistics, '$.execution_statistics.cnt') IS NOT NULL
GROUP BY ALL
HAVING max_mem_mib > 0 OR max_disk_mib > 0
ORDER BY max_mem_mib DESC NULLS LAST
LIMIT 25`,
	},
	{
		ID:           "stmt-admission-wait",
		Category:     "Statements",
		Name:         "Admission Control Wait",
		Description:  "Statement fingerprints by execution-weighted mean admission-control wait (seconds). Sustained wait indicates CPU/IO overload and request queueing.",
		DBFilterExpr: "database",
		SQL: `SELECT
  fingerprint_id,
  database,
  query AS query_text,
  SUM(CAST(json_extract(statistics, '$.execution_statistics.cnt') AS BIGINT)) AS sampled_executions,
  ROUND(
    SUM(
      CAST(json_extract(statistics, '$.execution_statistics.cnt') AS DOUBLE) *
      CAST(json_extract(statistics, '$.execution_statistics.admissionWaitTime.mean') AS DOUBLE)
    ) / NULLIF(SUM(CAST(json_extract(statistics, '$.execution_statistics.cnt') AS DOUBLE)), 0) / 1e9,
    6
  ) AS weighted_mean_admission_wait_sec
FROM stmt_stats
WHERE json_extract(statistics, '$.execution_statistics.cnt') IS NOT NULL
GROUP BY ALL
HAVING weighted_mean_admission_wait_sec > 0
ORDER BY weighted_mean_admission_wait_sec DESC
LIMIT 25`,
	},
	{
		ID:           "stmt-plan-instability",
		Category:     "Statements",
		Name:         "Plan Instability",
		Description:  "Statement fingerprints whose query plan changed across the export window (more than one distinct plan_hash). Plan flips can cause latency regressions.",
		DBFilterExpr: "database",
		SQL: `SELECT
  fingerprint_id,
  database,
  query AS query_text,
  COUNT(DISTINCT plan_hash) AS distinct_plans,
  SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS BIGINT)) AS total_executions
FROM stmt_stats
GROUP BY ALL
HAVING COUNT(DISTINCT plan_hash) > 1
ORDER BY distinct_plans DESC, total_executions DESC
LIMIT 25`,
	},
	{
		ID:          "stmt-index-rec-aggregate",
		Category:    "Statements",
		Name:        "Top Index Recommendations",
		Description: "Distinct index recommendations from the optimizer, ranked by how many statement fingerprints would benefit. Prioritizes which indexes to create first.",
		SQL: `WITH exploded AS (
  SELECT
    fingerprint_id,
    TRIM(unnest(CAST(json_extract(statistics, '$.index_recommendations') AS VARCHAR[]))) AS recommendation
  FROM stmt_stats
  WHERE json_array_length(json_extract(statistics, '$.index_recommendations')) > 0
)
SELECT
  recommendation,
  COUNT(DISTINCT fingerprint_id) AS fingerprints_affected
FROM exploded
GROUP BY recommendation
ORDER BY fingerprints_affected DESC
LIMIT 25`,
	},
	{
		ID:           "stmt-rows-read-amplification",
		Category:     "Statements",
		Name:         "Rows-Read Amplification",
		Description:  "Statement fingerprints that scan many rows to return few. Ranked by execution-weighted rows read (the scan cost); read_amplification (rows read ÷ rows returned) is shown for context and can be very large for statements that return ~0 rows. Lists statements averaging ≥100 rows read. Points at missing/poor indexes or over-broad scans.",
		DBFilterExpr: "database",
		SQL: `SELECT
  fingerprint_id,
  database,
  query AS query_text,
  SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS BIGINT)) AS total_executions,
  ROUND(
    SUM(
      CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) *
      CAST(json_extract(statistics, '$.statistics.rowsRead.mean') AS DOUBLE)
    ) / NULLIF(SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE)), 0),
    1
  ) AS avg_rows_read,
  ROUND(
    SUM(
      CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) *
      CAST(json_extract(statistics, '$.statistics.numRows.mean') AS DOUBLE)
    ) / NULLIF(SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE)), 0),
    1
  ) AS avg_rows_returned,
  ROUND(
    SUM(
      CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) *
      CAST(json_extract(statistics, '$.statistics.rowsWritten.mean') AS DOUBLE)
    ) / NULLIF(SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE)), 0),
    1
  ) AS avg_rows_written,
  ROUND(
    SUM(
      CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) *
      CAST(json_extract(statistics, '$.statistics.rowsRead.mean') AS DOUBLE)
    ) / NULLIF(SUM(
      CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) *
      CAST(json_extract(statistics, '$.statistics.numRows.mean') AS DOUBLE)
    ), 0),
    1
  ) AS read_amplification
FROM stmt_stats
GROUP BY ALL
HAVING avg_rows_read >= 100
ORDER BY avg_rows_read DESC NULLS LAST
LIMIT 25`,
	},
	{
		ID:           "stmt-latency-decomposition",
		Category:     "Statements",
		Name:         "Latency Decomposition",
		Description:  "Where each statement's service latency goes: parse / plan / run / overhead / idle as a percentage of svcLat (execution-weighted). A high plan share often means stale table statistics. Ordered by plan share.",
		DBFilterExpr: "database",
		SQL: `SELECT
  fingerprint_id,
  database,
  query AS query_text,
  SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS BIGINT)) AS total_executions,
  ROUND(
    SUM(
      CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) *
      CAST(json_extract(statistics, '$.statistics.svcLat.mean') AS DOUBLE)
    ) / NULLIF(SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE)), 0),
    4
  ) AS mean_svc_lat_sec,
  ROUND(100 * SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) * CAST(json_extract(statistics, '$.statistics.parseLat.mean') AS DOUBLE)) / NULLIF(SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) * CAST(json_extract(statistics, '$.statistics.svcLat.mean') AS DOUBLE)), 0), 1) AS parse_pct,
  ROUND(100 * SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) * CAST(json_extract(statistics, '$.statistics.planLat.mean') AS DOUBLE)) / NULLIF(SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) * CAST(json_extract(statistics, '$.statistics.svcLat.mean') AS DOUBLE)), 0), 1) AS plan_pct,
  ROUND(100 * SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) * CAST(json_extract(statistics, '$.statistics.runLat.mean') AS DOUBLE)) / NULLIF(SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) * CAST(json_extract(statistics, '$.statistics.svcLat.mean') AS DOUBLE)), 0), 1) AS run_pct,
  ROUND(100 * SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) * CAST(json_extract(statistics, '$.statistics.ovhLat.mean') AS DOUBLE)) / NULLIF(SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) * CAST(json_extract(statistics, '$.statistics.svcLat.mean') AS DOUBLE)), 0), 1) AS overhead_pct,
  ROUND(100 * SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) * CAST(json_extract(statistics, '$.statistics.idleLat.mean') AS DOUBLE)) / NULLIF(SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) * CAST(json_extract(statistics, '$.statistics.svcLat.mean') AS DOUBLE)), 0), 1) AS idle_pct
FROM stmt_stats
GROUP BY ALL
HAVING SUM(
  CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) *
  CAST(json_extract(statistics, '$.statistics.svcLat.mean') AS DOUBLE)
) > 0
ORDER BY plan_pct DESC NULLS LAST
LIMIT 25`,
	},
	{
		ID:          "stmt-latency-percentiles",
		Category:    "Statements",
		Name:        "Latency Percentiles by App",
		Description: "Run-latency percentiles (p50/p90/p95/p99) across per-fingerprint mean run latencies, one row per application plus an overall \"(all applications)\" row. Approximate: CRDB exports no per-execution histogram, so each fingerprint contributes a single execution-weighted mean and the percentiles are taken over that population of means. Rows: fingerprints counted and executions summed per group. Ordered by p99 descending (overall row first).",
		SQL: `WITH per_fp AS (
  SELECT
    fingerprint_id,
    app_name,
    SUM(
      CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) *
      CAST(json_extract(statistics, '$.statistics.runLat.mean') AS DOUBLE)
    ) / NULLIF(SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE)), 0) AS mean_run_lat_sec,
    SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS BIGINT)) AS executions
  FROM stmt_stats
  GROUP BY fingerprint_id, app_name
)
SELECT
  CASE WHEN GROUPING(app_name) = 1 THEN '(all applications)'
       ELSE COALESCE(NULLIF(app_name, ''), '(unset)') END AS application,
  COUNT(*) AS fingerprints,
  CAST(SUM(executions) AS BIGINT) AS total_executions,
  ROUND(percentile_cont(0.50) WITHIN GROUP (ORDER BY mean_run_lat_sec), 4) AS p50_run_lat_sec,
  ROUND(percentile_cont(0.90) WITHIN GROUP (ORDER BY mean_run_lat_sec), 4) AS p90_run_lat_sec,
  ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY mean_run_lat_sec), 4) AS p95_run_lat_sec,
  ROUND(percentile_cont(0.99) WITHIN GROUP (ORDER BY mean_run_lat_sec), 4) AS p99_run_lat_sec
FROM per_fp
WHERE mean_run_lat_sec IS NOT NULL
GROUP BY GROUPING SETS ((app_name), ())
ORDER BY GROUPING(app_name) DESC, p99_run_lat_sec DESC NULLS LAST
LIMIT 25`,
	},
}

var transactionQueries = []Query{
	{
		ID:          "txn-slowest-latency",
		Category:    "Transactions",
		Name:        "Slowest by Service Latency",
		Description: "Transaction fingerprints ranked by execution-count-weighted mean service latency (total time from begin to commit) across the export window.",
		SQL: `SELECT
  fingerprint_id,
  any_value(app_name) AS application,
  SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS BIGINT)) AS total_executions,
  ROUND(
    SUM(
      CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) *
      CAST(json_extract(statistics, '$.statistics.svcLat.mean') AS DOUBLE)
    ) / NULLIF(SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE)), 0),
    4
  ) AS weighted_mean_svc_lat_sec
FROM txn_stats
GROUP BY fingerprint_id
ORDER BY weighted_mean_svc_lat_sec DESC NULLS LAST
LIMIT 25`,
	},
	{
		ID:          "txn-high-retries",
		Category:    "Transactions",
		Name:        "High Retry Rates",
		Description: "Transaction fingerprints with the highest max retry count across the export window. High retries indicate contention or serialization conflicts.",
		SQL: `SELECT
  fingerprint_id,
  any_value(app_name) AS application,
  SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS BIGINT)) AS total_executions,
  MAX(CAST(json_extract(statistics, '$.statistics.maxRetries') AS BIGINT)) AS max_retries,
  ROUND(
    SUM(
      CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) *
      CAST(json_extract(statistics, '$.statistics.retryLat.mean') AS DOUBLE)
    ) / NULLIF(SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE)), 0),
    4
  ) AS weighted_mean_retry_lat_sec
FROM txn_stats
GROUP BY fingerprint_id
HAVING MAX(CAST(json_extract(statistics, '$.statistics.maxRetries') AS BIGINT)) > 0
ORDER BY max_retries DESC
LIMIT 25`,
	},
	{
		ID:          "txn-commit-latency",
		Category:    "Transactions",
		Name:        "Slow Commit Latency",
		Description: "Transaction fingerprints ranked by weighted mean commit latency. High commit latency often indicates lock contention.",
		SQL: `SELECT
  fingerprint_id,
  any_value(app_name) AS application,
  SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS BIGINT)) AS total_executions,
  ROUND(
    SUM(
      CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) *
      CAST(json_extract(statistics, '$.statistics.commitLat.mean') AS DOUBLE)
    ) / NULLIF(SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE)), 0),
    4
  ) AS weighted_mean_commit_lat_sec
FROM txn_stats
GROUP BY fingerprint_id
ORDER BY weighted_mean_commit_lat_sec DESC NULLS LAST
LIMIT 25`,
	},
	{
		ID:          "txn-statement-breakdown",
		Category:    "Transactions",
		Name:        "Transaction Statement Breakdown",
		Description: "The heaviest transactions (top 15 by total service time) broken down into their constituent statements, joined via transaction_fingerprint_id. Each row is one statement with its execution-weighted mean run latency and its share of the transaction's total statement run time. Click a statement's fingerprint_id to see its full text and stats.",
		SQL: `WITH ranked_txns AS (
  SELECT
    fingerprint_id AS txn_fingerprint_id,
    any_value(app_name) AS application,
    SUM(
      CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) *
      CAST(json_extract(statistics, '$.statistics.svcLat.mean') AS DOUBLE)
    ) AS txn_total_svc_sec
  FROM txn_stats
  GROUP BY fingerprint_id
  ORDER BY txn_total_svc_sec DESC NULLS LAST
  LIMIT 15
),
stmt_agg AS (
  SELECT
    transaction_fingerprint_id,
    fingerprint_id,
    any_value(query) AS query_text,
    SUM(CAST(json_extract(statistics, '$.statistics.cnt') AS BIGINT)) AS stmt_executions,
    SUM(
      CAST(json_extract(statistics, '$.statistics.cnt') AS DOUBLE) *
      CAST(json_extract(statistics, '$.statistics.runLat.mean') AS DOUBLE)
    ) AS stmt_total_run_sec
  FROM stmt_stats
  GROUP BY transaction_fingerprint_id, fingerprint_id
)
SELECT
  r.txn_fingerprint_id,
  r.application,
  s.fingerprint_id,
  s.query_text,
  s.stmt_executions,
  ROUND(s.stmt_total_run_sec / NULLIF(s.stmt_executions, 0), 4) AS mean_run_lat_sec,
  ROUND(s.stmt_total_run_sec, 4) AS total_run_sec,
  ROUND(
    100 * s.stmt_total_run_sec /
    NULLIF(SUM(s.stmt_total_run_sec) OVER (PARTITION BY r.txn_fingerprint_id), 0),
    1
  ) AS pct_of_txn_stmts
FROM ranked_txns r
JOIN stmt_agg s ON s.transaction_fingerprint_id = r.txn_fingerprint_id
ORDER BY r.txn_total_svc_sec DESC NULLS LAST, total_run_sec DESC`,
	},
	{
		ID:           "txn-contention",
		Category:     "Transactions",
		Name:         "Contention Hotspots",
		Description:  "Tables and indexes with the most contention events in the export window, with total contention time in seconds.",
		DBFilterExpr: "database_name",
		SQL: `SELECT
  database_name,
  table_name,
  index_name,
  contention_type,
  COUNT(*) AS contention_events,
  ROUND(SUM(EXTRACT(EPOCH FROM contention_duration::VARCHAR::INTERVAL))::DOUBLE, 3) AS total_contention_sec
FROM txn_contention
WHERE table_name IS NOT NULL AND table_name != ''
GROUP BY database_name, table_name, index_name, contention_type
ORDER BY contention_events DESC
LIMIT 25`,
	},
}

var indexQueries = []Query{
	{
		ID:          "idx-unused",
		Category:    "Indexes",
		Name:        "Unused Indexes",
		Description: "Secondary indexes with zero reads since the last statistics reset. Safe candidates for dropping (verify business hours first).",
		SQL: `SELECT
  ti.descriptor_name AS table_name,
  ti.index_name,
  ti.index_type,
  ti.is_unique
FROM idx_usage iu
JOIN table_indexes ti ON iu.table_id = ti.descriptor_id AND iu.index_id = ti.index_id
WHERE iu.total_reads = 0
  AND ti.index_type = 'secondary'
  AND CAST(ti.is_visible AS BOOLEAN) = true
ORDER BY ti.descriptor_name, ti.index_name`,
	},
	{
		ID:          "idx-low-usage",
		Category:    "Indexes",
		Name:        "Rarely Used Indexes",
		Description: "Secondary indexes with fewer than 100 total reads. Their write overhead may exceed their query benefit.",
		SQL: `SELECT
  ti.descriptor_name AS table_name,
  ti.index_name,
  ti.index_type,
  ti.is_unique,
  iu.total_reads,
  iu.last_read
FROM idx_usage iu
JOIN table_indexes ti ON iu.table_id = ti.descriptor_id AND iu.index_id = ti.index_id
WHERE iu.total_reads > 0 AND iu.total_reads < 100
  AND ti.index_type = 'secondary'
  AND CAST(ti.is_visible AS BOOLEAN) = true
ORDER BY iu.total_reads ASC`,
	},
	{
		ID:          "stats-table-audit",
		Category:    "Indexes",
		Name:        "Table Statistics Audit",
		Description: "Per-table statistics-quality audit (latest collection per column set): how many single- vs multi-column stat sets exist, histogram coverage over the single-column sets (CRDB only builds histograms on single columns — and skips some types — so <100% is informational, not always a problem), partial-stat count, row count, and the age of the newest stat. Resolves table names via table_indexes. Ordered by row count, so the tables where plan quality matters most surface first.",
		SQL: `WITH latest AS (
  SELECT
    tableID,
    columnIDs,
    createdAt,
    rowCount,
    histogram,
    partialPredicate,
    ROW_NUMBER() OVER (PARTITION BY tableID, columnIDs ORDER BY CAST(createdAt AS TIMESTAMP) DESC) AS rn
  FROM table_stats
),
current_stats AS (
  SELECT * FROM latest WHERE rn = 1
),
table_names AS (
  SELECT
    descriptor_id,
    any_value(descriptor_name) AS descriptor_name,
    any_value(regexp_extract(create_statement, 'ON\s+(.+?)\s*\(', 1)) AS schema_table
  FROM table_indexes
  GROUP BY descriptor_id
)
SELECT
  cs.tableID AS table_id,
  COALESCE(NULLIF(n.schema_table, ''), n.descriptor_name) AS table_name,
  COUNT(*) AS stat_column_sets,
  COUNT(*) FILTER (WHERE cs.columnIDs NOT LIKE '%,%') AS single_column_sets,
  COUNT(*) FILTER (WHERE cs.columnIDs LIKE '%,%') AS multi_column_sets,
  COUNT(*) FILTER (WHERE cs.columnIDs NOT LIKE '%,%' AND cs.histogram IS NOT NULL AND cs.histogram != '') AS single_col_with_histogram,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE cs.columnIDs NOT LIKE '%,%' AND cs.histogram IS NOT NULL AND cs.histogram != '')
    / NULLIF(COUNT(*) FILTER (WHERE cs.columnIDs NOT LIKE '%,%'), 0),
    1
  ) AS histogram_coverage_pct,
  COUNT(*) FILTER (WHERE cs.partialPredicate IS NOT NULL AND cs.partialPredicate != '') AS partial_stats,
  MAX(CAST(cs.rowCount AS BIGINT)) AS row_count,
  ROUND(EXTRACT(EPOCH FROM (NOW()::TIMESTAMP - MAX(CAST(cs.createdAt AS TIMESTAMP)))) / 3600.0, 1) AS newest_stat_age_hours
FROM current_stats cs
LEFT JOIN table_names n ON n.descriptor_id = cs.tableID
GROUP BY ALL
ORDER BY row_count DESC NULLS LAST, table_id
LIMIT 50`,
	},
	{
		ID:          "stats-stale",
		Category:    "Indexes",
		Name:        "Stale Table Statistics",
		Description: "Tables whose newest column statistics are more than 24 hours old (across all stat collections for the table). Stale stats cause poor query plans. table_name is the schema-qualified name (e.g. public.orders) resolved from table_indexes; the same schema.table can appear under multiple table_ids because the export spans several databases, so table_id remains the unique key.",
		SQL: `WITH table_names AS (
  SELECT
    descriptor_id,
    any_value(descriptor_name) AS descriptor_name,
    any_value(regexp_extract(create_statement, 'ON\s+(.+?)\s*\(', 1)) AS schema_table
  FROM table_indexes
  GROUP BY descriptor_id
)
SELECT
  ts.tableID AS table_id,
  COALESCE(NULLIF(n.schema_table, ''), n.descriptor_name) AS table_name,
  MAX(CAST(ts.createdAt AS TIMESTAMP)) AS last_collected,
  MAX(CAST(ts.rowCount AS BIGINT)) AS row_count,
  ROUND(EXTRACT(EPOCH FROM (NOW()::TIMESTAMP - MAX(CAST(ts.createdAt AS TIMESTAMP)))) / 3600.0, 1) AS age_hours
FROM table_stats ts
LEFT JOIN table_names n ON n.descriptor_id = ts.tableID
WHERE CAST(ts.delayDelete AS BOOLEAN) = false OR ts.delayDelete IS NULL
GROUP BY ALL
HAVING NOW()::TIMESTAMP - MAX(CAST(ts.createdAt AS TIMESTAMP)) > INTERVAL '24 hours'
ORDER BY age_hours DESC
LIMIT 50`,
	},
}

var clusterQueries = []Query{
	{
		ID:          "cluster-settings-non-default",
		Category:    "Cluster",
		Name:        "Non-Default Cluster Settings",
		Description: "Cluster settings whose current value differs from the default. Useful for auditing configuration before migration.",
		SQL: `SELECT
  variable,
  value,
  default_value,
  description,
  type,
  origin
FROM cluster_settings
WHERE value != default_value
  AND CAST(sensitive AS BOOLEAN) = false
ORDER BY variable`,
	},
	{
		ID:          "cluster-node-cpu",
		Category:    "Cluster",
		Name:        "Node CPU & Memory",
		Description: "CPU and memory resources for each node at export time.",
		SQL: `SELECT
  node_id,
  address,
  CAST(num_vcpus AS INTEGER) AS num_vcpus,
  ROUND(CAST(total_mem_gib AS DOUBLE), 1) AS total_mem_gib
FROM node_cpu_mem
ORDER BY node_id`,
	},
	{
		ID:          "cluster-settings-system-non-default",
		Category:    "Cluster",
		Name:        "Non-Default Settings (System VC)",
		Description: "System-VC settings whose current value differs from the default — decoded, with default_value, description, and origin. Best view for a migration audit (what changed, from what, and what it does). Excludes sensitive settings and anything currently at its default. Source: crdb_internal.cluster_settings (system VC). Contrast with \"Persisted System Settings\", which lists the raw system.settings writes.",
		SQL: `SELECT
  variable,
  value,
  default_value,
  description,
  type,
  origin
FROM cluster_settings_system
WHERE value != default_value
  AND CAST(sensitive AS BOOLEAN) = false
ORDER BY variable`,
	},
	{
		ID:          "system-settings-overrides",
		Category:    "Cluster",
		Name:        "Persisted System Settings",
		Description: "The raw system.settings table: every setting explicitly written (SET CLUSTER SETTING) with its last-updated timestamp — including sensitive settings and ones since reverted to the default value (so it can list more rows than the non-default view). Source of truth for what was set and when; values are not decoded. Contrast with \"Non-Default Settings (System VC)\", which shows only genuine deviations with descriptions/origins.",
		SQL: `SELECT
  name,
  value,
  valueType AS value_type,
  lastUpdated AS last_updated
FROM system_settings
ORDER BY name`,
	},
}
