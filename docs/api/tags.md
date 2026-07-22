# Book Tags API Documentation

Comprehensive guide for managing book tags and searching books by tags.

## Overview

The Tags API allows users to:
- Assign tags to their books for better organization
- Search for books by tags
- View all available tags
- Add or remove tags from existing books

Tags are normalized (lowercase, trimmed) and case-insensitive.

## Endpoints

### Set Tags (Replace All)

Replaces all existing tags for a book with new ones.

**Request**
```http
POST /book/:id/tags
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "tags": ["fiction", "adventure", "bestseller"]
}
```

**Parameters**
- `:id` (path) - Book ID (required)
- `tags` (body) - Array of tag names (required)
  - Each tag: 1-50 characters
  - Case-insensitive (stored as lowercase)
  - Trimmed automatically

**Response** - 200 OK
```json
{
  "id": "clx4p8j9k0000q8r9z0z0z0z0",
  "title": "The Hobbit",
  "author": "J.R.R. Tolkien",
  "tags": [
    {
      "id": "tag-id-1",
      "name": "fiction",
      "createdAt": "2026-07-22T15:53:21.259Z"
    },
    {
      "id": "tag-id-2",
      "name": "adventure",
      "createdAt": "2026-07-22T15:53:21.259Z"
    },
    {
      "id": "tag-id-3",
      "name": "bestseller",
      "createdAt": "2026-07-22T15:53:21.259Z"
    }
  ],
  "digitalBook": {...},
  "physicalBook": null,
  "createdAt": "2026-07-22T15:53:21.259Z",
  "updatedAt": "2026-07-22T15:53:21.259Z"
}
```

**Example**
```bash
curl -X POST http://localhost:5000/book/abc123/tags \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "tags": ["sci-fi", "dystopian", "classic"]
  }'
```

**Errors**
- `401 Unauthorized` - Missing or invalid token
- `403 Forbidden` - You don't own this book
- `404 Not Found` - Book not found
- `400 Bad Request` - Invalid tag format

---

### Add Tags (Keep Existing)

Adds new tags to a book without removing existing ones. Duplicates are ignored.

**Request**
```http
PUT /book/:id/tags/add
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "tags": ["new-tag", "another-tag"]
}
```

**Parameters**
- `:id` (path) - Book ID (required)
- `tags` (body) - Array of tag names to add (required)
  - Each tag: 1-50 characters
  - Duplicate tags per book are automatically prevented

**Response** - 200 OK
```json
{
  "id": "clx4p8j9k0000q8r9z0z0z0z0",
  "title": "The Hobbit",
  "tags": [
    {"id": "tag-1", "name": "fiction"},
    {"id": "tag-2", "name": "adventure"},
    {"id": "tag-3", "name": "bestseller"},
    {"id": "tag-4", "name": "new-tag"},
    {"id": "tag-5", "name": "another-tag"}
  ],
  ...
}
```

**Example**
```bash
curl -X PUT http://localhost:5000/book/abc123/tags/add \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tags": ["fantasy-world", "translation"]
  }'
```

---

### Remove Tags

Removes specific tags from a book. Removes only tags that exist.

**Request**
```http
DELETE /book/:id/tags
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "tags": ["tag-to-remove", "another-tag-to-remove"]
}
```

**Parameters**
- `:id` (path) - Book ID (required)
- `tags` (body) - Array of tag names to remove (required)

**Response** - 200 OK
```json
{
  "id": "clx4p8j9k0000q8r9z0z0z0z0",
  "title": "The Hobbit",
  "tags": [
    {"id": "tag-1", "name": "fiction"},
    {"id": "tag-2", "name": "adventure"}
  ],
  ...
}
```

**Example**
```bash
curl -X DELETE http://localhost:5000/book/abc123/tags \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tags": ["old-tag", "no-longer-relevant"]
  }'
```

---

### Find Books by Tags

Search for books with any of the specified tags.

**Request**
```http
GET /book/tags/search?tags=fiction,adventure&page=1&limit=10
Authorization: Bearer YOUR_TOKEN
```

**Query Parameters**
- `tags` (required) - Comma-separated tag names to search for
- `page` (optional) - Page number, default: 1
- `limit` (optional) - Items per page, default: 10, max: 100

**Response** - 200 OK
```json
{
  "data": [
    {
      "id": "clx4p8j9k0000q8r9z0z0z0z0",
      "title": "The Hobbit",
      "author": "J.R.R. Tolkien",
      "description": "...",
      "coverUrl": "/uploads/covers/hobbit.jpg",
      "type": "DIGITAL",
      "tags": ["fiction", "adventure", "fantasy"],
      "averageRating": 4.8,
      "ratingsCount": 450,
      "createdAt": "2026-07-22T15:53:21.259Z"
    },
    {
      "id": "clx4p8j9k0000q8r9z0z0z0z1",
      "title": "Lord of the Rings",
      "author": "J.R.R. Tolkien",
      "tags": ["fiction", "adventure", "epic"],
      ...
    }
  ],
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 10,
    "totalPages": 5
  }
}
```

