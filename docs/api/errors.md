# Error Handling Guide

Comprehensive guide to error codes and error handling strategies.

## HTTP Status Codes

| Code | Status | Description |
|------|--------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |
| 204 | No Content | Request successful, no response body |
| 400 | Bad Request | Invalid input or validation error |
| 401 | Unauthorized | Missing or invalid authentication token |
| 403 | Forbidden | Authenticated but access denied (not owner) |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Resource already exists (e.g., duplicate ISBN) |
| 500 | Internal Server Error | Unexpected server error |

## Error Response Format

All error responses follow this format:

```json
{
  "statusCode": 400,
  "message": "Error description or validation message",
  "error": "Error Type"
}
```

## Common Error Scenarios

### 1. Authentication Errors

#### Missing Token
```
Request: GET /book (no Authorization header)

Response: 401 Unauthorized
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

**Solution:** Include valid JWT token in Authorization header
```bash
curl http://localhost:5000/book \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Invalid Token
```
Request: GET /book with invalid token

Response: 401 Unauthorized
{
  "statusCode": 401,
  "message": "Invalid token",
  "error": "Unauthorized"
}
```

**Solution:** 
- Check token is valid
- Refresh token if expired
- Login again if necessary

#### Expired Token
```
Request: GET /book with expired token

Response: 401 Unauthorized
{
  "statusCode": 401,
  "message": "Token expired",
  "error": "Unauthorized"
}
```

**Solution:** Refresh the token
```bash
curl -X POST http://localhost:5000/auth/refresh \
  -b cookies.txt
```

### 2. Authorization Errors

#### Not Owner (403)
```
Request: PUT /book/abc123 (book belongs to different user)

Response: 403 Forbidden
{
  "statusCode": 403,
  "message": "Forbidden resource",
  "error": "Forbidden"
}
```

**Solution:** 
- Only book owners can modify books
- Create your own book or request permission
- Use `/book/top/trending` to view public books

### 3. Validation Errors

#### Invalid Input Format
```
Request: POST /book/abc123/rate
Body: { "value": "not-a-number" }

Response: 400 Bad Request
{
  "statusCode": 400,
  "message": "Validation failed: value must be a number",
  "error": "Bad Request"
}
```

**Solution:** 
- Check request body format
- Ensure correct data types
- See endpoint documentation for required fields

#### Missing Required Field
```
Request: POST /book
Body: { "author": "Author Name" }  // missing "title"

Response: 400 Bad Request
{
  "statusCode": 400,
  "message": "Validation failed: title is required",
  "error": "Bad Request"
}
```

**Solution:**
- Include all required fields
- Check field names spelling
- Refer to API documentation

#### Invalid Tag Format
```
Request: POST /book/abc123/tags
Body: { "tags": "fiction" }  // should be array

Response: 400 Bad Request
{
  "statusCode": 400,
  "message": "Validation failed: tags must be an array",
  "error": "Bad Request"
}
```

**Solution:**
```json
{
  "tags": ["fiction", "adventure"]
}
```

### 4. Resource Not Found

#### Book Not Found
```
Request: GET /book/nonexistent-id

Response: 404 Not Found
{
  "statusCode": 404,
  "message": "Book not found",
  "error": "Not Found"
}
```

**Solution:**
- Check book ID is correct
- Use `/book` endpoint to list your books
- Book may have been deleted

#### User Not Found
```
Request: POST /auth/login
Body: { "username": "nonexistent_user", "password": "..." }

Response: 404 Not Found
{
  "statusCode": 404,
  "message": "User not found",
  "error": "Not Found"
}
```

**Solution:**
- Check username spelling
- Register account if new user
- Use `/auth/register` endpoint

### 5. Conflict Errors

#### Duplicate ISBN
```
Request: POST /book
Body: { 
  "isbn": "978-0-451-52494-2",  // already exists
  ...
}

Response: 409 Conflict
{
  "statusCode": 409,
  "message": "ISBN already exists",
  "error": "Conflict"
}
```

**Solution:**
- Check ISBN is unique or omit if not needed
- Create a new book entry instead
- Update existing book instead

#### User Already Exists
```
Request: POST /auth/register
Body: { "username": "existing_user", "password": "..." }

Response: 409 Conflict
{
  "statusCode": 409,
  "message": "Username already exists",
  "error": "Conflict"
}
```

**Solution:**
- Choose different username
- Login with existing account
- Use password reset if forgotten

### 6. Business Logic Errors

