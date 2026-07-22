# OpenBook API Documentation

Welcome to the OpenBook Backend API documentation. This guide covers all available endpoints, authentication, and best practices.

## 📚 Documentation Index

### Getting Started
- **[Getting Started Guide](./GETTING_STARTED.md)** - Step-by-step tutorial to get up and running
- **[Quick Reference](./QUICK_REFERENCE.md)** - Cheat sheet for common tasks

### API References
- **[Authentication](./authentication.md)** - JWT tokens, login, refresh, logout
- **[Books API](./books.md)** - CRUD operations, search, ratings
- **[Book Tags API](./tags.md)** ⭐ **NEW** - Tag management and search
- **[Book Progress](./progress.md)** - Reading progress tracking
- **[Error Handling](./errors.md)** - Error codes and responses

## Base URL

```
http://localhost:5000/api
```

Or for production:
```
https://api.openbook.com/api
```

## Authentication

All protected endpoints require a JWT token in the Authorization header:

```bash
Authorization: Bearer YOUR_JWT_TOKEN
```

See [Authentication](./authentication.md) for detailed info.

## API Structure

### Request Format
- **Content-Type**: `application/json`
- **Method**: GET, POST, PUT, DELETE, PATCH
- **Headers**: Include `Authorization` header for protected routes

### Response Format

Success Response:
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

Error Response:
```json
{
  "statusCode": 400,
  "message": "Error description",
  "error": "Bad Request"
}
```

## Rate Limiting

- API calls are cached for performance
- Books list: 60-second cache
- Tags list: 5-minute cache
- Searches: 1-minute cache

## Pagination

Endpoints that return lists support pagination:

**Query Parameters:**
- `page` (optional): Page number, default 1
- `limit` (optional): Items per page, default 10, max 100

**Example:**
```bash
GET /book?page=2&limit=20
```

## Common Response Fields

### Book Object
```json
{
  "id": "cuid-string",
  "title": "Book Title",
  "author": "Author Name",
  "description": "Book description",
  "isbn": "978-3-16-148410-0",
  "type": "DIGITAL|PHYSICAL",
  "publishedAt": "2023-01-01T00:00:00Z",
  "coverUrl": "/uploads/covers/filename.jpg",
  "totalPages": 300,
  "averageRating": 4.5,
  "ratingsCount": 25,
  "ownerId": "user-id",
  "createdAt": "2026-07-22T15:53:21.259Z",
  "updatedAt": "2026-07-22T15:53:21.259Z",
  "tags": ["fiction", "adventure"],
  "digitalBook": {...},
  "physicalBook": {...}
}
```

### Pagination Meta Object
```json
{
  "total": 156,
  "page": 1,
  "limit": 10,
  "totalPages": 16
}
```

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK - Request successful |
| 201 | Created - Resource created |
| 204 | No Content - Request successful, no response body |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Missing or invalid token |
| 403 | Forbidden - Access denied (not owner) |
| 404 | Not Found - Resource not found |
| 409 | Conflict - Resource already exists |
| 500 | Internal Server Error |

## Getting Started

1. **Register/Login** - See [Authentication](./authentication.md)
2. **Create a Book** - See [Books API](./books.md#create-book)
3. **Add Tags** - See [Book Tags API](./tags.md#set-tags)
4. **Track Progress** - See [Book Progress](./progress.md#set-progress)

## Best Practices

### 1. Error Handling
Always check the status code and handle errors appropriately:
```javascript
const response = await fetch('/book', {
  headers: { 'Authorization': `Bearer ${token}` }
});

if (!response.ok) {
  const error = await response.json();
  console.error(error.message);
}
```

### 2. Token Management
- Store JWT tokens securely (httpOnly cookies recommended)
- Refresh tokens before expiration
- Clear tokens on logout

### 3. Pagination
- Always handle pagination for list endpoints
- Default limit is 10, max is 100
- Use `totalPages` to determine if more results exist

### 4. Caching
- List endpoints are cached for performance
- Cache duration varies (see API-specific docs)
- Send requests with cache-busting headers if needed

### 5. File Uploads
- Maximum file size: 50 MB
- Supported formats: JPG, PNG, WebP (covers), EPUB (books)
- Use multipart/form-data for uploads

## Common Tasks

### Search Books by Title
```bash
curl http://localhost:5000/book?q=Harry%20Potter \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Filter Books by Author
```bash
curl http://localhost:5000/book?author=J.K.%20Rowling \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Find Books by Tags
```bash
curl 'http://localhost:5000/book/tags/search?tags=fantasy,adventure' \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Rate a Book
```bash
curl -X POST http://localhost:5000/book/abc123/rate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value": 5}'
```

### Track Reading Progress
```bash
curl -X POST http://localhost:5000/book/abc123/progress \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"currentPage": 150, "status": "reading"}'
```

## Support & Troubleshooting

### Common Issues

**401 Unauthorized**
- Token may be expired or invalid
- Try refreshing the token (see [Authentication](./authentication.md#refresh-token))

**403 Forbidden**
- You don't own this resource
- Only book owners can modify their books

**400 Bad Request**
- Check your request body format
- Ensure all required fields are present
- See specific endpoint docs for required fields

**404 Not Found**
- Resource doesn't exist
- Check the resource ID is correct

## Environment Variables

```env
# Server
PORT=5000
NODE_ENV=production|development

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/openbook

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRATION=24h
JWT_REFRESH_SECRET=your-refresh-secret
JWT_REFRESH_EXPIRATION=7d

# File Uploads
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800  # 50MB in bytes
```

## Version History

### v1.0.0 - Initial Release
- Authentication with JWT
- Books CRUD operations
- Reading progress tracking
- Book ratings
- **NEW:** Book tags and tag-based search
- Read lists (collections)

---

**Last Updated:** July 22, 2026  
**API Version:** 1.0.0
