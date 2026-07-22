# Book Progress API Documentation

Track and manage reading progress for books.

## Endpoints

### Get Progress

Retrieve reading progress for a specific book.

**Request**
```http
GET /book/:id/progress
Authorization: Bearer YOUR_TOKEN
```

**Parameters**
- `:id` (path) - Book ID (required)

**Response** - 200 OK
```json
{
  "id": "progress-id",
  "userId": "user-id",
  "bookId": "clx4p8j9k0000q8r9z0z0z0z0",
  "currentPage": 157,
  "totalPages": 310,
  "progressPercentage": 50.6,
  "status": "READING",
  "startedAt": "2026-07-15T10:00:00Z",
  "completedAt": null,
  "updatedAt": "2026-07-22T15:53:21.259Z"
}
```

**Example**
```bash
curl http://localhost:5000/book/clx4p8j9k0000q8r9z0z0z0z0/progress \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### Set Progress

Update reading progress for a book.

**Request**
```http
POST /book/:id/progress
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "currentPage": 250,
  "totalPages": 310,
  "status": "READING"
}
```

**Parameters**
- `:id` (path) - Book ID (required)
- `currentPage` (required) - Current page number (0+)
- `totalPages` (optional) - Total pages in the book
- `status` (optional) - Reading status (READING, COMPLETED, PAUSED, DROPPED)

**Response** - 200 OK
```json
{
  "id": "progress-id",
  "userId": "user-id",
  "bookId": "clx4p8j9k0000q8r9z0z0z0z0",
  "currentPage": 250,
  "totalPages": 310,
  "progressPercentage": 80.6,
  "status": "READING",
  "startedAt": "2026-07-15T10:00:00Z",
  "completedAt": null,
  "updatedAt": "2026-07-22T15:53:21.259Z"
}
```

**Examples**
```bash
# Update current page
curl -X POST http://localhost:5000/book/abc123/progress \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPage": 250
  }'

# Mark as completed
curl -X POST http://localhost:5000/book/abc123/progress \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPage": 310,
    "totalPages": 310,
    "status": "COMPLETED"
  }'

# Pause reading
curl -X POST http://localhost:5000/book/abc123/progress \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "PAUSED"
  }'
```

---

## Reading Statuses

| Status | Description |
|--------|-------------|
| `READING` | Currently reading the book |
| `COMPLETED` | Finished reading |
| `PAUSED` | Temporarily paused |
| `DROPPED` | Stopped reading |

## Progress Calculation

Progress percentage is calculated automatically:
```
progressPercentage = (currentPage / totalPages) * 100
```

- If `totalPages` is 0: progressPercentage = 0
- Automatically set to 0 if not yet started
- Maxed at 100% when completed

## Auto-Completion

When status is set to `COMPLETED`, the `completedAt` timestamp is automatically set to the current time.

```json
{
  "status": "COMPLETED",
  "completedAt": "2026-07-22T16:00:00Z"
}
```

## Notes

- Progress is per-user per-book (unique constraint)
- First progress entry creates a new record
- Subsequent updates modify existing record
- Progress data is not deleted when book is deleted (preserves history)
- Cannot update progress for books you don't own

---

**Last Updated:** July 22, 2026  
**API Version:** 1.0.0
