# Social profiles, feeds, and RSS

OpenBook provides a backend API for short public posts and private RSS subscriptions. Existing accounts remain private until they explicitly enable a social profile. No private books, addresses, downloads, credentials, or reading history are published automatically.

## Setup

Use Node 26 LTS and a supported PostgreSQL installation:

```sh
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
```

Configure the existing authentication secrets and `DATABASE_URL`. Set `SOCIAL_PUBLIC_URL` to the externally reachable API base URL, for example `https://api.example.com` or `https://example.com/api`. It defaults to `http://localhost:5000`. URLs with credentials, query parameters, or fragments are rejected at startup. Docker Compose forwards this variable.

Both migrations are additive. Existing users have no social profile and cannot publish until they opt in. The schema adds profiles, posts, follows, likes, bounded view history, blocks, RSS subscriptions, and imported entries, with foreign keys, unique constraints, indexes, and cascading account deletion.

## Authentication and profiles

All `/social` routes require `Authorization: Bearer <access-token>` except the explicitly public `/social/public/*`, `/social/rss`, and `/social/rss/profiles/:handle` routes. Personalized responses use `Cache-Control: private, no-store`; public social responses also disable caching so visibility changes take effect on subsequent requests.

Create or update your profile:

```http
PUT /social/me
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "handle": "reader",
  "displayName": "A Reader",
  "bio": "Books, ideas, and notes.",
  "isPublic": true,
  "personalizeFeed": true
}
```

`handle` and `displayName` are required on each update. Handles are normalized to lowercase and contain 3–30 ASCII letters, digits, or underscores. Display names allow 1–80 characters and bios up to 160. Optional `avatarUrl` accepts HTTPS; `websiteUrl` accepts HTTP(S). Credentials in these URLs are rejected. Set either URL to `null` to clear it. These URLs are stored, never fetched by the server.

Omitting `isPublic` on initial creation defaults to `false`; omitting optional fields on later updates preserves them. A conflicting handle returns `409`. `GET /social/me` returns `{ "profile": null }` before profile creation, or `{ "profile": { ... } }` afterward, including privacy and personalization settings.

Setting `isPublic: false` hides the profile and all its posts, replies, likes, and follow counts from public results. Its posts remain stored so the owner can edit or delete them. Re-enabling the profile republishes its existing posts. RSS subscriptions remain private and usable with or without a public profile.

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/social/me` | Own social profile and settings |
| PUT | `/social/me` | Create or update own profile |
| GET | `/social/profiles?q=reader&limit=20` | Search public, unblocked profiles |
| GET | `/social/profiles/:handle` | Profile, visible counts, `followedByMe` |
| GET | `/social/profiles/:handle/posts` | Profile's root posts, paginated |
| PUT / DELETE | `/social/profiles/:handle/follow` | Follow or unfollow, idempotently |
| PUT / DELETE | `/social/profiles/:handle/block` | Block or unblock, idempotently |

Blocking removes follows in both directions and prevents the two accounts from seeing or interacting with each other through authenticated social endpoints. Unblocking does not restore follows. Blocks do not make a public post confidential: anonymous public endpoints and RSS remain accessible to everyone. Use the profile's privacy setting to stop publishing.

## Posts and replies

```http
POST /social/posts
Authorization: Bearer <access-token>
Content-Type: application/json

