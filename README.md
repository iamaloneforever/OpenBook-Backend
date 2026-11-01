# OpenBook Backend

OpenBook is a self-hosted REST API for personal libraries, reading progress, reading lists, and reading statistics. An optional social layer provides public profiles, short posts, interactions, and RSS publishing. Private RSS and Atom subscriptions can be mixed into a user's feed without creating a public profile.

The backend uses NestJS, PostgreSQL, Prisma, and Argon2. Authentication uses short-lived JWT access tokens and rotating refresh cookies. This repository contains the API; it does not include a web client.

## Requirements

- Node.js 26.x and npm 11 or later; `.nvmrc` specifies the supported Node major.
- PostgreSQL 16 or later.
- Docker Compose, if using the container deployment.

## Local development

```sh
nvm use
npm ci
cp .env.example .env
```

Edit `.env` with a reachable PostgreSQL database, distinct signing secrets, and the exact origins of your browser clients. Generate each secret separately:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Then generate the database client, apply the migrations, and start the API:

```sh
npm run prisma:generate
npx prisma migrate deploy
npm run start:dev
```

The default address is `http://localhost:5000`. `GET /` returns `Hello World!`. Use the [configuration reference](docs/configuration.md) for environment variables and browser authentication requirements.

## API capabilities

| Area | Routes | Access |
| --- | --- | --- |
| Authentication | `/auth/signup`, `/auth/login`, `/auth/refresh`, `/auth/logout` | Public entry points; bearer token required for logout |
| Personal library | `/book`, `/book/:id`, progress, ratings, tags, and EPUB downloads | Authenticated; individual resources require ownership |
| Trending books | `/book/top/trending` | Public metadata; excludes physical addresses and digital sources |
| Reading lists | `/read-list` and nested book membership | Authenticated; owner only |
| Statistics | `/user`, dashboard, summary, monthly statistics, and streak | Authenticated; current account |
| Social | `/social/me`, profiles, posts, interactions, and feed | Authenticated; visibility and blocking rules apply |
| Public social and RSS | `/social/public/*`, `/social/rss` | Explicitly public profiles and their posts |
| RSS subscriptions | `/social/rss/subscriptions`, `/social/rss/entries/:id/read` | Authenticated; private to the subscribing account |

See the [core API reference](docs/api.md) and [social and RSS reference](docs/social-api.md) for requests, response formats, and privacy behavior. Uploaded EPUBs are downloaded through `GET /book/:id/file`; their storage paths are not public URLs.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
```

The repository also includes a Postman collection with functional and security assertions, local upload fixtures, and an environment template:

```sh
npm run test:postman
```

The Postman run requires a running API connected to a disposable database. PostgreSQL integration tests require a dedicated database named `openbook_social_test`. Follow [the testing guide](docs/testing.md) before running either suite.

## Deployment and security

The [deployment guide](docs/deployment.md) covers Docker Compose, migrations, persistent storage, TLS, and backups. The [security policy](SECURITY.md) describes the implemented controls, compatibility changes, and operational limits. Current audit evidence is recorded in [dependency security status](docs/dependency-security.md).

This project is private and marked `UNLICENSED` in `package.json`; no open-source license grant is included.
