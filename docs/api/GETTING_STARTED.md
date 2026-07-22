# Getting Started with OpenBook API

This guide will walk you through the basics of using the OpenBook API.

## Prerequisites

- **Base URL**: `http://localhost:5000` (development) or `https://api.openbook.com` (production)
- **Tools**: curl, Postman, or any HTTP client
- **Account**: Create one to get started

## Step 1: Create an Account

Register a new user account:

```bash
curl -X POST http://localhost:5000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "bookworm2024",
    "password": "SecurePass123!"
  }'
```

**Response:**
```json
{
  "id": "user-123",
  "username": "bookworm2024",
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "createdAt": "2026-07-22T15:53:21.259Z"
}
```

**Save your tokens:**
```bash
export TOKEN="eyJhbGciOiJIUzI1NiIs..."
```

## Step 2: Create Your First Book

Add a book to your library. Let's create a digital book:

```bash
curl -X POST http://localhost:5000/book \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "The Hobbit",
    "author": "J.R.R. Tolkien",
    "description": "A fantasy adventure about a hobbit named Bilbo",
    "isbn": "978-0-547-92822-8",
    "type": "DIGITAL",
    "totalPages": 310,
    "publishedAt": "1937-09-21",
    "digitalBook": {
      "url": "https://example.com/thehobbit.epub"
    }
  }'
```

**Response:**
```json
{
  "id": "book-456",
  "title": "The Hobbit",
  "author": "J.R.R. Tolkien",
  "type": "DIGITAL",
  "totalPages": 310,
  "averageRating": 0,
  "ratingsCount": 0,
  "createdAt": "2026-07-22T15:53:21.259Z",
  ...
}
```

**Save the book ID:**
```bash
export BOOK_ID="book-456"
```

## Step 3: Tag Your Book

Organize your books with tags:

```bash
curl -X POST http://localhost:5000/book/$BOOK_ID/tags \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tags": ["fantasy", "adventure", "classic"]
  }'
```

## Step 4: Track Reading Progress

Update your reading progress:

```bash
curl -X POST http://localhost:5000/book/$BOOK_ID/progress \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPage": 100,
    "totalPages": 310,
    "status": "READING"
  }'
```

## Step 5: Rate the Book

Rate the book you've read:

```bash
curl -X POST http://localhost:5000/book/$BOOK_ID/rate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "value": 4
  }'
```

## Step 6: Search and Filter Books

### Get all your books
```bash
curl http://localhost:5000/book \
  -H "Authorization: Bearer $TOKEN"
```

### Search by title or author
```bash
curl 'http://localhost:5000/book?q=hobbit' \
  -H "Authorization: Bearer $TOKEN"
```

### Find books by tags
```bash
curl 'http://localhost:5000/book/tags/search?tags=fantasy,adventure' \
  -H "Authorization: Bearer $TOKEN"
```

### Get trending books
```bash
curl http://localhost:5000/book/top/trending?sort=rating&limit=5
```

## Step 7: Manage Tags

### Add more tags
```bash
curl -X PUT http://localhost:5000/book/$BOOK_ID/tags/add \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tags": ["favorite", "to-reread"]
  }'
```

### Remove tags
```bash
curl -X DELETE http://localhost:5000/book/$BOOK_ID/tags \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tags": ["old-tag"]
  }'
```

### View all available tags
```bash
curl http://localhost:5000/book/tags/all
```

## Common Workflows

### Workflow: Complete a Book

```bash
# Mark as completed
curl -X POST http://localhost:5000/book/$BOOK_ID/progress \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPage": 310,
    "totalPages": 310,
    "status": "COMPLETED"
  }'

# Rate it
curl -X POST http://localhost:5000/book/$BOOK_ID/rate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value": 5}'

# Add review tags
curl -X PUT http://localhost:5000/book/$BOOK_ID/tags/add \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tags": ["completed-2024", "highly-recommended"]
  }'
```

### Workflow: Search for Books to Read