{ "content": "Reading something interesting about #Science today." }
```

Posts are plain text, 1–280 characters after trimming. The server extracts up to five distinct Unicode hashtags, normalizes them, and rejects unsupported control characters. Authors and tags cannot be supplied by clients. The authenticated account supplies authorship.

To reply, include `parentId` with the original post's ID. Threads support one level of replies. A reply's original post must remain visible. Only the author can edit or delete a post; deletes also remove that post's replies, likes, and view records.

| Method | Route | Behavior |
| --- | --- | --- |
| POST | `/social/posts` | Create a root post or reply |
| GET | `/social/posts/:id` | Visible post and interaction counts |
| PATCH | `/social/posts/:id` | Edit own `content` and derived hashtags |
| DELETE | `/social/posts/:id` | Delete own post and its thread |
| GET | `/social/posts/:id/replies` | Paginated visible replies |
| PUT / DELETE | `/social/posts/:id/like` | Like or unlike, idempotently |
| POST | `/social/posts/:id/views` | Explicitly record a view for personalization |

Concurrent likes and follows cannot create duplicate relationships. Compound database constraints enforce uniqueness; serializable transactions retry serialization conflicts up to three times. Persistent contention returns a retryable `503`.

The view endpoint returns `{ "recorded": false }` when personalization is disabled. A feed read itself does not record views. Clients should record a view only when a post is actually seen. View records are deduplicated per post; recording a view retains at most the latest 100 views within 30 days for that account. Disabling personalization deletes stored social view history. Manual likes, follows, posts, and RSS read states remain intact.

## Feeds and pagination

```http
GET /social/feed?mode=for-you&limit=20
Authorization: Bearer <access-token>
```

Modes:

- `recent`: visible public root posts plus the viewer's private RSS entries, newest first.
- `following`: own root posts, followed accounts' root posts, and subscribed RSS entries, newest first.
- `for-you` (default): a ranked mix of visible root posts and the viewer's private RSS entries. Accounts without an enabled public profile, or with personalization disabled, receive `recent` instead; the response reports the effective mode.

Feed responses contain `{ "data": [...], "nextCursor": "..." | null, "mode": "..." }`. Social items have `type: "post"`, `content`, `author`, `tags`, timestamps, `likeCount`, `replyCount`, and `likedByMe`. Imported items have `type: "rss"`, `title`, `summary`, `url`, `tags`, `publishedAt`, `createdAt` (publication date), `readAt`, and `subscription: { id, title }`.

**Render every social text field and imported title/summary as text, never as executable HTML.** Imported summaries are converted to text and active markup is discarded, but plain text can legitimately contain angle brackets. Item URLs allow only HTTP(S), and are untrusted external links.

Request the next page with the same route and mode, passing `cursor=<URL-encoded nextCursor>`. Page sizes are 1–50, default 20. Cursors are compressed to fit common proxy URL limits, HMAC-signed, scoped to account and route/mode, and expire after 15 minutes; invalid or expired cursors return `400`, after which the client starts a fresh feed request.

Chronological pages use timestamp/ID keysets and a fixed cutoff. Ranked pages preserve the initial ranked order in a bounded signed cursor, then recheck visibility and subscription ownership on every page. Newly hidden, blocked, deleted, or unsubscribed items disappear from subsequent pages. New posts and imports appear after starting a new feed request.

### Ranking

The scoring function is deterministic and isolated in `src/social/feed-ranking.ts`. It combines:

- Freshness with a 24-hour half-life.
- Followed authors and subscribed RSS sources.
- Author and hashtag affinity from recent likes, explicit views, authored posts, and RSS read actions.
- Tags on the viewer's recently updated reading progress and highly rated books, used privately as interests.
- Capped logarithmic engagement, penalties for seen/liked/read items, and a soft preference for alternating authors or RSS sources.

Activity signals use a rolling 30-day window and a seven-day half-life. Per-author and per-tag weights are capped to prevent repeated activity from dominating. Queries use bounded samples: 100 recent likes/views/RSS reads, 50 recent authored posts/reading updates/high ratings, and 500 followed authors for affinity. Reading titles, addresses, files, and history never become feed items or response fields.

Candidate retrieval selects up to 200 recent public posts, 50 followed-author posts, 50 interest-matching posts, and 100 private RSS entries, all published in the last 30 days. After deduplication and ranking, a session contains at most 300 items. Start a new session to refresh recommendations; use chronological modes to browse older history. This is an explainable initial ranking model, with isolated scoring code for future tuning.

## Public sharing and RSS publishing

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/social/public/profiles/:handle` | Public profile and visible counts |
| GET | `/social/public/profiles/:handle/posts` | Paginated public root posts |
| GET | `/social/public/posts/:id` | Public post or visible reply |
| GET | `/social/rss` | RSS 2.0, latest 50 public root posts |
| GET | `/social/rss/profiles/:handle` | RSS 2.0, latest 50 public root posts for a profile |

