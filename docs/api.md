# Core API reference

The examples use `http://localhost:5000`. Routes have no version prefix. Protected requests require `Authorization: Bearer <accessToken>`. JSON requests must use `Content-Type: application/json`; unexpected properties are rejected.

## Authentication

| Method | Route | Request | Successful response |
| --- | --- | --- | --- |
| POST | `/auth/signup` | `username`, `password` | 201; safe user fields and `accessToken`; refresh cookie |
| POST | `/auth/login` | `username`, `password` | 201; `accessToken`; refresh cookie |
| POST | `/auth/refresh` | Current `refreshToken` cookie | 201; new `accessToken`; rotated refresh cookie |
| POST | `/auth/logout` | Bearer token | 201; revokes refresh session and expires cookies |

Signup usernames accept 3–64 ASCII letters, digits, underscores, periods, and hyphens. They are case-sensitive. Passwords accept 8–128 characters. Login accepts existing usernames of 1–64 characters and passwords of 1–128 characters.

```sh
curl -i -c cookies.txt http://localhost:5000/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"username":"reader","password":"use-a-unique-random-password"}'

curl -i -b cookies.txt -c cookies.txt \
  -X POST http://localhost:5000/auth/refresh
```

Keep `cookies.txt` private. Each successful refresh consumes the previous token. A new login replaces the previous refresh session. Logout does not immediately invalidate already issued access tokens. See [configuration](configuration.md) for cookie flags, lifetimes, CORS, and browser Origin requirements.

## Books

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/book` | Paginated current-account library |
| POST | `/book` | Create a book using JSON or multipart form data |
| GET | `/book/:id` | Book details with tags, progress, and statistics |
| PUT | `/book/:id` | Update book fields; the book type cannot change |
| DELETE | `/book/:id` | Delete the book |
| GET | `/book/:id/file` | Download an owned uploaded EPUB as an attachment |
| GET | `/book/:id/progress` | Current progress or default progress values |
| POST | `/book/:id/progress` | Set `currentPage`, with optional `totalPages` and `status` |
| POST | `/book/:id/rate` | Set the current account's integer rating, `value: 1` through `5` |
| POST | `/book/:id/tags` | Replace tags using `{ "tags": [...] }` |
| PUT | `/book/:id/tags/add` | Add tags |
| DELETE | `/book/:id/tags` | Remove the named tags |
| GET | `/book/tags/all` | Current-account tags and account-specific usage counts |
| GET | `/book/tags/search` | Current-account books matching any supplied tag |
| GET | `/book/top/trending` | Public paginated book metadata |

All routes except trending require a bearer token. Individual book operations also require ownership. An inaccessible book returns 404. IDs use CUID format.

Create a physical book:

```json
{
  "title": "The Left Hand of Darkness",
  "author": "Ursula K. Le Guin",
  "type": "PHYSICAL",
  "physicalBook": {
    "address": "Private shelf location",
    "city": "Example City",
    "country": "Example Country"
  }
}
```

Create a digital book with a URL:

```json
{
  "title": "A Digital Book",
  "author": "Example Author",
  "type": "DIGITAL",
  "digitalBook": { "url": "https://example.com/book.epub" }
}
```

Common optional fields are `description`, `isbn`, `publishedAt`, and `coverUrl`. URLs must be absolute HTTP(S) URLs without embedded credentials. Digital books require either a URL or an EPUB upload. Physical books require `physicalBook`; physical and digital source objects cannot be combined.

For a file upload, submit multipart fields `title`, `author`, `type=DIGITAL`, and `file`. An optional `cover` file can be included. `file` must use `application/epub+zip`. Use JSON when supplying nested source objects; multipart nested JSON strings are not automatically decoded into objects.

```sh
curl http://localhost:5000/book \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F 'title=Uploaded Book' \
  -F 'author=Example Author' \
  -F 'type=DIGITAL' \
  -F 'file=@book.epub;type=application/epub+zip'
