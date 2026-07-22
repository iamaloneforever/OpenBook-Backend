# Authentication API Documentation

Complete reference for user authentication and authorization.

## Overview

OpenBook uses JWT (JSON Web Tokens) for authentication. Users receive access tokens and refresh tokens upon login.

- **Access Token**: Short-lived (24 hours), used for API requests
- **Refresh Token**: Long-lived (7 days), stored securely in httpOnly cookies

## Endpoints

### Register (Sign Up)

Create a new user account.

**Request**
```http
POST /auth/register
Content-Type: application/json

{
  "username": "john_doe",
  "password": "SecurePassword123!"
}
```

**Parameters**
- `username` (required) - Unique username (3-50 characters)
- `password` (required) - Password (8+ characters)

**Response** - 201 Created
```json
{
  "id": "clx4p8j9k0000q8r9z0z0z0z0",
  "username": "john_doe",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "createdAt": "2026-07-22T15:53:21.259Z"
}
```

**Cookie** (Set automatically)
- `refreshToken` - Secure, httpOnly cookie (7-day expiration)

**Example**
```bash
curl -X POST http://localhost:5000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "password": "SecurePassword123!"
  }'
```

**Errors**
- `409 Conflict` - Username already exists
- `400 Bad Request` - Invalid input

---

### Login

Authenticate and receive tokens.

**Request**
```http
POST /auth/login
Content-Type: application/json

{
  "username": "john_doe",
  "password": "SecurePassword123!"
}
```

**Parameters**
- `username` (required) - User's username
- `password` (required) - User's password

**Response** - 200 OK
```json
{
  "id": "clx4p8j9k0000q8r9z0z0z0z0",
  "username": "john_doe",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "createdAt": "2026-07-22T15:53:21.259Z"
}
```

**Cookie** (Set automatically)
- `refreshToken` - Secure, httpOnly cookie (7-day expiration)

**Example**
```bash
curl -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "password": "SecurePassword123!"
  }' \
  -c cookies.txt
```

**Errors**
- `401 Unauthorized` - Invalid credentials
- `404 Not Found` - User not found

---

### Refresh Token

Get a new access token using the refresh token.

**Request**
```http
POST /auth/refresh
Cookie: refreshToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response** - 200 OK
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Cookie** (Set automatically)
- `refreshToken` - New refresh token (7-day expiration)

**Note:** Refresh tokens rotate on each refresh for security. The old token is automatically invalidated.

**Example**
```bash
curl -X POST http://localhost:5000/auth/refresh \
  -b cookies.txt
```

**Errors**
- `401 Unauthorized` - Invalid or expired refresh token

---

### Logout

Revoke the current refresh token and clear the cookie.

**Request**
```http
POST /auth/logout
Authorization: Bearer YOUR_ACCESS_TOKEN
Cookie: refreshToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response** - 200 OK
```json
{
  "message": "Logged out successfully"
}
```

**Cookie** (Cleared automatically)
- `refreshToken` - Deleted

**Example**
```bash
curl -X POST http://localhost:5000/auth/logout \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -b cookies.txt
```

---

## Token Format

JWT tokens contain three parts separated by dots: `header.payload.signature`

### Header
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

### Payload (Access Token)
```json
{
  "sub": "user-id",
  "username": "john_doe",
  "iat": 1687447601,
  "exp": 1687534001
}
```

### Payload (Refresh Token)
```json
{
  "sub": "user-id",
  "username": "john_doe",
  "type": "refresh",
  "iat": 1687447601,
  "exp": 1688052401
}
```

## Token Expiration

- **Access Token**: 24 hours
- **Refresh Token**: 7 days (stored in httpOnly cookie)

## Using Tokens

### In Headers
```bash
curl http://localhost:5000/book \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### In Cookies
Refresh tokens are automatically sent in cookies (httpOnly):
```bash
curl http://localhost:5000/auth/refresh \
  -b cookies.txt
```

## Security Best Practices

### 1. Token Storage
- ✅ Store refresh tokens in httpOnly, Secure cookies
- ❌ Never store tokens in localStorage (XSS vulnerable)
- ✅ Access tokens can be stored in memory

### 2. Token Usage
- Use access tokens for all API requests
- Refresh before expiration for uninterrupted service
- Clear tokens on logout

### 3. Password Requirements
- Minimum 8 characters
- Should contain mix of: uppercase, lowercase, numbers, special characters
- Use bcrypt hashing (Argon2 recommended)

### 4. HTTPS
- Always use HTTPS in production
- Set `Secure` flag on cookies
- Set `SameSite=Lax` to prevent CSRF

## Common Workflows

### Workflow 1: Login and Make Request
```bash
# 1. Login
LOGIN_RESPONSE=$(curl -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "password": "SecurePassword123!"
  }')

ACCESS_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.accessToken')

# 2. Use access token in requests
curl http://localhost:5000/book \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### Workflow 2: Auto-Refresh on Expiration
```javascript
// Pseudo-code
async function makeApiRequest(endpoint) {
  let response = await fetch(endpoint, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (response.status === 401) {
    // Token expired, refresh it
    const refreshResponse = await fetch('/auth/refresh', {
      method: 'POST',
      credentials: 'include' // Include cookies
    });
    
    const { accessToken: newToken } = await refreshResponse.json();
    accessToken = newToken;
    
    // Retry request with new token
    response = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
  }

  return response;
}
```

### Workflow 3: Logout and Cleanup
```bash
# 1. Logout (revokes refresh token)
curl -X POST http://localhost:5000/auth/logout \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -b cookies.txt

# 2. Clear local tokens
unset ACCESS_TOKEN
rm cookies.txt
```

## Error Responses

### 401 Unauthorized - Invalid Credentials
```json
{
  "statusCode": 401,
  "message": "Invalid credentials",
  "error": "Unauthorized"
}
```

### 401 Unauthorized - Token Expired
```json
{
  "statusCode": 401,
  "message": "Token expired",
  "error": "Unauthorized"
}
```

### 409 Conflict - User Already Exists
```json
{
  "statusCode": 409,
  "message": "Username already exists",
  "error": "Conflict"
}
```

### 400 Bad Request - Validation Error
```json
{
  "statusCode": 400,
  "message": "Validation failed: password must be at least 8 characters",
  "error": "Bad Request"
}
```

## Environment Variables

```env
# JWT Configuration
JWT_SECRET=your-secret-key-min-32-chars
JWT_EXPIRATION=24h
JWT_REFRESH_SECRET=your-refresh-secret-min-32-chars
JWT_REFRESH_EXPIRATION=7d

# Session Configuration
SESSION_SECURE=true  # https only
SESSION_HTTP_ONLY=true
SESSION_SAME_SITE=lax
```

## Postman Collection Example

```json
{
  "info": {
    "name": "OpenBook Auth",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Register",
      "request": {
        "method": "POST",
        "header": [{"key": "Content-Type", "value": "application/json"}],
        "url": {"raw": "{{base_url}}/auth/register", "host": ["localhost"], "port": 5000},
        "body": {"mode": "raw", "raw": "{\"username\": \"user\", \"password\": \"pass\"}"}
      }
    },
    {
      "name": "Login",
      "request": {
        "method": "POST",
        "header": [{"key": "Content-Type", "value": "application/json"}],
        "url": {"raw": "{{base_url}}/auth/login", "host": ["localhost"], "port": 5000},
        "body": {"mode": "raw", "raw": "{\"username\": \"user\", \"password\": \"pass\"}"}
      }
    }
  ]
}
```

---

**Last Updated:** July 22, 2026  
**API Version:** 1.0.0