**Example**
```bash
# Search for books with fiction OR adventure tags
curl 'http://localhost:5000/book/tags/search?tags=fiction,adventure' \
  -H "Authorization: Bearer YOUR_TOKEN"

# With pagination
curl 'http://localhost:5000/book/tags/search?tags=fantasy&page=2&limit=20' \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### Get All Tags

Retrieves all available tags with their usage count.

**Request**
```http
GET /book/tags/all
```

**Response** - 200 OK
```json
[
  {
    "id": "clx4p8j9k0000q8r9z0z0z0z0",
    "name": "fiction",
    "createdAt": "2026-07-22T15:53:21.259Z",
    "_count": {
      "books": 125
    }
  },
  {
    "id": "clx4p8j9k0000q8r9z0z0z0z1",
    "name": "adventure",
    "createdAt": "2026-07-22T15:53:21.259Z",
    "_count": {
      "books": 87
    }
  },
  {
    "id": "clx4p8j9k0000q8r9z0z0z0z2",
    "name": "fantasy",
    "createdAt": "2026-07-22T15:53:21.259Z",
    "_count": {
      "books": 64
    }
  }
]
```

**Example**
```bash
curl http://localhost:5000/book/tags/all
```

---

## Tag Features

### Normalization
- Tags are converted to lowercase
- Leading/trailing whitespace is trimmed
- `"Fiction"` → `"fiction"`
- `" Adventure "` → `"adventure"`

### Duplicate Prevention
- Same tag can't be assigned to a book twice
- Attempting to add duplicate tags is silently ignored
- When using "Set Tags", duplicates in the input array are automatically deduplicated

### Case-Insensitive Search
- All tag searches are case-insensitive
- Search for `"FICTION"` finds books tagged with `"fiction"`

### Ownership Protection
- Only book owners can manage tags
- Requires JWT authentication
- Uses `OwnerGuard` to verify ownership

---

## Common Use Cases

### Scenario 1: Organize Personal Library by Genre

```bash
# Tag a new book
curl -X POST http://localhost:5000/book/book1/tags \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tags": ["mystery", "thriller", "detective"]}'

# Find all mystery/thriller books
curl 'http://localhost:5000/book/tags/search?tags=mystery,thriller' \
  -H "Authorization: Bearer TOKEN"
```

### Scenario 2: Add Reading Status Tags

```bash
# Mark a book as completed and recommended
curl -X PUT http://localhost:5000/book/book2/tags/add \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tags": ["completed", "recommended", "5-stars"]}'
```

### Scenario 3: Remove Outdated Tags

```bash
# Remove old categorization
curl -X DELETE http://localhost:5000/book/book3/tags \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tags": ["to-read-old", "wishlist-2023"]}'
```

### Scenario 4: Recategorize a Book

```bash
# Replace all tags with new categorization
curl -X POST http://localhost:5000/book/book4/tags \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tags": ["historical-fiction", "WWI", "award-winner"]}'
```

---

## Error Responses

### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```
**Solution:** Include valid JWT token in Authorization header

### 403 Forbidden
```json
{
  "statusCode": 403,
  "message": "Forbidden resource",
  "error": "Forbidden"
}
```
**Solution:** You can only manage tags for books you own

### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Book not found",
  "error": "Not Found"
}
```
**Solution:** Check the book ID is correct

### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": "Validation failed: each value in tags must be a string",
  "error": "Bad Request"
}
```
**Solution:** Ensure tags are an array of strings, each 1-50 characters

---

## Caching

- **Get All Tags:** 5-minute cache TTL
- **Find Books by Tags:** 1-minute cache TTL

To bypass cache, you may need to:
1. Make requests from different origins
2. Wait for cache TTL to expire
3. Include cache-busting headers

---

## Rate Limits

API requests are subject to caching:
- Global cache for frequently accessed resources
- User-specific caching for personalized results
- Cache keys based on query parameters

---

## Integration Examples

### JavaScript/Node.js
```javascript
// Set tags
const response = await fetch(`http://localhost:5000/book/${bookId}/tags`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    tags: ['fiction', 'adventure']
  })
});

const book = await response.json();
console.log(book.data.tags);
```

### Python
```python
import requests

headers = {'Authorization': f'Bearer {token}'}

# Find books by tags
response = requests.get(
    'http://localhost:5000/book/tags/search',
    params={'tags': 'fiction,adventure'},
    headers=headers
)

books = response.json()['data']
```

### cURL
```bash
# Get all tags
curl http://localhost:5000/book/tags/all

# Search by tags
curl 'http://localhost:5000/book/tags/search?tags=fantasy' \
  -H "Authorization: Bearer $TOKEN"
```

---

**Last Updated:** July 22, 2026  
**API Version:** 1.0.0
