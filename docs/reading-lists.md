# Playlist-style reading lists

Reading lists support curation, sharing, collaboration, and personal libraries. Lists contain ordered book references, rather than copies of private EPUBs or physical-book locations. Every route requires a bearer access token. This repository implements the backend API; client applications supply the browsing and editing interface.

## Create and customize

```http
POST /read-list
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "title": "Weekend science fiction",
  "description": "Short books to read together",
  "coverUrl": "https://images.example/reading-list.jpg",
  "visibility": "PRIVATE"
}
```

Titles are trimmed, nonempty, limited to 100 characters, and unique per owner. Descriptions accept up to 500 characters. Cover URLs must use HTTP(S), cannot contain credentials, and are limited to 2,048 characters. The server stores the cover URL without fetching it. A client can also construct a cover collage from item metadata.

The owner can change these fields with `PATCH /read-list/:id`. Set `coverUrl` or `description` to `null` to clear it. Title and visibility cannot be null. Deletion uses `DELETE /read-list/:id` and removes entries, collaborator grants, and saves for that list.

| Visibility | Who can read | Discovery |
| --- | --- | --- |
| `PRIVATE` | Owner and explicitly granted collaborators | Excluded |
| `UNLISTED` | Authenticated accounts with the list ID | Excluded |
| `PUBLIC` | Authenticated accounts | Included |

Unlisted IDs are shareable references, rather than secret access tokens. Changing a public or unlisted list to private immediately restricts subsequent reads. Saved-list membership does not grant access to a private list. A list's visibility is independent of its owner's social-profile visibility.

## Browse and save

`GET /read-list` returns owned lists by default. Use `scope=saved`, `scope=collaborating`, or `scope=all` for the corresponding library view. The combined view includes owned, saved, and collaborative lists once each. Use `GET /read-list/discover` to browse public lists.

Both routes accept `q` for case-insensitive title/description search, `page` (default 1), and `limit` (default 10, maximum 100). Results use `{ data, meta: { total, page, limit, totalPages } }` and sort by the latest list update, with a stable ID tie-breaker. The `scope` parameter has no effect on discovery.

Library results and list details include the owner's basic identity (`id`, `username`), `_count.items`, `_count.saves`, `_count.collaborators`, the caller's `role`, `savedByMe`, and `revision`. Saver identities are not exposed. Roles returned to clients are `OWNER`, `EDITOR`, `VIEWER`, or `READER` for an otherwise eligible reader. Clients should render list text and notes as text nodes and apply their external-image policy to cover URLs.

Save a list using `POST /read-list/:id/save`; remove it with `DELETE /read-list/:id/save`. Both operations are idempotent. Saving does not copy a list, change its content revision, or grant editing rights. Saves remain in storage when access is revoked, but the list disappears from the caller's visible library until access is restored. Unsave remains available while a list is hidden or blocked.

## Add books and public catalog cards

Use the existing `POST /read-list/:id/books` route with `{ "bookId": "<owned-book-id>" }`, or the richer item endpoint:

```json
{
  "bookId": "<owned-book-id>",
  "note": "Read before our next discussion",
  "expectedRevision": 3
}
```

Send that body to `POST /read-list/:id/items`. A library book must belong to the account adding it, including when the account is a collaborator. Sharing a list grants access to selected book metadata; it does not grant access to the contributor's private book API, file downloads, or reading activity.

