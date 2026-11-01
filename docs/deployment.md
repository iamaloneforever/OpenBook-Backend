# Deployment guide

## Docker Compose

Prepare `.env` using the [configuration reference](configuration.md). Set a nonempty database password, two independent signing secrets with at least 32 characters, the canonical public API URL, and the allowed browser origins.

```sh
cp .env.example .env
# Edit .env before continuing.
docker compose up --build -d
```

Compose starts PostgreSQL, waits for database health, applies migrations in a separate service, and then starts the API. The container runs the compiled application as the unprivileged `node` user. PostgreSQL is reachable only on the Compose network; the API publishes port 5000.

Use these commands to inspect startup:

```sh
docker compose ps
docker compose logs --tail=100 migration app
```

The application container sets `NODE_ENV=production`, including when accessed on localhost. Its refresh cookies therefore require HTTPS in browser use. Terminate TLS at a reverse proxy and set `SOCIAL_PUBLIC_URL` to the external API URL.

## Storage and recovery

Compose persists PostgreSQL in `postgres_data` and uploads in `uploads_data`. Include both volumes in backups. Restore them together so database references still point to the correct uploaded files. Test restores in a separate environment before relying on a backup.

The API does not automatically remove files after successful book deletion or file replacement. Monitor upload growth and implement a retention process that checks database references before removing files. Failed upload validation and failed downstream requests remove the files created by that request.

Do not delete the database or upload volumes during a routine upgrade. `docker compose down` stops the services while keeping named volumes; adding `--volumes` deletes stored data.

## Production operations

1. Build and verify an immutable application image using the committed lockfile. Run the test suites before release.
2. Back up PostgreSQL and uploads. Apply `prisma migrate deploy` once per release before accepting traffic on the new application version.
3. Terminate HTTPS at the edge. Restrict database access and configure request limits, connection timeouts, and upload/storage quotas at the proxy and infrastructure layers.
4. Keep secrets outside images and source control. Configure the exact browser origins and canonical public API URL.
5. Monitor failed authentication, rate-limit responses, RSS fetch failures, disk usage, database health, and backup completion. Avoid logging credentials, cookies, bearer tokens, or private request bodies.

The application's cache and throttler storage are local to each process. Multi-instance deployments need a shared limiter or an edge policy for deployment-wide limits. Express does not trust forwarded IP headers by default; a reverse proxy is therefore the apparent client for rate limiting. Configure a reviewed proxy trust policy for the actual network topology before relying on per-client IP limits. Do not enable blanket trust of client-supplied forwarded headers.

The root endpoint confirms the HTTP process is responding; it does not check database readiness. Use database and infrastructure probes alongside it.