```

Use `/book/<returned-id>/file` to retrieve an upload. `digitalBook.filePath` is a storage reference, not a public download URL. Cover image URLs under `/uploads/books/covers/` are public.

Set reading progress:

```json
{ "currentPage": 25, "totalPages": 100, "status": "READING" }
```

Statuses are `READING`, `COMPLETED`, `PAUSED`, and `DROPPED`. The page cannot exceed the total. Provide `totalPages` when no valid total exists yet. Once a book is completed, subsequent updates preserve completion. Reading updates the account's streak; first completion updates completion statistics.

### Filtering and pagination

`GET /book` accepts `q`, `author`, `minRating`, `maxRating`, `sort`, `order`, `page`, and `limit`. Search sort values are `title`, `author`, `createdAt`, and `averageRating`; order is `asc` or `desc`. Ratings range from 0 to 5.

Pages are integers from 1 to 1,000,000; limits are integers from 1 to 100. Defaults are page 1 and limit 10. Public trending uses the same pagination and accepts `sort=rating`, `reads`, or `trending`.

List responses use:

```json
{
  "data": [],
  "meta": { "total": 0, "page": 1, "limit": 10, "totalPages": 0 }
}
```

Tag search accepts one `tags` value or repeated query parameters, for example `/book/tags/search?tags=fiction&tags=history`. At most 30 tags are accepted, each at most 50 characters. Tags are normalized to lowercase and trimmed. Tag writes reject duplicate normalized values.

## Reading lists

| Method | Route | Request |
| --- | --- | --- |
| GET | `/read-list` | `page`, `limit`, `q`, and `scope=owned\|saved\|collaborating\|all` |
| GET | `/read-list/discover` | Search public lists with `q`, `page`, and `limit` |
| POST | `/read-list` | Required `title`; optional `description`, `coverUrl`, and `visibility` |
| GET | `/read-list/:id` | Metadata, first 100 ordered items, statistics, role, revision, and counts |
| PATCH | `/read-list/:id` | Owner updates details/visibility; optional `expectedRevision` |
| DELETE | `/read-list/:id` | Deletes the list |
| POST | `/read-list/:id/books` | `{ "bookId": "<owned-book-id>" }` |
| DELETE | `/read-list/:id/books/:bookId` | Removes the membership |
| GET/POST | `/read-list/:id/items` | Paginated entries or add a library book/public catalog card |
| PATCH | `/read-list/:id/items/order` | Complete `itemIds` order and required `expectedRevision` |
| PATCH/DELETE | `/read-list/:id/items/:itemId` | Edit an entry note or remove it |
| GET/POST | `/read-list/:id/collaborators` | Owner reads or grants `VIEWER`/`EDITOR` access |
| DELETE | `/read-list/:id/collaborators/:userId` | Owner revokes access; collaborator can leave |
| POST/DELETE | `/read-list/:id/save` | Save or unsave an accessible list |
| POST | `/read-list/:id/duplicate` | `{ "title": "My copy" }`; creates a private copy |

All reading-list routes require authentication. Lists default to `PRIVATE`; `UNLISTED` lists can be opened by ID, and `PUBLIC` lists appear in discovery. Owners control details, visibility, deletion, and collaborator grants. Editors curate entries; viewers can read. Social blocks restrict access in either direction. Library additions require a book owned by the caller; shared responses exclude private book sources and reading activity. List titles are unique per account. Duplicate entries and stale revisions return 409. See [the reading-list guide](reading-lists.md) for payloads, migration behavior, and limits.

## Statistics

The following authenticated GET routes report the current account's data:

| Route | Result |
| --- | --- |
| `/user` | Persistent reading statistics; initialized on first access |
| `/user/dashboard` | Combined statistics, summary, monthly data, books, and lists |
| `/user/book-stats` | Library and reading status statistics |
| `/user/read-list-stats` | Reading-list statistics |
| `/user/summary` | Completed books, books in progress, and completed pages |
| `/user/monthly-stats` | Reading completions for the current year |
| `/user/streak` | Current and longest reading streak |

Some GET responses have an internal per-account cache lasting 3–6 seconds. Writes may take that long to appear in a cached list or dashboard. HTTP responses still use `Cache-Control: no-store` to prevent browser and intermediary persistence.

## Errors

| Status | Meaning |
| --- | --- |
| 400 | Invalid input, unknown fields, invalid pagination, or unsupported book state |
| 401 | Missing, invalid, expired, replayed, or revoked credentials |
| 403 | Browser write from an untrusted origin, insufficient list editing rights, or blocked chat send |
| 404 | Missing resource or resource inaccessible to the caller |
| 409 | Unique constraint, duplicate membership, stale list revision, or reused message ID with changed content |
| 413 | Body or file exceeds its configured limit |
| 415 | Uploaded content does not match the allowed signature/MIME combination |
| 429 | Rate limit or RSS refresh cooldown |
| 500 | Unexpected server failure; internal details are not returned |
| 502 | External RSS download or refresh failed |
| 503 | Temporary transaction or configured chat infrastructure failure |

Validation errors normally contain `statusCode`, `message`, and `error`. The `message` can be an array for DTO validation errors. Clients should branch on HTTP status and documented fields, rather than matching human-readable error text.

See the [social and RSS reference](social-api.md) for social routes and cursor-based feed pagination.

## Private chat

Authenticated REST endpoints under `/chat/conversations` create and list direct conversations, persist messages, and page through history. Live delivery uses the authenticated Socket.IO `/chat` namespace. See [the chat API reference](chat-api.md) for request bodies, events, retry safety, and reconnect recovery.