Alternatively, select a book from the existing [public catalog search](chat-rich-messages.md#public-book-search-and-hyperlink-previews) and send its public identity:

```json
{
  "catalogBook": { "provider": "openlibrary", "id": "OL27448W" },
  "note": "Public edition to discuss"
}
```

Provide exactly one `bookId` or `catalogBook`. Open Library is available without a key; Google Books requires the server's `GOOGLE_BOOKS_API_KEY`. Metadata is resolved by the server and persisted as `catalogPreview`. Clients cannot forge preview titles, cover URLs, or external links. Reads use the stored snapshot without contacting the provider. A provider failure leaves the list unchanged. Public-card additions allow 30 lookups per account per minute, in addition to existing request and provider limits.

Entries expose a stable `id`, zero-based `position`, `note`, `addedAt`, and the contributor's basic identity. Local entries have a safe `book` projection; catalog entries have `catalogProvider`, `catalogId`, and `catalogPreview`, with `bookId: null`. Local-book and provider/ID duplicates are rejected within a list. Two different public providers or distinct editions can represent separate entries. Each list supports up to 500 entries.

`GET /read-list/:id` embeds the first 100 entries in manual order and includes `itemsMeta`. Use `GET /read-list/:id/items?page=2&limit=100` for later entries. Item pages accept `sort=position` (default), `sort=title` (case-insensitive across both sources), or `sort=addedAt` (newest first). These display sorts do not change the saved order. Item pages also include the current list revision.

The existing `stats.totalBooks` counts both source types. Page and rating aggregates describe library books, because catalog cards do not provide those local statistics. Shared responses omit book ownership, storage paths, digital sources, physical addresses, and reading-progress counts.

Edit a note with `PATCH /read-list/:id/items/:itemId` and `{ "note": "New note", "expectedRevision": 4 }`; use `null` to clear it. Notes are limited to 1,000 characters. Remove an entry with `DELETE /read-list/:id/items/:itemId`. The existing `DELETE /read-list/:id/books/:bookId` route remains supported for library entries.

## Reorder and handle concurrent edits

Owners and editors reorder with `PATCH /read-list/:id/items/order`:

```json
{
  "itemIds": ["<second-entry-id>", "<first-entry-id>"],
  "expectedRevision": 5
}
```

Supply every current entry exactly once. Entry IDs belong to list memberships, rather than to the books themselves. The reorder is atomic and returns `{ itemIds, revision }`. It requires `expectedRevision`; stale revisions return 409. Fetch all item pages before submitting a complete order.

List content, metadata, and collaborator changes increment `revision`. Create/update/add/note/collaborator mutation responses include it. `expectedRevision` is optional on metadata changes, additions, note edits, and collaborator grants for compatibility with existing clients. Supply it to prevent overwriting an intervening edit. After a 409, reload the list and let the user reconcile changes. Retrying a creation/addition after a lost response can return a duplicate conflict; these endpoints are not message-style idempotency APIs.

Writes use serializable database transactions, with bounded retries for transaction conflicts. Authorization is checked inside the write transaction, including after a public provider lookup. No partial reorder or revision increment persists when an operation fails. Deleting a library book can remove its entries through the existing database cascade without a list API revision increment; reorders still verify the complete current membership set.

## Collaborate

Only the owner can grant access:

```http
POST /read-list/:id/collaborators
Content-Type: application/json

{ "userId": "<account-id>", "role": "EDITOR", "expectedRevision": 6 }
```

| Role | Read/save/copy | Add/remove/reorder entries and edit notes | Details, visibility, grants, deletion |
| --- | --- | --- | --- |
| Owner | Yes | Yes | Yes |
| Editor | Yes | Yes | No |
| Viewer | Yes | No | No |
| Other eligible reader | Yes | No | No |

Posting an existing collaborator updates the role immediately. Each list supports 100 collaborators. Owners cannot add themselves as collaborators. The grant takes effect directly; no email, notification, public invitation token, or acceptance workflow is generated.

`GET /read-list/:id/collaborators` returns the roster to the owner. Revoke access with `DELETE /read-list/:id/collaborators/:userId`. A collaborator can call that route with their own ID to leave, including after a social block. Removing a collaborator from a public or unlisted list removes editing rights but leaves its ordinary reading rules in effect.

Existing social blocks apply in either direction between a reader and the owner. Blocked lists return 404 and disappear from discovery, saved lists, and collaborative views. A block also prevents new grants between those accounts. Owner-controlled sharing does not depend on a public social profile.

## Make a private copy

`POST /read-list/:id/duplicate` with `{ "title": "My reading plan" }` creates a new private list owned by the caller. It copies description, cover URL, entry order, notes, and book references. It creates new entry IDs and does not copy saves or collaborator grants. Copying requires current read access.

Catalog cards retain their stored snapshots. Library entries retain their book references: changes to that book's metadata appear in both lists, and deleting the library book removes those references. A copy never grants private-book ownership or file access. Access to an already created copy is independent of the source list's later visibility.

## Upgrade and verify

Run `npm run prisma:generate` and `npx prisma migrate deploy` before starting the updated API. Migration `20261101140000_advanced_read_lists` preserves existing list IDs, memberships, titles, descriptions, and timestamps. It adds entry IDs and assigns deterministic positions by `addedAt`, then `bookId`. Existing lists remain private with revision zero; existing contributions are attributed to their list owner.

Legacy lists with more than 500 entries are preserved and readable through pagination. They must be reduced to 500 before duplication or a complete reorder, and below 500 before adding another entry. Shared responses now consistently use the metadata-only book projection, including for owners; clients needing private book details should use the existing owned-book routes.

Run `npm run test:read-list` against a migrated disposable database named `openbook_read_list_test`, configured through `READ_LIST_TEST_DATABASE_URL`. The suite uses real PostgreSQL and JWT-authenticated HTTP, with controlled public catalog responses. The main Postman collection also checks sharing, saves, collaboration, ordering, and privacy. See [the testing guide](testing.md) for full setup.
