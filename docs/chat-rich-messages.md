# Presence, book discovery, quotes, and spoilers

These capabilities extend the authenticated [chat API](chat-api.md). REST and WebSocket sends use the same validation, message format, and persistence rules. This repository supplies the backend protocol; client interfaces render the returned segments, cards, and presence events.

## Public book search and hyperlink previews

Book discovery searches public catalogs. It does not query the user's private OpenBook library.

| Method | Route | Result |
| --- | --- | --- |
| GET | `/chat/books/search?q=The%20Hobbit&provider=all&limit=10` | Normalized public catalog results and provider availability |
| GET | `/chat/books/openlibrary/OL27448W` | Public Open Library work preview |
| GET | `/chat/books/google/<volume-id>` | Public Google Books volume preview |
| GET | `/chat/books/preview?url=<encoded-book-url>` | Resolve a supported public book hyperlink |

All routes require the existing bearer access token. Search accepts 2–200 characters, a provider of `all`, `openlibrary`, or `google`, and a limit of 1–20. A query may contain a title, author, ISBN, or provider-supported search terms.

Open Library works without an API key. Set `GOOGLE_BOOKS_API_KEY` to include Google Books in `provider=all` searches. An explicit Google lookup requires that key. Search responses include per-provider states such as `ok`, `unavailable`, and `not_configured`; available providers can return results when another is unavailable. If all requested services fail, the request fails rather than substituting private-library results.

Results contain `provider`, `id`, `title`, `authors`, `description`, `publishedYear`, `isbn`, `url`, `coverUrl`, and `previewUrl`. Metadata can be incomplete. A direct Open Library work or edition lookup may omit author names or ISBNs that were available in a search result. Google preview links lead to the provider's reading page; availability and reading rights are controlled by that provider.

Attach a selected search result by its public identity:

```json
{
  "clientMessageId": "cc8a3356-018e-46df-b1e5-4685a77d21f6",
  "content": "Let's discuss this book",
  "books": [{ "provider": "openlibrary", "id": "OL27448W" }]
}
```

Alternatively, include up to three `bookUrls` or paste supported links in the message text. Supported forms include Open Library `/works/OL…W` and `/books/OL…M` URLs, Google Books `/books?id=…` URLs, and Google Books edition URLs. Links are normalized to provider IDs; their original query strings are not forwarded upstream.

The server resolves metadata and persists a snapshot in `bookPreviews`. Clients cannot supply titles, cover URLs, or other preview fields. A later history read uses that snapshot, so it does not depend on another provider request. At most three distinct books can be attached to one message, including automatically detected links.

An automatically detected link remains a normal hyperlink if its preview lookup fails. Explicit `books` or `bookUrls` attachments require a successful lookup. Links inside inline spoilers or a whole-message spoiler are not automatically looked up. Explicit attachments can be used with `spoiler: true` when the entire card should remain hidden in the client interface.

Ordinary HTTP(S) hyperlinks are returned as `link` segments and are never fetched for generic HTML/Open Graph scraping. The server only contacts fixed Open Library and Google Books API origins, rejects redirects, and limits requests to five seconds and JSON responses to 1 MiB. Credentials, custom ports, unsupported providers, and private-host preview URLs are rejected.

Searches are cached for five minutes and book previews for one hour, with at most 500 cached entries and 20 in-flight lookups per process. Catalog routes allow 30 requests per account per minute. Uncached upstream requests use shared chat rate limiting when Redis is configured: one Open Library request per second and five Google requests per second. A rate-limited lookup can wait one second and retry admission once. Clients should debounce search and reuse selected results.

Set `BOOK_CATALOG_USER_AGENT` to identify the deployment, preferably with a contact address. Respect the providers' usage and attribution requirements. Only explicit search queries and public book identities are sent to catalogs; the backend does not send an entire private conversation for book detection.

## Quoted replies and book quotations

Use `replyToId` to reference an existing message in the same conversation:

```json
{
  "clientMessageId": "cc8a3356-018e-46df-b1e5-4685a77d21f6",
  "content": "What did you mean by this?",
  "replyToId": "<message-cuid>"
}
```

The server verifies membership and the quoted message's conversation. References to another conversation return 404. The response includes a shallow `replyTo` object with the source ID, sequence, sender, a bounded excerpt, and a spoiler flag. It never recursively embeds a full reply chain. Spoiler text is masked in the excerpt.

For a quotation supplied by the sender, use:

```json
{
  "clientMessageId": "cc8a3356-018e-46df-b1e5-4685a77d21f6",
  "content": "A passage worth discussing",
  "quote": {
    "text": "A short quotation supplied by the reader",
    "attribution": "Author or source supplied by the reader"
  }
}
```

