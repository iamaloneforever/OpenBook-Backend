# Books API Documentation

Complete reference for book management endpoints.

## Endpoints

### Get All Books

Retrieve all books belonging to the authenticated user with search and filter options.

**Request**
```http
GET /book?q=harry&author=rowling&minRating=4&maxRating=5&sort=createdAt&order=desc&page=1&limit=10
Authorization: Bearer YOUR_TOKEN
```

**Query Parameters**
- `q` (optional) - Search query (searches title, description, author, ISBN)
- `author` (optional) - Filter by author name
- `minRating` (optional) - Minimum average rating (0-5)
- `maxRating` (optional) - Maximum average rating (0-5)
- `sort` (optional) - Sort field (createdAt, title, author, averageRating), default: createdAt
- `order` (optional) - Sort order (asc, desc), default: desc
- `page` (optional) - Page number, default: 1
- `limit` (optional) - Items per page, default: 10, max: 100

**Response** - 200 OK
```json
{
  "data": [
    {
      "id": "book-id-1",
      "title": "Harry Potter and the Philosopher's Stone",
      "author": "J.K. Rowling",
      "description": "The first book in the Harry Potter series...",
      "isbn": "978-0-439-13959-2",
      "type": "DIGITAL",
      "publishedAt": "1997-06-26T00:00:00Z",
      "coverUrl": "/uploads/covers/hp1.jpg",
      "totalPages": 309,
      "averageRating": 4.8,
      "ratingsCount": 1250,
      "ownerId": "user-id",
      "digitalBook": {
        "id": "digital-book-id",
        "bookId": "book-id-1",
        "source": "FILE",
        "url": null,
        "filePath": "/uploads/books/files/hp1.epub",
        "fileType": "EPUB",
        "fileSize": 2097152
      },
      "physicalBook": null,
      "createdAt": "2026-07-22T15:53:21.259Z",
      "updatedAt": "2026-07-22T15:53:21.259Z"
    }
  ],
  "meta": {
    "total": 156,
    "page": 1,
    "limit": 10,
    "totalPages": 16
  }
}
```

