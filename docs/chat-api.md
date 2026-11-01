# Private chat API

Chat provides one-to-one text conversations, durable PostgreSQL history, and live Socket.IO delivery over WebSocket. Both participants must have an OpenBook account; a public social profile is not required. Chat also supports online presence, typing indicators, public book cards, quotations, quoted replies, and spoilers. Group conversations, file attachments, edits, message deletion, and read receipts are outside this API. See [presence and rich messages](chat-rich-messages.md) for the extended protocol.

## Authentication and access

REST routes use the existing bearer access token. Socket.IO connections use the same token in `auth.accessToken`, never in a URL or refresh cookie. Clients must connect to namespace `/chat` using the WebSocket transport. The engine path is `/socket.io`.

Every history read and send checks conversation membership. The server assigns sender identity and sequence numbers. Clients cannot join arbitrary rooms or select a sender. Broadcasts go only to the two participants' server-managed account rooms, including their other connected devices.

An existing social block in either direction prevents creating a conversation or sending a new message. Participants retain access to messages already in their conversation. Repeating an already-persisted message with the same ID and rich content returns the original message, including after a block; it creates no new message or broadcast.

Connections are closed at access-token expiry. Refresh using the HTTP authentication flow, then reconnect with the new access token. Logout has the same access-token behavior as the rest of the API: an issued access token remains valid until it expires.

## REST routes

All routes below require `Authorization: Bearer <accessToken>` and use JSON bodies. Responses use `Cache-Control: no-store`.

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/chat/conversations` | Create or retrieve the unique conversation with `recipientId` |
| GET | `/chat/conversations` | List the current account's conversations, most recently updated first |
| GET | `/chat/conversations/:id` | Conversation metadata, peer, and most recent message |
| POST | `/chat/conversations/:id/messages` | Persist a message and publish it to connected participants |
| GET | `/chat/conversations/:id/messages` | Page backward through history or forward through missed messages |
| GET | `/chat/conversations/:id/presence` | Current online snapshot for the conversation peer |
| GET | `/chat/books/search` | Search configured public book databases |
| GET | `/chat/books/preview` | Preview a supported public book hyperlink |
| GET | `/chat/books/:provider/:id` | Resolve a public catalog book identity |

Create a conversation:

```json
{ "recipientId": "<other-user-cuid>" }
```

Sending the same participant pair in either order returns the same conversation. Self-chat is rejected. An unavailable or blocked recipient returns 404. Conversation creation returns 201, including when an existing conversation is reused.

The response includes `id`, `peer: { id, username }`, `createdAt`, `updatedAt`, `lastSequence`, and `lastMessage`. The list route wraps these objects in the standard `{ data, meta }` pagination response. It accepts `page` and `limit` from the core API pagination contract. Active conversations may move between pages when new messages arrive.

Send a message:

```json
{
  "clientMessageId": "cc8a3356-018e-46df-b1e5-4685a77d21f6",
  "content": "Have you read this book?"
}
```

Generate a new UUID v4 for each logical message and retain it until the send is acknowledged. Text is trimmed and must contain 1–4,000 characters. Unknown fields, control bytes, and invalid IDs are rejected. Text is stored as plain text; client interfaces must escape it when rendering HTML.

A successful POST returns 201:

```json
{
  "created": true,
  "message": {
    "id": "<message-cuid>",
    "conversationId": "<conversation-cuid>",
    "clientMessageId": "cc8a3356-018e-46df-b1e5-4685a77d21f6",
    "sequence": 1,
    "content": "Have you read this book?",
    "sender": { "id": "<sender-cuid>", "username": "reader" },
    "createdAt": "2026-11-01T09:00:00.000Z"
  }
}
```

The idempotency key is scoped to the conversation and sender. Repeating it with the same normalized content and rich metadata returns `created: false` and the existing message. Reusing it with different content returns 409. Concurrent retries cannot create duplicate rows or consume extra sequence values. Database transactions assign increasing sequence numbers within each conversation.

## History and reconnect recovery

History results always return messages in ascending sequence order within the page. Page size defaults to 50 and is limited to 100.

- `?limit=50` returns the newest page. Prepend older pages using `before=<nextBefore>` until `nextBefore` is null.
- `?after=<lastContiguousSequence>&limit=50` returns missed messages in ascending order. Continue with `after=<nextAfter>` until `nextAfter` is null.
- `before` and `after` are mutually exclusive. `before` must be a positive integer; `after` may be zero.

```json
{
  "data": [],
  "nextBefore": null,
  "nextAfter": null
}
```

A server-generated sequence is an ordering and recovery offset, rather than a delivery or read receipt. Live messages may arrive out of order across concurrent sends or multiple instances. Merge by message ID, order by sequence, and recover any gaps from PostgreSQL. Advance the reconnect offset only through a contiguous set of received messages.

On reconnect, attach the live listener first and then fetch `after=<lastContiguousSequence>`. Merge overlapping live and history results by ID. This closes the gap between subscribing and fetching history. Repeat recovery after future disconnects or gaps; a socket event is not durable storage.

## Socket.IO protocol

Install the official `socket.io-client` package in the client application. A native `WebSocket` client does not implement the Socket.IO protocol.

```ts
import { io } from 'socket.io-client';

const socket = io('https://api.example.com/chat', {
  transports: ['websocket'],
  auth: { accessToken },
});

