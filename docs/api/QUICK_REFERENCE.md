# API Quick Reference

Quick lookup for common API tasks.

## Authentication

```bash
# Register
POST /auth/register
{ "username": "user", "password": "pass" }

# Login
POST /auth/login
{ "username": "user", "password": "pass" }

# Refresh Token
POST /auth/refresh

# Logout
POST /auth/logout
```

## Books

```bash
# List books
GET /book?q=search&page=1&limit=10

# Get trending books
GET /book/top/trending?sort=rating

# Get single book
GET /book/:id

# Create book
POST /book
{ "title": "...", "author": "...", "type": "DIGITAL|PHYSICAL" }

# Update book
PUT /book/:id

# Delete book
DELETE /book/:id

# Rate book
POST /book/:id/rate
{ "value": 1-5 }
```

## Reading Progress

```bash
# Get progress
GET /book/:id/progress

# Set progress
POST /book/:id/progress
{ "currentPage": 100, "totalPages": 300, "status": "READING|COMPLETED|PAUSED|DROPPED" }
```

## Tags

```bash
# Set tags (replace all)
POST /book/:id/tags
{ "tags": ["tag1", "tag2"] }

# Add tags
PUT /book/:id/tags/add
{ "tags": ["tag3"] }

# Remove tags
DELETE /book/:id/tags
{ "tags": ["tag1"] }

# Find books by tags
GET /book/tags/search?tags=fiction,adventure&page=1

# Get all tags
GET /book/tags/all
```

## Read Lists

```bash
# Get read lists
GET /read-list

# Create read list
POST /read-list
{ "title": "...", "description": "..." }

# Get single read list
GET /read-list/:id

# Update read list
PUT /read-list/:id
{ "title": "...", "description": "..." }

# Delete read list
DELETE /read-list/:id

# Add book to list
POST /read-list/:id/books
{ "bookIds": ["book-id-1", "book-id-2"] }

# Remove book from list
DELETE /read-list/:id/books/:bookId
```

## Common Patterns

### Paginated Requests
```
GET /endpoint?page=1&limit=10
GET /endpoint?page=2&limit=20
```

### Search
```
GET /book?q=search+term
GET /book?author=Author+Name
GET /book/tags/search?tags=fiction,adventure
```

### Filtering
```
GET /book?minRating=4&maxRating=5
GET /book?sort=createdAt&order=desc
```

### Authentication
```
Authorization: Bearer YOUR_TOKEN
Cookie: refreshToken=YOUR_COOKIE
```

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |

## Content Types

```
Content-Type: application/json
Content-Type: multipart/form-data  (file uploads)
```

## Response Format

```json
{
  "data": {...},
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 10,
    "totalPages": 10
  }
}
```

## Common Queries

### Get my books
```bash
curl http://localhost:5000/book \
  -H "Authorization: Bearer TOKEN"
```

### Search books
```bash
curl 'http://localhost:5000/book?q=harry' \
  -H "Authorization: Bearer TOKEN"
```

### Find by tags
```bash
curl 'http://localhost:5000/book/tags/search?tags=fiction' \
  -H "Authorization: Bearer TOKEN"
```

### Get reading stats
```bash
curl http://localhost:5000/book/TOP_ID \
  -H "Authorization: Bearer TOKEN"
# See progress field
```

### Mark as completed
```bash
curl -X POST http://localhost:5000/book/BOOK_ID/progress \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "COMPLETED"}'
```

### Rate a book
```bash
curl -X POST http://localhost:5000/book/BOOK_ID/rate \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value": 5}'
```

### Tag management
```bash
# Set tags
curl -X POST http://localhost:5000/book/BOOK_ID/tags \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tags": ["fiction", "favorite"]}'

# Add tags
curl -X PUT http://localhost:5000/book/BOOK_ID/tags/add \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tags": ["new-tag"]}'

# Remove tags
curl -X DELETE http://localhost:5000/book/BOOK_ID/tags \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tags": ["old-tag"]}'
```

## Base URL

Development: `http://localhost:5000`
Production: `https://api.openbook.com`

## Endpoints by Category

**Auth:** `/auth/*`
**Books:** `/book/*`
**Tags:** `/book/tags/*`
**Progress:** `/book/:id/progress`
**Read Lists:** `/read-list/*`
**Users:** `/user/*`

---

**Last Updated:** July 22, 2026