**Examples**
```bash
# Get all books
curl http://localhost:5000/book \
  -H "Authorization: Bearer YOUR_TOKEN"

# Search for books
curl 'http://localhost:5000/book?q=Harry%20Potter' \
  -H "Authorization: Bearer YOUR_TOKEN"

# Filter by author and rating
curl 'http://localhost:5000/book?author=Rowling&minRating=4' \
  -H "Authorization: Bearer YOUR_TOKEN"

# Paginate results
curl 'http://localhost:5000/book?page=2&limit=20' \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### Get Top/Trending Books

Retrieve the most rated, read, or recently updated books (public endpoint).

**Request**
```http
GET /book/top/trending?sort=rating&page=1&limit=10
```

**Query Parameters**
- `sort` (optional) - Sort by 'rating', 'reads', or 'trending', default: rating
- `page` (optional) - Page number, default: 1
- `limit` (optional) - Items per page, default: 10, max: 100

**Response** - 200 OK
```json
{
  "data": [
    {
      "id": "book-id",
      "title": "The Great Gatsby",
      "author": "F. Scott Fitzgerald",
      "description": "...",
      "coverUrl": "/uploads/covers/gatsby.jpg",
      "type": "DIGITAL",
      "averageRating": 4.9,
      "ratingsCount": 5000,
      "owner": {
        "id": "user-id",
        "username": "literary_enthusiast"
      },
      "digitalBook": {...},
      "physicalBook": null,
      "_count": {
        "ratings": 5000
      },
      "createdAt": "2026-07-20T10:00:00Z",
      "updatedAt": "2026-07-22T15:53:21.259Z"
    }
  ],
  "meta": {
    "total": 856,
    "page": 1,
    "limit": 10,
    "totalPages": 86
  }
}
```

**Example**
```bash
curl 'http://localhost:5000/book/top/trending?sort=rating&limit=5'
```

---

### Get Single Book

Retrieve a single book with progress information if authenticated.

**Request**
```http
GET /book/:id
Authorization: Bearer YOUR_TOKEN
```

**Parameters**
- `:id` (path) - Book ID (required)

**Response** - 200 OK
```json
{
  "id": "clx4p8j9k0000q8r9z0z0z0z0",
  "title": "The Hobbit",
  "author": "J.R.R. Tolkien",
  "description": "A fantasy adventure...",
  "isbn": "978-0-547-92822-8",
  "type": "DIGITAL",
  "publishedAt": "1937-09-21T00:00:00Z",
  "coverUrl": "/uploads/covers/hobbit.jpg",
  "totalPages": 310,
  "averageRating": 4.7,
  "ratingsCount": 2100,
  "ownerId": "user-123",
  "tags": ["fantasy", "adventure", "classic"],
  "progress": {
    "id": "progress-id",
    "userId": "current-user-id",
    "bookId": "clx4p8j9k0000q8r9z0z0z0z0",
    "currentPage": 157,
    "totalPages": 310,
    "progressPercentage": 50,
    "status": "READING",
    "startedAt": "2026-07-15T10:00:00Z",
    "completedAt": null,
    "updatedAt": "2026-07-22T15:53:21.259Z"
  },
  "stats": {
    "totalReaders": 45,
    "totalRatings": 2100,
    "averageRating": 4.7
  },
  "digitalBook": {...},
  "physicalBook": null,
  "createdAt": "2026-07-20T10:00:00Z",
  "updatedAt": "2026-07-22T15:53:21.259Z"
}
```

**Example**
```bash
curl http://localhost:5000/book/clx4p8j9k0000q8r9z0z0z0z0 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### Create Book

Create a new book. Supports both digital and physical books.

**Request - Digital Book with URL**
```http
POST /book
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "title": "1984",
  "author": "George Orwell",
  "description": "A dystopian novel set in a totalitarian society",
  "isbn": "978-0-451-52494-2",
  "type": "DIGITAL",
  "publishedAt": "1949-06-08",
  "totalPages": 328,
  "digitalBook": {
    "url": "https://example.com/books/1984.epub"
  }
}
```

**Request - Digital Book with EPUB File**
```http
POST /book
Authorization: Bearer YOUR_TOKEN
Content-Type: multipart/form-data

Form Data:
- file: <EPUB file> (multipart field name: "file")
- cover: <Image file> (optional, multipart field name: "cover")
- title: "1984"
- author: "George Orwell"
- type: "DIGITAL"
- digitalBook: {"source": "FILE"}
```

**Request - Physical Book**
```http
POST /book
Authorization: Bearer YOUR_TOKEN
Content-Type: multipart/form-data

Form Data:
- cover: <Image file> (optional)
- title: "1984"
- author: "George Orwell"
- type: "PHYSICAL"
- physicalBook: {
    "address": "123 Main St",
    "city": "New York",
    "country": "USA",
    "postalCode": "10001"
  }
```

**Parameters**
- `title` (required) - Book title
- `author` (required) - Author name
- `description` (optional) - Book description
- `isbn` (optional) - ISBN-10 or ISBN-13 (must be unique)
- `type` (required) - DIGITAL or PHYSICAL
- `publishedAt` (optional) - Publication date (ISO 8601)
- `totalPages` (optional) - Total pages
- `digitalBook` (required for DIGITAL) - Digital book data
  - `url` OR file upload required
- `physicalBook` (required for PHYSICAL) - Physical book data
  - `address`, `city`, `country` required
  - `postalCode` optional

**File Upload Constraints**
- Maximum file size: 50 MB
- Cover formats: JPG, JPEG, PNG, WebP
- EPUB format: .epub only
- Filenames: auto-generated with UUID

