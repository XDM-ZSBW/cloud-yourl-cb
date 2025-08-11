# cb-yourl-cloud API Documentation

## Overview
cb-yourl-cloud is a secure clipboard history service designed for friends and family to share and manage clipboard content across devices and products.

**Base URL:** `https://cb.yourl.cloud/api`
**Version:** 1.0.0

## Authentication
All protected endpoints require a valid JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Endpoints

### Authentication (`/api/auth`)

#### POST `/api/auth/register`
Register a new user account.

**Request Body:**
```json
{
  "username": "string",
  "email": "string",
  "password": "string",
  "firstName": "string",
  "lastName": "string"
}
```

**Response:**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "string",
    "username": "string",
    "email": "string",
    "firstName": "string",
    "lastName": "string",
    "createdAt": "date"
  }
}
```

#### POST `/api/auth/login`
Authenticate user and receive JWT token.

**Request Body:**
```json
{
  "email": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "token": "jwt-token-string",
  "user": {
    "id": "string",
    "username": "string",
    "email": "string"
  }
}
```

#### POST `/api/auth/refresh`
Refresh JWT token.

**Headers:**
```
Authorization: Bearer <current-jwt-token>
```

**Response:**
```json
{
  "message": "Token refreshed successfully",
  "token": "new-jwt-token-string"
}
```

#### POST `/api/auth/logout`
Logout user (invalidate token).

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```json
{
  "message": "Logout successful"
}
```

### Clipboard Management (`/api/clipboard`)

#### GET `/api/clipboard`
Get clipboard entries for a product.

**Query Parameters:**
- `productId` (required): Product ID
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)
- `type` (optional): Filter by content type
- `search` (optional): Search in content
- `tags` (optional): Filter by tags (comma-separated)
- `sortBy` (optional): Sort field (default: 'createdAt')
- `sortOrder` (optional): Sort order (asc/desc, default: 'desc')

**Response:**
```json
{
  "message": "Clipboard entries retrieved successfully",
  "entries": [
    {
      "id": "string",
      "content": "string",
      "type": "text|image|file|link",
      "tags": ["string"],
      "productId": "string",
      "createdBy": "string",
      "createdAt": "date",
      "updatedAt": "date"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

#### POST `/api/clipboard`
Create a new clipboard entry.

**Request Body:**
```json
{
  "content": "string",
  "type": "text|image|file|link",
  "tags": ["string"],
  "productId": "string"
}
```

**Response:**
```json
{
  "message": "Clipboard entry created successfully",
  "entry": {
    "id": "string",
    "content": "string",
    "type": "string",
    "tags": ["string"],
    "productId": "string",
    "createdBy": "string",
    "createdAt": "date"
  }
}
```

#### GET `/api/clipboard/:id`
Get a specific clipboard entry.

**Response:**
```json
{
  "message": "Clipboard entry retrieved successfully",
  "entry": {
    "id": "string",
    "content": "string",
    "type": "string",
    "tags": ["string"],
    "productId": "string",
    "createdBy": "string",
    "createdAt": "date",
    "updatedAt": "date"
  }
}
```

#### PUT `/api/clipboard/:id`
Update a clipboard entry.

**Request Body:**
```json
{
  "content": "string",
  "tags": ["string"]
}
```

**Response:**
```json
{
  "message": "Clipboard entry updated successfully",
  "entry": {
    "id": "string",
    "content": "string",
    "type": "string",
    "tags": ["string"],
    "productId": "string",
    "createdBy": "string",
    "updatedAt": "date"
  }
}
```

#### DELETE `/api/clipboard/:id`
Delete a clipboard entry.

#### POST `/api/clipboard/search`
Advanced search for clipboard entries.

**Request Body:**
```json
{
  "productId": "string",
  "query": "string",
  "filters": {
    "type": ["text", "image"],
    "tags": ["string"],
    "dateRange": {
      "start": "date",
      "end": "date"
    }
  },
  "sortBy": "string",
  "sortOrder": "asc|desc",
  "page": 1,
  "limit": 20
}
```

### User Management (`/api/users`)

#### GET `/api/users/profile`
Get current user profile.

**Response:**
```json
{
  "message": "Profile retrieved successfully",
  "user": {
    "id": "string",
    "username": "string",
    "email": "string",
    "firstName": "string",
    "lastName": "string",
    "createdAt": "date",
    "lastLogin": "date"
  }
}
```

#### PUT `/api/users/profile`
Update user profile.

**Request Body:**
```json
{
  "firstName": "string",
  "lastName": "string",
  "email": "string"
}
```

#### GET `/api/users/products`
Get products associated with the user.

**Response:**
```json
{
  "message": "Products retrieved successfully",
  "products": [
    {
      "id": "string",
      "name": "string",
      "description": "string",
      "role": "owner|member|viewer",
      "createdAt": "date"
    }
  ]
}
```

### Product Management (`/api/products`)

#### GET `/api/products`
Get all products accessible to the user.

**Response:**
```json
{
  "message": "Products retrieved successfully",
  "products": [
    {
      "id": "string",
      "name": "string",
      "description": "string",
      "owner": "string",
      "members": ["string"],
      "createdAt": "date",
      "updatedAt": "date"
    }
  ]
}
```

#### POST `/api/products`
Create a new product.

**Request Body:**
```json
{
  "name": "string",
  "description": "string"
}
```

#### GET `/api/products/:id`
Get product details.

**Response:**
```json
{
  "message": "Product retrieved successfully",
  "product": {
    "id": "string",
    "name": "string",
    "description": "string",
    "owner": "string",
    "members": ["string"],
    "createdAt": "date",
    "updatedAt": "date"
  }
}
```

#### PUT `/api/products/:id`
Update product details.

**Request Body:**
```json
{
  "name": "string",
  "description": "string"
}
```

#### DELETE `/api/products/:id`
Delete a product.

### Sharing (`/api/shares`)

#### POST `/api/shares/invite`
Invite a user to a product.

**Request Body:**
```json
{
  "productId": "string",
  "userEmail": "string",
  "role": "member|viewer"
}
```

#### GET `/api/shares/pending`
Get pending share invitations.

**Response:**
```json
{
  "message": "Pending invitations retrieved successfully",
  "invitations": [
    {
      "id": "string",
      "productId": "string",
      "productName": "string",
      "invitedBy": "string",
      "role": "string",
      "status": "pending",
      "createdAt": "date"
    }
  ]
}
```

#### POST `/api/shares/accept/:invitationId`
Accept a share invitation.

#### POST `/api/shares/decline/:invitationId`
Decline a share invitation.

### Utilities (`/api/utilities`)

#### POST `/api/utilities/validate-content`
Validate clipboard content before saving.

**Request Body:**
```json
{
  "content": "string",
  "type": "text|image|file|link",
  "productId": "string"
}
```

**Response:**
```json
{
  "message": "Content validation completed",
  "validation": {
    "isValid": true,
    "warnings": ["string"],
    "errors": ["string"],
    "suggestions": ["string"]
  },
  "content": {
    "type": "string",
    "length": 100,
    "estimatedSize": "N/A"
  }
}
```

#### POST `/api/utilities/format-content`
Format and clean clipboard content.

**Request Body:**
```json
{
  "content": "string",
  "type": "text|image|file|link",
  "formatOptions": {
    "removeExtraWhitespace": true,
    "normalizeLineEndings": true,
    "capitalizeSentences": false
  }
}
```

#### POST `/api/utilities/analyze-content`
Analyze clipboard content and provide insights.

**Request Body:**
```json
{
  "content": "string",
  "type": "text|image|file|link"
}
```

#### POST `/api/utilities/batch-process`
Process multiple clipboard entries in batch.

**Request Body:**
```json
{
  "entries": [
    {
      "id": "string",
      "content": "string"
    }
  ],
  "operations": [
    {
      "type": "trim|lowercase|uppercase|removeExtraSpaces|normalizeLineEndings"
    }
  ]
}
```

#### GET `/api/utilities/supported-formats`
Get list of supported content formats and types.

**Response:**
```json
{
  "message": "Supported formats retrieved",
  "formats": {
    "text": {
      "extensions": [".txt", ".md", ".json"],
      "mimeTypes": ["text/plain", "text/markdown"],
      "maxSize": "10MB",
      "features": ["search", "format", "analyze"]
    }
  },
  "globalLimits": {
    "maxEntriesPerProduct": 10000,
    "maxTagsPerEntry": 20,
    "maxSharedUsers": 100
  }
}
```

### System (`/api/system`)

#### GET `/api/system/status`
Get system status and health information.

**Response:**
```json
{
  "message": "System status retrieved successfully",
  "status": {
    "database": "healthy",
    "storage": "healthy",
    "version": "1.0.0",
    "uptime": "2h 30m",
    "lastBackup": "date"
  }
}
```

#### GET `/api/system/stats`
Get system statistics.

**Response:**
```json
{
  "message": "System statistics retrieved successfully",
  "stats": {
    "totalUsers": 150,
    "totalProducts": 45,
    "totalEntries": 12500,
    "activeUsers": 23,
    "storageUsed": "2.5GB"
  }
}
```

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "error": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "error": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "error": "Access denied"
}
```

### 404 Not Found
```json
{
  "error": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error"
}
```

## Rate Limiting

- **Authentication endpoints:** 5 requests per minute
- **API endpoints:** 100 requests per minute per user
- **File uploads:** 10 requests per minute per user

## Content Types

### Text
- **Max length:** 10,000 characters
- **Features:** Search, format, analyze, batch process
- **Common formats:** Plain text, Markdown, JSON, XML, CSV

### Images
- **Max size:** 10MB
- **Formats:** JPEG, PNG, GIF, BMP, WebP
- **Features:** Preview, resize, compress

### Files
- **Max size:** 50MB
- **Formats:** PDF, DOC, DOCX, XLS, XLSX, ZIP, RAR
- **Features:** Preview, download, metadata

### Links
- **Max length:** 1KB
- **Features:** Validate, preview, archive
- **Auto-protocol:** HTTPS is automatically added if missing

## Best Practices

1. **Content Organization:** Use tags to organize clipboard entries for easy searching
2. **Security:** Never share sensitive information like passwords in plain text
3. **Performance:** For large text content, consider breaking it into smaller, searchable pieces
4. **Sharing:** Use appropriate roles (viewer, member, owner) when sharing products
5. **Validation:** Always validate content before saving using the utilities endpoints

## Support

For API support and questions:
- **Documentation:** https://cb.yourl.cloud/docs
- **Status:** https://cb.yourl.cloud/status
- **Contact:** support@cb.yourl.cloud
