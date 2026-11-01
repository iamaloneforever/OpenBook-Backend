# OpenBook Backend

OpenBook is a self-hosted REST API for personal libraries, reading progress, reading lists, and reading statistics. An optional social layer provides public profiles, short posts, interactions, and RSS publishing. Private RSS and Atom subscriptions can be mixed into a user's feed without creating a public profile. Private one-to-one chat adds persistent history, online presence, typing indicators, public book search and previews, quoted replies, and spoilers.

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
| Reading lists | `/read-list`, discovery, ordered items, collaborators, saves, and duplication | Authenticated; visibility and collaborator permissions apply |
| Statistics | `/user`, dashboard, summary, monthly statistics, and streak | Authenticated; current account |
| Social | `/social/me`, profiles, posts, interactions, and feed | Authenticated; visibility and blocking rules apply |
| Public social and RSS | `/social/public/*`, `/social/rss` | Explicitly public profiles and their posts |
| Private chat | `/chat/conversations`, message history, and Socket.IO `/chat` | Authenticated participants only |
| RSS subscriptions | `/social/rss/subscriptions`, `/social/rss/entries/:id/read` | Authenticated; private to the subscribing account |

See the [core API reference](docs/api.md) and [social and RSS reference](docs/social-api.md) for requests, response formats, and privacy behavior. The [chat API guide](docs/chat-api.md) covers client events, acknowledgements, reconnect recovery, and optional Redis. See [rich messages and presence](docs/chat-rich-messages.md) for public book catalogs, quotations, and spoiler rendering. Uploaded EPUBs are downloaded through `GET /book/:id/file`; their storage paths are not public URLs.

The [reading-list guide](docs/reading-lists.md) describes playlist-style curation: private, unlisted, or public lists; cover art; ordered library books and public catalog cards; editor/viewer collaboration; saved lists; and private copies. Existing lists remain private after upgrading.

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

The Postman run requires a running API connected to a disposable database. Database integration suites use separate, migrated test databases:

| Command | Database | Additional service |
| --- | --- | --- |
| `npm run test:social` | `openbook_social_test` | None |
| `npm run test:chat` | `openbook_chat_test` | Dedicated Redis-compatible instance |
| `npm run test:read-list` | `openbook_read_list_test` | None |

Follow [the testing guide](docs/testing.md) for connection variables and isolated setup. The optional `npm run test:postman:catalog` checks live public book providers against a running API.

## Deployment and security

The [deployment guide](docs/deployment.md) covers Docker Compose, migrations, persistent storage, TLS, and backups. The [security policy](SECURITY.md) describes the implemented controls, compatibility changes, and operational limits. Current audit evidence is recorded in [dependency security status](docs/dependency-security.md).

When upgrading an existing deployment, apply all pending migrations before starting the new API. Existing reading lists remain private; list responses now use metadata-only book projections. See the [reading-list upgrade notes](docs/reading-lists.md#upgrade-and-verify) for client compatibility details.

This project is private and marked `UNLICENSED` in `package.json`; no open-source license grant is included.
