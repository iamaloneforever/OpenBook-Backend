# Testing guide

## Local checks

Use the Node version specified by `.nvmrc`. Install the locked dependencies and generate Prisma before checking the application:

```sh
nvm use
npm ci
npm run prisma:generate
npm run typecheck
npm run lint
npm test
npm run test:e2e
```

`typecheck` runs both configured TypeScript compilers. Lint checks authored sources without editing them. Unit tests include HTTP security, cookie flags, input validation, private caches, authentication rotation, upload signatures, private file streaming, RSS network policy, and parser behavior.

The end-to-end suite includes controller tests and a smoke test that launches `dist/main.js` in production mode. `test:e2e` builds that artifact first. These checks need permission to open local HTTP listeners. The reading-streak checks additionally use `DATABASE_URL`: they skip when it is unset or the database is unreachable. To include them, point `DATABASE_URL` at a migrated disposable test database. A passing run with skipped streak checks does not verify database-backed reading statistics.

## Isolated PostgreSQL integration tests

Create a dedicated database named `openbook_social_test`. Never point this suite at development or production data.

```sh
docker run --name openbook-test-db --detach \
  -e POSTGRES_USER=test \
  -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=openbook_social_test \
  -p 127.0.0.1:55432:5432 postgres:16-alpine

export SOCIAL_TEST_DATABASE_URL='postgresql://test:test@127.0.0.1:55432/openbook_social_test'
DATABASE_URL="$SOCIAL_TEST_DATABASE_URL" npx prisma migrate deploy
npm run test:social
```

Wait for `docker exec openbook-test-db pg_isready -U test` to succeed before applying migrations. The suite uses real PostgreSQL transactions, JWT authentication, controllers, validation, and visibility policies. External feed downloads use controlled fixtures. Fixture accounts are removed after each test.

## Postman API regression suite

Import both files into the Postman desktop application:

- `postman/collections/openbook.postman_collection.json`
- `postman/environments/local.postman_environment.json`

Select the local environment, set `baseUrl` to an isolated running API, and set Postman's working directory to the repository root. The working directory resolves the committed files in `postman/fixtures/`. Run the entire collection in order, once per run. The requests create unique usernames and profile handles, store tokens in temporary collection variables, and send refresh cookies explicitly with the cookie jar disabled.

The suite creates two accounts, books, reading lists, and social profiles/posts. It verifies ownership between accounts, login validation, refresh rotation and replay rejection, no-store and security headers, private tag counts, file access, social visibility, and rejection of private-network RSS URLs. It uses no external RSS service.

For the command-line runner, `npm ci` installs the pinned official Postman CLI package. Start a separate test API against the migrated disposable database:

```sh
export DATABASE_URL="$SOCIAL_TEST_DATABASE_URL"
export JWT_ACCESS_SECRET='local-postman-access-secret-at-least-32-characters'
export JWT_REFRESH_SECRET='local-postman-refresh-secret-at-least-32-characters'
NODE_ENV=test PORT=5000 npm run start:prod
```

In another terminal, from the repository root:

```sh
npm run test:postman

# Override the URL if the test server uses a different port:
npm run test:postman -- --env-var baseUrl=http://127.0.0.1:5059

# When the target sets production Secure cookies:
npm run test:postman -- --env-var expectSecureCookies=true
```

