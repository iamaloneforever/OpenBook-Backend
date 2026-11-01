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

The end-to-end suite includes controller tests and a smoke test that launches `dist/main.js` in production mode. `test:e2e` builds that artifact first. These checks need permission to open local HTTP listeners. They do not require a populated application database; the database integration suite below does.

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

The workflow checks lint, type checking, unit tests, compiled end-to-end behavior, PostgreSQL integration, and container builds. It starts an isolated compiled API against the CI PostgreSQL service and runs the Postman collection before shutting the process down. CI fixtures use test-only credentials.

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