Quotation text accepts 1–1,000 characters; attribution is optional and limited to 200 characters. Attribution is user-supplied, rather than independently verified. Public catalog lookup provides metadata and does not retrieve book passages. Quotations and book cards can be combined in a message.

Message retry identity includes normalized content, reply target, quotation, public book identities, and the whole-message spoiler flag. Reusing a `clientMessageId` with changed rich content returns 409. Retrying an existing message does not repeat public catalog requests or publish a duplicate message.

## Spoilers and safe rendering

Use `||hidden text||` for inline spoilers or `spoiler: true` for a whole-message spoiler. Messages expose a `segments` array:

```json
[
  { "type": "text", "text": "The ending is " },
  { "type": "spoiler", "text": "hidden until revealed" },
  { "type": "text", "text": "." }
]
```

Segment types are `text`, `link`, and `spoiler`; link segments also include `href`. Unmatched spoiler delimiters remain literal text. Formatting is bounded to 128 segments, with a safe whole-text fallback for pathological input.

Clients should render text nodes, make spoiler segments concealed until explicitly revealed, and open external links with appropriate isolation such as `rel="noopener noreferrer"`. Render quotation segments the same way. For `spoiler: true`, conceal the full message, quotation, and book cards together. No HTML or executable Markdown is generated by the backend.

Conversation summaries mask spoilers with `[Spoiler]`. Whole-message spoiler summaries omit attached book cards, quotations, and quoted-reply metadata. Quoted source excerpts also mask spoilers. Authorized full history and live message payloads still contain the original text: spoiler flags are presentation controls, not encryption or access control.

## Online presence

An account is online while at least one authenticated chat WebSocket has a live presence lease. HTTP requests alone do not mark an account online. There is no public online-user directory or persistent last-seen history.

Read a conversation peer's status with `GET /chat/conversations/:id/presence`, or send the WebSocket request `chat.presence.get` with `{ conversationId }`. The WebSocket acknowledgement is `{ ok: true, presence }`.

```json
{
  "userId": "<peer-cuid>",
  "online": true,
  "expiresAt": 1793530845000,
  "observedAt": 1793530800000
}
```

`chat.presence` pushes the same shape to eligible conversation peers. Clients should apply the most recent `observedAt` for an account and automatically expire an online indicator at `expiresAt` unless refreshed. Offline snapshots have `expiresAt: null`.

Each connection refreshes its lease every 15 seconds, with a maximum lease of 45 seconds and a bound at access-token expiry. Closing one device keeps the account online while another device remains connected. A normal final disconnect publishes offline status. If a process crashes, the lease expires; clients must honor the expiry rather than wait indefinitely for an offline event.

Without Redis, presence is local to one process. With shared Redis, expiring sorted-set leases combine devices across API instances. Redis uses its own clock for lease observations. Presence is not written to PostgreSQL.

Only conversation participants can query peer presence. Existing blocks mask presence as offline and suppress updates to the blocked peer. Live fanout is limited to the account's 200 most recently updated conversations; authorized explicit status queries work for older conversations too. Fetch a snapshot when opening a conversation or reconnecting. If configured Redis is unavailable, presence queries can return 503 instead of guessing a status.

## Typing indicators

Emit `chat.typing` with `{ conversationId, typing: true }` or `typing: false`. A successful acknowledgement is `{ ok: true, typing: <update> }`. The peer receives `chat.typing`:

```json
{
  "conversationId": "<conversation-cuid>",
  "userId": "<typing-account-cuid>",
  "typing": true,
  "expiresAt": 1793530805000
}
```

Typing events require membership, honor blocks, and are sent only to the other participant's devices. They expire after five seconds and are never stored as messages. Clear the indicator on `typing: false` or expiry. The account budget is ten typing events per second; presence queries have a separate 60-per-minute budget. Sending messages retains its existing 60-per-minute budget.

## Verification

The normal Postman collection tests rich-message persistence, quoted replies, spoiler-safe summaries, presence snapshots, and unsafe catalog inputs without depending on an external service. Unit tests use controlled public-provider responses. Integration tests use actual PostgreSQL, Socket.IO, and Redis-compatible services, with public catalog HTTP requests replaced by fixtures.

For an optional live public-catalog check against an isolated running API:

```sh
npm run test:postman:catalog
# Override the default API address if needed:
npm run test:postman:catalog -- --env-var baseUrl=http://127.0.0.1:5059
```

That collection creates one test account and performs a real catalog search and preview lookup. It needs outbound network access and provider availability. Google participates only when the server has a key configured. Use a disposable database and do not export populated credentials into source control.

Provider references: [Open Library Search API](https://openlibrary.org/dev/docs/api/search), [Open Library API usage guidelines](https://openlibrary.org/developers/api), and [Google Books API](https://developers.google.com/books/docs/v1/using).