Local collection execution does not require a Postman login; publishing run details to Postman cloud does. The CLI returns a nonzero status when a request or assertion fails. The collection requires a fresh rate-limit window; wait at least 60 seconds or restart the isolated API between runs. The runner supports report options; see the [official collection command reference](https://learning.postman.com/docs/postman-cli/postman-cli-collections).

The final folder deletes the posts, reading lists, and books created by the run and revokes both refresh sessions. Accounts, social profiles, unused tag records, and successful uploads can remain because the API does not expose account deletion or automatic file retention. A failed run may also leave test data. Run against a disposable database and upload directory; reset that environment after verification. Do not export populated token variables or cookies into source control.

Postman CLI binaries require a supported desktop/Linux environment; Alpine Linux is not supported. The Docker test image runs the Vitest suites; the Postman CLI runs separately on the CI Ubuntu runner.

## Continuous integration

The workflow checks lint, type checking, unit tests, compiled end-to-end behavior, social/RSS, chat, and reading-list PostgreSQL integration, and container builds. It provisions separate test databases and Redis for cross-instance chat checks. It starts an isolated compiled API against the CI PostgreSQL service and runs the main Postman collection before shutting the process down. The optional live public-catalog collection runs separately. CI fixtures use test-only credentials. The workflow runs for pull requests and pushes to `main`; a push to another branch alone does not trigger it.

## Verification record — 2026-10-31

The hardening changes were checked with Node 26.13.0:

| Check | Result |
| --- | --- |
| Type checking | Both configured compilers passed |
| Lint | Passed |
| Unit and HTTP regression tests | 334 passed |
| Compiled end-to-end tests | 10 passed |
| PostgreSQL social/RSS integration | 30 passed on the dedicated PostgreSQL 17 test instance |
| Official Postman CLI 1.83.0 | 126 requests and 281 assertions passed; exit code 0 |
| Production container | Built successfully; collection passed with Secure cookies, dropped capabilities, and the unprivileged runtime |
| npm dependency audit | Zero known advisories in the checked lockfile |

These results describe this revision and the test environment, rather than guaranteeing future dependency or deployment safety. Refresh them after material changes.

## Chat integration tests

The chat suite uses a dedicated `openbook_chat_test` PostgreSQL database and a dedicated Redis-compatible test service. It requires both endpoints; it does not silently skip cross-instance checks when Redis is missing.

```sh
docker run --name openbook-chat-test-db --detach \
  -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=openbook_chat_test \
  -p 127.0.0.1:55433:5432 postgres:16-alpine

docker run --name openbook-chat-test-redis --detach \
  -p 127.0.0.1:56380:6379 redis:8-alpine \
  redis-server --save '' --appendonly no

export CHAT_TEST_DATABASE_URL='postgresql://test:test@127.0.0.1:55433/openbook_chat_test'
export CHAT_TEST_REDIS_URL='redis://127.0.0.1:56380/15'
DATABASE_URL="$CHAT_TEST_DATABASE_URL" npx prisma migrate deploy
npm run test:chat
```

Wait for both services to be ready before applying migrations and running tests. Test usernames are unique and fixture accounts are removed afterward. The suite refuses database names other than `openbook_chat_test`. Use a dedicated Redis/Valkey instance rather than a production endpoint; its expiring `openbook:chat:*` keys and Pub/Sub channels belong to the tests.

These tests use real Socket.IO clients and PostgreSQL transactions. They cover concurrent conversation creation, outsider denial, history pagination, reconnect recovery, retry deduplication, token expiry, frame limits, blocked sends, shared REST/WebSocket budgets, account-deletion cascades, and two-instance Redis delivery. Redis shutdown is also checked for safe failure and absence of unhandled rejections.

The Postman collection now includes REST chat tests in addition to the existing API checks. Chat messages remain with the disposable fixture accounts after a Postman run. The client protocol and deployment choices are documented in [the chat API guide](chat-api.md).

## Chat verification record — 2026-11-01

| Check | Result |
| --- | --- |
| Unit and HTTP regression tests | 356 passed |
| Compiled end-to-end tests, including database-backed streak checks | 10 passed |
| Existing social/RSS integration | 30 passed |
| PostgreSQL and WebSocket chat integration | 14 passed, including two-instance Redis fanout |
| Expanded Postman collection | 148 requests and 336 assertions passed; exit code 0 |
| Compiled application smoke test | Authenticated WebSocket delivery and persistent history passed with Redis enabled |
| Type checks, lint, and build | Passed |
| Optional Redis Compose overlay | Configuration validated |
| Dependency audit | Zero known advisories |

The local integration environment used PostgreSQL 17 and Valkey 9 as a dedicated Redis-compatible service. The CI workflow provisions PostgreSQL 16 and Redis 8. The chat migration was applied only to disposable local test databases during this verification.

## Rich-message and presence checks

`test:chat` now also covers multi-device/cross-instance online leases, typing privacy, blocked presence, public catalog attachments, rich-message retry identity, same-conversation reply authorization, and spoiler masking. Public provider requests use controlled fixtures in this suite. The optional `npm run test:postman:catalog` collection performs live public catalog requests against an isolated running API; it is intentionally separate from ordinary CI. See [the rich-message guide](chat-rich-messages.md) for its setup.

## Rich-message verification record — 2026-11-01

| Check | Result |
| --- | --- |
| Unit and HTTP regression tests | 402 passed |
| Compiled end-to-end tests | 10 passed |
| Existing social/RSS integration | 30 passed |
| PostgreSQL, WebSocket, and Redis chat integration | 22 passed |
| Main Postman collection | 161 requests and 368 assertions passed; exit code 0 |
| Optional live public-catalog collection | 4 requests and 8 assertions passed against Open Library; exit code 0 |
| Compiled application smoke test | Rich WebSocket delivery, a real Open Library book snapshot, spoiler-safe reply excerpts, online presence, typing, and persistent history passed |
| Type checks, lint, and build | Passed |
| Dependency audit | Zero known advisories |

The suites passed 464 tests in total on Node 26.13.0, with PostgreSQL 17 and Valkey 9 for the database integrations. Both chat migrations were applied to disposable databases. Google Books search and preview behavior was verified with controlled HTTP fixtures; live Google requests were not run because no API key was configured. Public catalog tests do not search the private OpenBook library.

## Reading-list integration tests

`npm run test:read-list` requires a migrated, disposable database named `openbook_read_list_test`. It refuses other database names. Create it on an isolated PostgreSQL service and run:

```sh
docker run --name openbook-read-list-test-db --detach \
  -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=openbook_read_list_test \
  -p 127.0.0.1:55434:5432 postgres:16-alpine

# Wait until this succeeds before applying migrations:
docker exec openbook-read-list-test-db pg_isready -U test

export READ_LIST_TEST_DATABASE_URL='postgresql://test:test@127.0.0.1:55434/openbook_read_list_test'
DATABASE_URL="$READ_LIST_TEST_DATABASE_URL" npx prisma migrate deploy
npm run test:read-list
```

The suite uses real PostgreSQL and JWT-authenticated HTTP with the production validation configuration. It covers visibility, discovery, safe metadata projections, saved-list access revocation, collaborator roles, public book snapshots, notes, bounded pagination, 500-entry atomic ordering, concurrent edits, duplication, blocks, database source constraints, and deletion cascades. Public catalog responses are controlled fixtures; Redis is optional for these list tests. Fixture accounts and their records are removed after each test.

CI provisions this database separately from the social and chat databases. The main Postman collection also exercises playlist-style lists without external catalog requests and removes its copied list and collaborative entry before normal cleanup.

## Reading-list verification record — 2026-11-01

| Check | Result |
| --- | --- |
| Unit and HTTP regression tests | 391 passed |
| Compiled end-to-end tests | 10 passed, including database-backed streak checks |
| Social/RSS integration | 30 passed |
| Chat/WebSocket/Redis integration | 22 passed after sharing the catalog module |
| Reading-list PostgreSQL/HTTP integration | 30 passed, including concurrent edits and a 500-entry atomic reorder |
| Expanded main Postman collection | 191 requests and 437 assertions passed; exit code 0 |
| Live Open Library check | Search, selected-book addition, stored preview, and title-sorted retrieval passed through the compiled API |
| Existing-data upgrade | Legacy memberships, deterministic order, contributor IDs, private visibility, and revision zero preserved |
| Type checks, lint, and build | Passed |

The final suites passed 483 tests on Node 26.13.0 with disposable PostgreSQL 17 databases and Valkey 9. Existing mocked reading-list service checks were revised for service-level authorization, and real database/HTTP checks now exercise the full list lifecycle. The migration was applied to test databases only; deployment databases require `npx prisma migrate deploy` before starting the updated application. No runtime dependency was added for this feature.
