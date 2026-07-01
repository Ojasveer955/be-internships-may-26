# Scale Plan (10k RPS Design)

## Data model/indexes
- **Database Choice**: Migrate from SQLite to a distributed SQL (e.g., PostgreSQL or CockroachDB) or NoSQL (e.g., DynamoDB or Cassandra) depending on query needs.
- **Indexes**: 
  - Unique index on `idempotency_key` (essential for atomic idempotency).
  - Composite index on `(user_id, created_at)` for fast range/list queries.
- **Partitioning**: Partition tables by `created_at` (e.g., daily/weekly chunks) to keep index sizes manageable and allow archiving older signals easily.

## Idempotency across instances
- **DB Constraints (The Ultimate Source of Truth)**: Continue relying on the database's unique constraint for `idempotency_key` to ensure true atomicity.
- **Caching Layer (Fast Path)**: To shield the database from high volumes of duplicate requests, use Redis. 
  - When a request comes in, check Redis: `GET idem:{key}`. If it exists, return the cached result.
  - If not in Redis, attempt DB insertion.
  - On successful insertion (or if DB constraint fails and we fetch the existing), `SET idem:{key} {result} EX 86400` (1 day TTL).

## Rate limiting across instances
- **Redis Token Bucket**: Replace the single-node memory map with a Redis cluster.
- **Lua Scripting**: Execute Token Bucket operations using a Lua script in Redis. This ensures check-and-decrement is fully atomic.
- **Local Cache (Optional)**: If Redis latency becomes a bottleneck, instances can maintain a local counter for very hot keys and sync with Redis asynchronously (at the risk of slightly over-allowing requests).

## Observability (logs/metrics/alerts)
- **Metrics (Prometheus/Grafana)**: Track request latency, error rates, 429 Rate Limited counts, and DB connection pool health.
- **Structured Logging**: Log as JSON to stdout, scraped by Promtail/Fluentd, and sent to Loki or ELK. Include `trace_id`, `user_id`, and `idempotency_key`.
- **Alerts**: Trigger PagerDuty alerts if the 5xx error rate exceeds 1%, or if p99 latency goes above 200ms.

## Failure modes (DB down / partial outages / retries)
- **Retries**: Use exponential backoff and jitter at the application layer to handle transient DB lockups.
- **Circuit Breakers**: Use libraries like `opossum` to stop hammering the database if it goes fully down, failing fast to preserve Node.js event loop resources.
- **Asynchronous Ingestion (Queue)**: For a true 10k RPS firehose, consider accepting the request synchronously (return 202 Accepted) and placing it onto an Apache Kafka or RabbitMQ topic. Background workers pull from the queue and write to the DB at a controlled pace.

## 10k RPS design sketch (infra & cost ballpark)
- **Load Balancer**: AWS ALB or Nginx ($30-$100/mo).
- **Compute**: 10-15 stateless Node.js containers orchestrated by Kubernetes (EKS/GKE) or AWS Fargate. Node.js is fast but event-loop blocking can occur; scaling horizontally is cheap (~$200/mo).
- **Cache**: Redis Cluster (ElastiCache / MemoryDB) for Rate Limiting and Idempotency ($150/mo).
- **Database**: Amazon Aurora PostgreSQL Serverless or DynamoDB ($200-$500/mo depending on storage/read/write units).
- **Total Estimated Infra**: ~$600 - $1,000 / month.