#### Cannot Change Book Type
```
Request: PUT /book/abc123
Body: { "type": "DIGITAL" }  // was PHYSICAL

Response: 400 Bad Request
{
  "statusCode": 400,
  "message": "Changing book type is not allowed",
  "error": "Bad Request"
}
```

**Solution:**
- Delete and recreate book with correct type
- Book type cannot be changed after creation

#### Invalid Book Type
```
Request: POST /book
Body: { "type": "INVALID_TYPE" }

Response: 400 Bad Request
{
  "statusCode": 400,
  "message": "Validation failed: type must be DIGITAL or PHYSICAL",
  "error": "Bad Request"
}
```

**Solution:**
```json
{
  "type": "DIGITAL"  // or "PHYSICAL"
}
```

#### Digital Book Missing Source
```
Request: POST /book
Body: {
  "type": "DIGITAL",
  "digitalBook": {}  // no url or file
}

Response: 400 Bad Request
{
  "statusCode": 400,
  "message": "Digital books must have either a URL or an EPUB file",
  "error": "Bad Request"
}
```

**Solution:**
- Provide either `url` or upload file
- Not both

#### Physical Book Missing Data
```
Request: POST /book
Body: {
  "type": "PHYSICAL"
  // physicalBook missing
}

Response: 400 Bad Request
{
  "statusCode": 400,
  "message": "Physical book data is required",
  "error": "Bad Request"
}
```

**Solution:**
```json
{
  "type": "PHYSICAL",
  "physicalBook": {
    "address": "123 Main St",
    "city": "New York",
    "country": "USA"
  }
}
```

### 7. Server Errors

#### 500 Internal Server Error
```
Response: 500 Internal Server Error
{
  "statusCode": 500,
  "message": "Internal server error",
  "error": "Internal Server Error"
}
```

**Solution:**
- Check request is valid
- Try again after a moment
- Report to support if persists
- Check server logs

## Error Handling Best Practices

### 1. Always Check Status Code
```javascript
const response = await fetch('/api/endpoint');

if (!response.ok) {
  const error = await response.json();
  console.error(`Error: ${error.statusCode} - ${error.message}`);
  // Handle error appropriately
} else {
  const data = await response.json();
  // Process data
}
```

### 2. Handle Token Expiration
```javascript
async function makeRequest(url) {
  let response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (response.status === 401) {
    // Try refreshing token
    const refreshResponse = await fetch('/auth/refresh', {
      method: 'POST',
      credentials: 'include'
    });

    if (refreshResponse.ok) {
      const { accessToken } = await refreshResponse.json();
      token = accessToken;
      
      // Retry request
      response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } else {
      // Login required
      window.location.href = '/login';
    }
  }

  return response;
}
```

### 3. Validate Input Before Sending
```javascript
function validateBook(book) {
  const errors = [];
  
  if (!book.title) errors.push('Title is required');
  if (!book.author) errors.push('Author is required');
  if (!['DIGITAL', 'PHYSICAL'].includes(book.type)) {
    errors.push('Invalid book type');
  }
  
  return errors;
}

const errors = validateBook(bookData);
if (errors.length > 0) {
  console.error('Validation failed:', errors);
  return;
}
```

### 4. Provide User-Friendly Messages
```javascript
const errorMessages = {
  400: 'Please check your input and try again',
  401: 'Please login to continue',
  403: 'You don\'t have permission to do this',
  404: 'The resource you\'re looking for doesn\'t exist',
  409: 'This resource already exists',
  500: 'Something went wrong. Please try again later'
};

function getUserMessage(statusCode, serverMessage) {
  return errorMessages[statusCode] || serverMessage;
}
```

### 5. Log Errors for Debugging
```javascript
async function logError(error) {
  console.error({
    timestamp: new Date().toISOString(),
    statusCode: error.statusCode,
    message: error.message,
    url: window.location.href,
    userAgent: navigator.userAgent
  });
  
  // Send to error tracking service
  // sendToErrorTracking(error);
}
```

## Debugging Tips

### 1. Check Server Logs
```bash
# View recent logs
docker logs openbook-backend | tail -100

# View specific error
docker logs openbook-backend | grep "error"
```

### 2. Use Network Inspector
- Open browser DevTools
- Go to Network tab
- Check request/response headers
- Look for error details in response body

### 3. Test with curl
```bash
# Test endpoint
curl -X GET http://localhost:5000/book \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -v  # verbose mode shows headers
```

### 4. Validate JSON
```bash
# Pretty print response
curl http://localhost:5000/book | jq .

# Validate JSON syntax
echo '{"key": "value"}' | jq empty && echo "Valid"
```

---

**Last Updated:** July 22, 2026  
**API Version:** 1.0.0