socket.on('chat.ready', ({ userId, expiresAt }) => {
  // The account room is joined. Attach listeners before connecting if recovering history.
});

socket.on('chat.message', message => {
  // Upsert by message.id, sort by message.sequence, and recover sequence gaps.
});

const draft = {
  conversationId,
  clientMessageId: crypto.randomUUID(),
  content: 'Have you read this book?',
};

const reply = await socket.timeout(5000).emitWithAck('chat.send', draft);
if (!reply.ok) {
  console.error(reply.error.status, reply.error.message);
}
```

| Direction | Event | Payload |
| --- | --- | --- |
| Server → client | `chat.ready` | `{ userId, expiresAt }`; expiry is Unix milliseconds |
| Client → server | `chat.send` | `{ conversationId, clientMessageId, content }` |
| Server → client | `chat.message` | A persisted message object |
| Client → server | `chat.presence.get` | `{ conversationId }`; returns a peer status acknowledgement |
| Server → client | `chat.presence` | Peer online status, expiry, and observation time |
| Client ↔ server | `chat.typing` | Expiring conversation typing state |
| Server → client | `chat.error` | Error envelope when no acknowledgement callback was supplied |

Successful send acknowledgements are `{ ok: true, created, message }`. Errors are `{ ok: false, error: { status, message } }`. Invalid payloads receive 400; inaccessible conversations receive 404; blocked sends receive 403; duplicate IDs with changed content receive 409; rate limits receive 429; temporary database or configured Redis failures may receive 503. Unexpected failures return a generic 500 error without input or internal diagnostics. Authentication failures use the Socket.IO `connect_error` event with a generic message.

If an acknowledgement times out, resend the same logical message with the same `clientMessageId` and content. Do not assign a new ID merely because the connection dropped. A committed message can still be recovered from history if delivery or an acknowledgement is lost. Duplicate retries do not rebroadcast the message.

## Limits

| Control | Limit |
| --- | --- |
| New socket attempts | 30 per direct socket IP per 60 seconds |
| Open socket connections | 1,000 per API process |
| Authenticated sockets | 5 per account per API process |
| Sends | 60 per account per 60 seconds, shared across REST and WebSocket |
| Conversation creation | 20 per account per 60 seconds, plus the HTTP IP limiter |
| WebSocket frame size | 16 KiB; compression disabled |
| Pending packet admission checks | 8 per socket |
| Namespace authentication timeout | 5 seconds |
| Redis command timeout | 3 seconds; offline command queuing disabled |

WebSocket attempts and supported/unsupported incoming events consume their admission budgets. Presence queries and typing use separate budgets described in [the rich-message guide](chat-rich-messages.md). Oversized frames close the connection. The single-process limiter holds at most 20,000 active/expired window entries and rejects new identities at capacity after removing expired entries. General HTTP rate limits continue to apply to REST routes.

Socket IP limits use the direct connection address, ignoring forwarded headers. Behind a proxy, these IP limits may therefore apply to the proxy. Review the deployment topology and enforce edge limits when needed.

## Optional Redis

Without `CHAT_REDIS_URL`, one API process uses local rooms and bounded in-memory chat rate limits. PostgreSQL still stores every message and supports recovery after a restart. No Redis service is required for that deployment.

For multiple API instances, configure the same private Redis endpoint on every instance:

```dotenv
CHAT_REDIS_URL=rediss://username:password@redis.internal:6379/0
```

Redis provides Socket.IO Pub/Sub fanout and atomic, expiring chat rate counters. PostgreSQL remains authoritative for history. Room fanout is best effort; the Redis adapter does not provide connection-state recovery. When configured Redis is unavailable, chat admission and new sends fail closed instead of switching to independent local rate limits. History reads remain available. Startup fails when configured Redis cannot connect. Reconnection attempts are bounded; restart an instance if its Redis clients exhaust recovery attempts.

Redis is trusted internal infrastructure: Pub/Sub carries message content and can inject events if accessed by an attacker. Use a private network, authentication/ACLs, and TLS for remote connections. Do not share the endpoint or its `openbook:chat:*` key/channel namespace with untrusted applications or different environments. The Compose overlay runs a private Redis service without a published host port; its volatile data does not need a message-history backup.

```sh
docker compose -f docker-compose.yml -f docker-compose.chat-redis.yml up --build -d
```

Forward WebSocket Upgrade requests for `/socket.io/` through the reverse proxy. The deployment uses WebSocket transport only, so polling session affinity is not required. Keep browser origins in `CORS_ORIGINS` and configure `SOCIAL_PUBLIC_URL`; the same trusted-origin policy applies to the WebSocket handshake. Use HTTPS/WSS outside local development.

Messages are readable by the backend and stored as PostgreSQL text; this is not end-to-end encryption. Apply database access controls, encrypted storage/backups, and a retention policy appropriate to the deployment. Deleting a participant account at the database level cascades its conversations and messages. There is no public history deletion or account deletion endpoint.

## Verification

`npm run test:chat` runs real PostgreSQL and Socket.IO checks, including two-instance Redis fanout and shared limits. The Postman collection covers REST conversation and history behavior. See [the testing guide](testing.md) for isolated database and Redis setup.

Protocol references: [Socket.IO middleware](https://socket.io/docs/v4/middlewares/), [delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/), and [Redis adapter](https://socket.io/docs/v4/redis-adapter/).
