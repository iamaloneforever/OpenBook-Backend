# Configuration reference

Copy `.env.example` to `.env` for local development. Deployment secrets should be injected by the deployment platform or a secret manager. Never commit populated environment files or exported Postman credentials.

## Environment variables

| Variable | Required | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | Yes, for database operations | PostgreSQL connection string used by Prisma and the API. Percent-encode reserved characters in credentials. |
| `JWT_ACCESS_SECRET` | Yes | Access-token signing secret. Must differ from the refresh secret. Production requires at least 32 non-padding characters; use a randomly generated value. |
| `JWT_REFRESH_SECRET` | Yes | Independent refresh-token signing secret, subject to the same production minimum. |
| `NODE_ENV` | Set explicitly | `development`, `test`, or `production`. Production enables the `Secure` cookie flag and enforces the signing-secret minimum. |
| `PORT` | No | TCP port, from 1 to 65535. Default: `5000`. |
| `CORS_ORIGINS` | No | Comma-separated exact HTTP(S) browser origins, such as `https://reader.example.com`. Empty means no cross-origin browser access. Paths, wildcards, trailing slashes, and empty entries are rejected at startup. |
| `SOCIAL_PUBLIC_URL` | Recommended | Canonical API URL used in public RSS links and to trust same-origin browser writes. Must be an absolute HTTP(S) URL without credentials, query, or fragment. A deployment path prefix is supported. Defaults to `http://localhost:5000` for RSS rendering. Set this explicitly for browser clients. |
| `POSTGRES_PASSWORD` | For Compose | Password for the Compose PostgreSQL instance. The Compose services build their internal database URL from this value. Use URL-safe characters or ensure the connection URL is properly encoded. |
| `GOOGLE_BOOKS_API_KEY` | No | Server-side Google Books API key. Without it, default public book searches use Open Library. |
| `BOOK_CATALOG_USER_AGENT` | Recommended | Public catalog application identity and contact address. Default: `OpenBook/1.0 (public book lookup)`. |
| `CHAT_REDIS_URL` | No | Optional private `redis://` or `rediss://` endpoint for chat fanout and shared chat limits. Empty uses single-process delivery. Configured Redis must connect at startup. |
| `CHAT_TEST_DATABASE_URL` | For `test:chat` | Dedicated migrated database named `openbook_chat_test`. |
| `CHAT_TEST_REDIS_URL` | For `test:chat` | Dedicated Redis-compatible test service. Never reuse a production Redis endpoint. |
| `SOCIAL_TEST_DATABASE_URL` | For `test:social` | Dedicated migrated database whose name must be `openbook_social_test`. The integration suite refuses other database names. |
| `READ_LIST_TEST_DATABASE_URL` | For `test:read-list` | Dedicated migrated database named `openbook_read_list_test`. Public catalog responses are controlled fixtures; Redis is not required. |

Generate each signing secret independently:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Changing a signing secret invalidates tokens signed with the previous value. Schedule rotation with the expected client sign-in impact.

## Browser clients

Sign-up and login return an `accessToken` in JSON and issue a `refreshToken` cookie. Send the access token as `Authorization: Bearer <token>` for protected requests. Use `credentials: 'include'` when calling authentication routes from a browser so the cookie can be stored and sent.

Refresh cookies are `HttpOnly`, `SameSite=Lax`, host-only, and scoped to `/auth`; production adds `Secure`. The cookie expires after seven days. Access tokens expire after 15 minutes. Refresh calls rotate the cookie atomically; serialize refresh attempts and keep the newest cookie. Signing in replaces the account's previous refresh session. Logout revokes refresh capability; previously issued access tokens remain usable until expiry.

Unsafe browser requests with an `Origin` header are accepted only when that origin appears in `CORS_ORIGINS` or matches the origin of the explicitly configured `SOCIAL_PUBLIC_URL`. Requests marked `Sec-Fetch-Site: cross-site` without an Origin are rejected. Native clients and command-line tools may omit both browser headers.

For a browser client, deploy the API and frontend on the same site, such as `api.example.com` and `reader.example.com`, with HTTPS. The Lax cookie does not support cross-site refresh flows. Adding an origin to the CORS allowlist does not override cookie SameSite rules.

## HTTP and uploads

JSON and URL-encoded bodies are limited to 64 KiB; URL-encoded requests accept at most 20 parameters. DTO validation rejects unknown properties and validates nested input. Login validation runs before Passport reads credentials.

Book uploads accept one `cover` and one `file`, at most 16 text fields, at most 18 multipart parts, and 16 KiB per text field. Each file is limited to 50 MiB. Covers support JPEG, PNG, and WebP; book files require `.epub`, `application/epub+zip`, and a ZIP signature. Upload filenames are generated by the server.

Covers are served from `/uploads/books/covers/`. EPUBs reside in `uploads/books/files/` and are streamed as attachments through the authenticated `GET /book/:id/file` route. Do not expose the upload root through another web server.

## Chat connections

The chat API uses the existing access token in Socket.IO `auth.accessToken`. It does not use refresh cookies. Sockets disconnect at token expiry. See [the chat API guide](chat-api.md) for WebSocket limits, Redis behavior, and reconnect recovery.
