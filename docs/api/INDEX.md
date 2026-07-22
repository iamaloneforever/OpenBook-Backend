# 📚 OpenBook API Documentation - Complete Index

## Overview

The OpenBook API documentation is organized into the following sections:

### 🚀 Start Here

1. **[GETTING_STARTED.md](./GETTING_STARTED.md)** - Complete walkthrough
   - Create an account
   - Create your first book
   - Tag books
   - Track progress
   - Rate books
   - Code examples (bash, JavaScript, Python)

2. **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** - Quick lookup
   - All endpoints at a glance
   - Common curl commands
   - Status codes
   - Base URLs

### 📖 Detailed References

3. **[README.md](./README.md)** - API Overview
   - Base URL
   - Authentication
   - Response format
   - Pagination
   - Common tasks
   - Best practices

4. **[authentication.md](./authentication.md)** - Auth Endpoints
   - POST `/auth/register` - Create account
   - POST `/auth/login` - Login
   - POST `/auth/refresh` - Refresh token
   - POST `/auth/logout` - Logout
   - Token management
   - Security best practices

5. **[books.md](./books.md)** - Books Endpoints
   - GET `/book` - List books
   - GET `/book/top/trending` - Trending books
   - GET `/book/:id` - Get single book
   - POST `/book` - Create book
   - PUT `/book/:id` - Update book
   - DELETE `/book/:id` - Delete book
   - POST `/book/:id/rate` - Rate book

6. **[tags.md](./tags.md)** ⭐ **NEW** - Tags Endpoints
   - POST `/book/:id/tags` - Set tags (replace)
   - PUT `/book/:id/tags/add` - Add tags
   - DELETE `/book/:id/tags` - Remove tags
   - GET `/book/tags/search` - Find by tags
   - GET `/book/tags/all` - Get all tags
   - Tag features and normalization
   - Use cases

7. **[progress.md](./progress.md)** - Progress Endpoints
   - GET `/book/:id/progress` - Get progress
   - POST `/book/:id/progress` - Set progress
   - Reading statuses
   - Auto-calculation

8. **[errors.md](./errors.md)** - Error Handling
   - HTTP status codes
   - Common error scenarios
   - Error response format
   - Debugging tips
   - Best practices

## Feature Summary

### Core Features
✅ User authentication with JWT tokens
✅ Create and manage books (digital & physical)
✅ Rate and review books
✅ Track reading progress
✅ **NEW:** Tag books for organization
✅ Search books by title, author, tags
✅ Trending/top books

### Book Types Supported
- 📱 **Digital Books** - via URL or EPUB file upload
- 📕 **Physical Books** - with location information

### Tag Features (NEW)
🏷️ Case-insensitive tag management
🏷️ Automatic duplicate prevention
🏷️ Search books by multiple tags
🏷️ Tag usage statistics
🏷️ Full ownership protection

## Common Tasks

| Task | Endpoint |
|------|----------|
| Register | POST /auth/register |
| Login | POST /auth/login |
| Create book | POST /book |
| Find my books | GET /book |
| Search books | GET /book?q=search |
| Tag a book | POST /book/:id/tags |
| Find by tag | GET /book/tags/search?tags=fiction |
| Rate a book | POST /book/:id/rate |
| Update progress | POST /book/:id/progress |

## Code Examples

All documentation includes examples in:
- 🔷 **bash/curl** - Command line
- 🔶 **JavaScript** - Node.js / Browser
- 🔵 **Python** - Python requests library

## API Statistics

- **Total Endpoints:** 20+
- **Authentication:** JWT Bearer tokens
- **Response Format:** JSON
- **Pagination:** Supported on list endpoints
- **Cache:** Yes (see specific endpoints)

## Getting Help

### By Topic
- **Can't login?** → [authentication.md](./authentication.md)
- **Book not found?** → [errors.md](./errors.md)
- **Want to tag?** → [tags.md](./tags.md)
- **Track reading?** → [progress.md](./progress.md)

### Documentation Files Size
- Getting Started: ~8.8 KB
- Tags API: ~9.8 KB
- Books API: ~10.5 KB
- Error Handling: ~9.4 KB
- Authentication: ~8.2 KB
- Quick Reference: ~4.2 KB
- Progress: ~3.2 KB
- **Total:** ~54 KB of documentation

## API Status

| Feature | Status | Docs |
|---------|--------|------|
| Authentication | ✅ Stable | [auth.md](./authentication.md) |
| Books | ✅ Stable | [books.md](./books.md) |
| Tags | ✅ NEW | [tags.md](./tags.md) |
| Progress | ✅ Stable | [progress.md](./progress.md) |
| Ratings | ✅ Stable | [books.md](./books.md) |

## Version History

### v1.0.0 (Current)
- Initial API release
- Books management
- Authentication
- Reading progress
- Book ratings
- **NEW:** Book tags and tag-based search
- Error handling

## Next Steps

1. 🚀 [Start with Getting Started guide](./GETTING_STARTED.md)
2. 📖 Choose an API reference based on your needs
3. 🔍 Check [Quick Reference](./QUICK_REFERENCE.md) for commands
4. ❌ Review [errors.md](./errors.md) for common issues
5. 🎯 [View full README](./README.md) for best practices

## Document Structure

```
docs/api/
├── INDEX.md                    # This file
├── README.md                   # API overview & best practices
├── GETTING_STARTED.md         # Tutorial & examples
├── QUICK_REFERENCE.md         # Command cheat sheet
│
├── authentication.md          # Auth endpoints
├── books.md                   # Books endpoints
├── tags.md                    # Tags endpoints (NEW)
├── progress.md                # Progress endpoints
└── errors.md                  # Error handling
```

---

**Last Updated:** July 22, 2026  
**API Version:** 1.0.0  
**Documentation Version:** 1.0.0

**Quick Links:**
- [Start Here →](./GETTING_STARTED.md)
- [API Overview →](./README.md)
- [Quick Commands →](./QUICK_REFERENCE.md)