RSS publishing returns `application/rss+xml; charset=utf-8`. XML text is escaped, and descriptions are also escaped for readers that interpret them as HTML. Stable public post URLs serve as GUIDs. Canonical links use `SOCIAL_PUBLIC_URL`, never the incoming Host or forwarded headers. Imported subscriptions never appear in public feeds or RSS.

A disabled, missing, or inaccessible profile/post returns `404`.

## Private RSS/Atom subscriptions

```http
POST /social/rss/subscriptions
Authorization: Bearer <access-token>
Content-Type: application/json

{ "url": "https://example.com/feed.xml" }
```

Subscription creation validates and fetches the feed, imports entries, and returns subscription metadata. Repeating a subscription to the same normalized URL returns the existing subscription without another fetch. An account may keep at most 50 subscriptions and 200 entries per subscription. Entries deduplicate by a SHA-256 hash of the feed GUID/Atom ID, link, or stable text fallback. Reimports preserve existing content and read state.

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/social/rss/subscriptions` | Own subscriptions and refresh status |
| POST | `/social/rss/subscriptions` | Subscribe and import an RSS 2.0 or Atom feed |
| POST | `/social/rss/subscriptions/:id/refresh` | Fetch and import new entries |
| DELETE | `/social/rss/subscriptions/:id` | Unsubscribe and remove imported entries |
| PUT | `/social/rss/entries/:id/read` | Mark an owned imported entry read |

Refresh through the endpoint when the client needs fresh content; there is no background polling worker. A database-backed five-minute cooldown prevents concurrent refreshes across application instances. A failed refresh keeps cached entries and returns `502`; a request during the cooldown returns `429`. Exceeding the subscription cap returns `422`. Subscribe/refresh endpoints also have per-IP limits.

The fetcher permits public HTTP(S) URLs on standard ports, rejects embedded credentials/fragments and local/reserved addresses, checks all DNS answers, pins connections to a validated IP, and preserves TLS certificate verification for the original hostname. Every redirect is validated again, with a maximum of three redirects and no HTTPS downgrade. The entire network operation, including DNS and redirects, has a ten-second deadline.

Imports accept uncompressed UTF-8 XML responses up to 1 MiB. XML is parsed using `saxes`, HTML-to-text conversion uses `htmlparser2`, and DTD/entity declarations and nesting deeper than 32 elements are rejected. No external XML entities, scripts, images, enclosures, or feed-provided URLs are fetched. Future publication dates are clamped to import time. These limits intentionally exclude compressed, legacy-encoded, authenticated, or intranet feeds.

## Verification and deployment

```sh
npm test
npm run typecheck
npm run build
```

For database integration tests, create a **dedicated** database named `openbook_social_test`, migrate it, then run:

```sh
export SOCIAL_TEST_DATABASE_URL="postgresql://test:test@localhost:5432/openbook_social_test"
DATABASE_URL="$SOCIAL_TEST_DATABASE_URL" npx prisma migrate deploy
npm run test:social
```

The suite rejects other database names, creates its own fixture accounts, and removes them afterward. Network policy tests use controlled transports; integration tests use actual PostgreSQL, JWT verification, validation, controllers, and transactions, with external feed downloads stubbed. No internet feed is required for a reproducible test run.

CI runs these integration tests against its PostgreSQL service. Existing authentication, caching, book, and reading-streak checks remain part of the normal suites. Rate limits still use the application's existing per-process storage; use a shared throttler store for a deployment-wide limit across replicas.

Implementation references: [Nest validation](https://docs.nestjs.com/application/validation), [Prisma 7 transactions](https://docs.prisma.io/docs/orm/v7/prisma-client/queries/transactions), [RSS 2.0 specification](https://www.rssboard.org/rss-2-0-11), [saxes](https://github.com/lddubeau/saxes), and [htmlparser2](https://github.com/fb55/htmlparser2).

Current dependency audit evidence is recorded in [dependency security status](dependency-security.md). See the [testing guide](testing.md) for the Postman collection and full verification workflow.