```bash
# Find fantasy books
curl 'http://localhost:5000/book/tags/search?tags=fantasy&limit=10' \
  -H "Authorization: Bearer $TOKEN"

# Get your fantasy books sorted by rating
curl 'http://localhost:5000/book?tag=fantasy&sort=averageRating&order=desc' \
  -H "Authorization: Bearer $TOKEN"

# Filter to highly-rated ones
curl 'http://localhost:5000/book?minRating=4&tag=fantasy' \
  -H "Authorization: Bearer $TOKEN"
```

## Using Postman

1. **Create a new collection** - "OpenBook API"
2. **Add environment variables:**
   ```
   base_url = http://localhost:5000
   token = YOUR_TOKEN_HERE
   book_id = BOOK_ID_HERE
   ```

3. **Set Authorization header:**
   - Type: Bearer Token
   - Token: {{token}}

4. **Create requests:**
   - `{{base_url}}/book` (GET - list books)
   - `{{base_url}}/book` (POST - create book)
   - `{{base_url}}/book/{{book_id}}/tags` (POST - set tags)

## Using JavaScript/Node.js

```javascript
const BASE_URL = 'http://localhost:5000';
let token = '';

// Register
async function register(username, password) {
  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  token = data.accessToken;
  return data;
}

// Create book
async function createBook(bookData) {
  const res = await fetch(`${BASE_URL}/book`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(bookData)
  });
  return res.json();
}

// Tag book
async function tagBook(bookId, tags) {
  const res = await fetch(`${BASE_URL}/book/${bookId}/tags`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tags })
  });
  return res.json();
}

// Example usage
(async () => {
  await register('user123', 'Password123!');
  const book = await createBook({
    title: 'The Hobbit',
    author: 'J.R.R. Tolkien',
    type: 'DIGITAL',
    digitalBook: { url: 'https://example.com/hobbit.epub' }
  });
  await tagBook(book.id, ['fantasy', 'classic']);
  console.log('Book created and tagged!');
})();
```

## Using Python

```python
import requests

BASE_URL = 'http://localhost:5000'
token = ''

def register(username, password):
    global token
    res = requests.post(f'{BASE_URL}/auth/register', json={
        'username': username,
        'password': password
    })
    data = res.json()
    token = data['accessToken']
    return data

def create_book(book_data):
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    res = requests.post(f'{BASE_URL}/book', json=book_data, headers=headers)
    return res.json()

def tag_book(book_id, tags):
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    res = requests.post(f'{BASE_URL}/book/{book_id}/tags', 
                       json={'tags': tags}, headers=headers)
    return res.json()

# Example usage
register('user123', 'Password123!')
book = create_book({
    'title': 'The Hobbit',
    'author': 'J.R.R. Tolkien',
    'type': 'DIGITAL',
    'digitalBook': {'url': 'https://example.com/hobbit.epub'}
})
tag_book(book['id'], ['fantasy', 'classic'])
print('Book created and tagged!')
```

## Next Steps

- Read the [full API documentation](./README.md)
- Check [Tags API documentation](./tags.md) for advanced tagging
- Learn about [authentication](./authentication.md)
- Review [error handling guide](./errors.md)
- See [Quick Reference](./QUICK_REFERENCE.md)

## Troubleshooting

### "Unauthorized" Error
- Check token is valid
- Token may have expired - refresh it
- Login again if needed

### "Book not found"
- Check book ID is correct
- Book may have been deleted
- Make sure you own the book

### "Validation failed"
- Check request body format
- Ensure required fields are present
- See error message for specific field

### "Cannot connect to server"
- Ensure server is running
- Check base URL is correct
- Verify firewall allows connections

## Support

- 📚 [Full API Documentation](./README.md)
- 🏷️ [Tags API Guide](./tags.md)
- 📖 [Books API Guide](./books.md)
- 🔐 [Authentication Guide](./authentication.md)
- ❌ [Error Handling Guide](./errors.md)

---

**Last Updated:** July 22, 2026
**Ready to start?** Create your account above and begin organizing your library!
