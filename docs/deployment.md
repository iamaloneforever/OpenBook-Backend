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

The HTTP response cache and general HTTP throttler storage are local to each process. Multi-instance deployments need a shared limiter or an edge policy for deployment-wide HTTP limits. Chat-specific account and provider budgets use Redis when configured. Express does not trust forwarded IP headers by default; a reverse proxy is therefore the apparent client for rate limiting. Configure a reviewed proxy trust policy for the actual network topology before relying on per-client IP limits. Do not enable blanket trust of client-supplied forwarded headers.

The root endpoint confirms the HTTP process is responding; it does not check database readiness. Use database and infrastructure probes alongside it.

## Upgrading chat and reading lists

Apply these migrations, along with any earlier pending migrations, before starting the updated API:

| Migration | Change |
| --- | --- |
| `20261101090000_add_private_chat` | Persistent direct conversations and message history |
| `20261101120000_add_rich_chat_messages` | Stored book previews, quotations, replies, and spoilers |
| `20261101140000_advanced_read_lists` | Visibility, ordered entries, public catalog cards, collaborators, saves, and revisions |

For a host installation, run `npm run prisma:generate`, build the application, and run `npx prisma migrate deploy` with the deployment's `DATABASE_URL` before restarting it. Compose performs migration deployment through its `migration` service.

Existing reading lists retain their IDs and memberships and start as private with revision zero. List responses use safe book metadata, including for owners; clients should fetch private sources and reading progress through the owned-book API. List details embed at most 100 entries, so clients must use item pagination for longer lists. Review [the reading-list upgrade notes](reading-lists.md#upgrade-and-verify) before updating clients.

## WebSocket chat and Redis

Proxy `/socket.io/` with WebSocket Upgrade support. Clients connect to the Socket.IO `/chat` namespace using WSS and the existing access token. Configure the canonical public URL and browser origins before exposing chat.

A single API instance can run without Redis. For multiple instances, set the same private `CHAT_REDIS_URL` on each instance or use the optional Compose overlay:

```sh
docker compose -f docker-compose.yml -f docker-compose.chat-redis.yml up --build -d
```

The overlay keeps Redis off host ports, disables Redis persistence, and applies memory and privilege limits. PostgreSQL stores chat history and belongs in backups. Use separate Redis credentials, network access controls, and TLS when connecting across hosts. See [the chat API guide](chat-api.md) for recovery semantics and failure behavior.