**Response** - 201 Created
```json
{
  "id": "clx4p8j9k0000q8r9z0z0z0z0",
  "title": "1984",
  "author": "George Orwell",
  "description": "A dystopian novel...",
  "isbn": "978-0-451-52494-2",
  "type": "DIGITAL",
  "publishedAt": "1949-06-08T00:00:00Z",
  "coverUrl": "/uploads/covers/uuid-cover.jpg",
  "totalPages": 328,
  "averageRating": 0,
  "ratingsCount": 0,
  "ownerId": "user-id",
  "digitalBook": {
    "id": "digital-id",
    "bookId": "clx4p8j9k0000q8r9z0z0z0z0",
    "source": "URL",
    "url": "https://example.com/books/1984.epub",
    "filePath": null,
    "fileType": null,
    "fileSize": null
  },
  "physicalBook": null,
  "createdAt": "2026-07-22T15:53:21.259Z",
  "updatedAt": "2026-07-22T15:53:21.259Z"
}
```

**Examples**
```bash
# Create digital book with URL
curl -X POST http://localhost:5000/book \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "1984",
    "author": "George Orwell",
    "type": "DIGITAL",
    "digitalBook": {
      "url": "https://example.com/1984.epub"
    }
  }'

# Create physical book
curl -X POST http://localhost:5000/book \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "To Kill a Mockingbird",
    "author": "Harper Lee",
    "type": "PHYSICAL",
    "physicalBook": {
      "address": "123 Library Lane",
      "city": "New York",
      "country": "USA"
    }
  }'
```

---

### Update Book

Update book information. Can change digital/physical data but not book type.

**Request**
```http
PUT /book/:id
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "title": "1984 - Updated Edition",
  "description": "Updated description...",
  "publishedAt": "1949-06-08"
}
```

**Response** - 200 OK
Same as Create Book response.

---

### Delete Book

Delete a book and all associated data.

**Request**
```http
DELETE /book/:id
Authorization: Bearer YOUR_TOKEN
```

**Response** - 200 OK
```json
{
  "message": "Book deleted successfully"
}
```

---

### Rate Book

Add or update a rating for a book.

**Request**
```http
POST /book/:id/rate
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "value": 5
}
```

**Parameters**
- `value` (required) - Rating value (1-5)

**Response** - 200 OK
```json
{
  "id": "clx4p8j9k0000q8r9z0z0z0z0",
  "title": "The Hobbit",
  "averageRating": 4.75,
  "ratingsCount": 2101,
  "digitalBook": {...},
  "physicalBook": null,
  ...
}
```

---

## Book Types

### Digital Book
```json
{
  "type": "DIGITAL",
  "digitalBook": {
    "source": "URL|FILE",
    "url": "https://example.com/book.epub",
    "filePath": "/uploads/books/uuid.epub",
    "fileType": "EPUB",
    "fileSize": 2097152
  }
}
```

### Physical Book
```json
{
  "type": "PHYSICAL",
  "physicalBook": {
    "address": "123 Main St",
    "city": "New York",
    "country": "USA",
    "postalCode": "10001",
    "borrowedBy": "user-id (optional)",
    "returnDate": "2026-08-15 (optional)"
  }
}
```

---

## Sorting Options

- `createdAt` - By creation date (default)
- `title` - Alphabetically by title
- `author` - Alphabetically by author
- `averageRating` - By average rating
- `updatedAt` - By last updated date

---

## Error Responses

### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Book not found",
  "error": "Not Found"
}
```

### 409 Conflict - Duplicate ISBN
```json
{
  "statusCode": 409,
  "message": "ISBN already exists",
  "error": "Conflict"
}
```

### 400 Bad Request - Invalid Type Change
```json
{
  "statusCode": 400,
  "message": "Changing book type is not allowed",
  "error": "Bad Request"
}
```

---

**Last Updated:** July 22, 2026  
**API Version:** 1.0.0
