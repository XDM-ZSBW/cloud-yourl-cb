# cb-yourl-cloud

A secure, cloud-based clipboard history service designed for friends and family to share and manage clipboard content across devices and products.

## Features

- 🔐 **Secure Authentication** - JWT-based authentication with role-based access control
- 📋 **Multi-format Support** - Text, images, files, and links
- 👥 **Collaborative Sharing** - Share clipboard content with family and friends
- 🏷️ **Smart Organization** - Tag-based organization and advanced search
- 📱 **Cross-platform** - Access from any device with a web browser
- 🚀 **High Performance** - Optimized for fast search and retrieval
- 🔒 **Privacy First** - Your data stays private and secure

## Tech Stack

- **Backend:** Node.js, Express.js
- **Database:** MongoDB with Mongoose ODM
- **Authentication:** JWT tokens
- **Validation:** Express-validator
- **Security:** bcrypt for password hashing
- **Middleware:** Custom authentication and product access control

## Quick Start

### Prerequisites

- Node.js 16+ 
- MongoDB 5+
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/cb-yourl-cloud.git
   cd cb-yourl-cloud
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   Create a `.env` file in the root directory:
   ```env
   NODE_ENV=development
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/cb-yourl-cloud
   JWT_SECRET=your-super-secret-jwt-key
   JWT_EXPIRES_IN=24h
   ```

4. **Start the server**
   ```bash
   npm start
   ```

   Or for development with auto-restart:
   ```bash
   npm run dev
   ```

5. **Access the API**
   - API Base URL: `http://localhost:3000/api`
   - Health Check: `http://localhost:3000/health`
   - API Documentation: `http://localhost:3000/api`

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh JWT token
- `POST /api/auth/logout` - User logout

### Clipboard Management
- `GET /api/clipboard` - Get clipboard entries
- `POST /api/clipboard` - Create new entry
- `GET /api/clipboard/:id` - Get specific entry
- `PUT /api/clipboard/:id` - Update entry
- `DELETE /api/clipboard/:id` - Delete entry
- `POST /api/clipboard/search` - Advanced search

### User Management
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update profile
- `GET /api/users/products` - Get user's products

### Product Management
- `GET /api/products` - Get accessible products
- `POST /api/products` - Create product
- `GET /api/products/:id` - Get product details
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product

### Sharing
- `POST /api/shares/invite` - Invite user to product
- `GET /api/shares/pending` - Get pending invitations
- `POST /api/shares/accept/:id` - Accept invitation
- `POST /api/shares/decline/:id` - Decline invitation

### Utilities
- `POST /api/utilities/validate-content` - Validate content
- `POST /api/utilities/format-content` - Format content
- `POST /api/utilities/analyze-content` - Analyze content
- `POST /api/utilities/batch-process` - Batch operations
- `GET /api/utilities/supported-formats` - Get supported formats

### System
- `GET /api/system/status` - System health
- `GET /api/system/stats` - System statistics

## Project Structure

```
src/
├── middleware/          # Authentication and access control
│   ├── auth.js         # JWT authentication middleware
│   └── productAccess.js # Product access validation
├── models/             # MongoDB data models
│   ├── User.js         # User model
│   ├── Product.js      # Product model
│   ├── Clipboard.js    # Clipboard entry model
│   ├── FamilyGroup.js  # Family group model
│   └── Share.js        # Sharing model
├── routes/             # API route handlers
│   ├── auth.js         # Authentication routes
│   ├── users.js        # User management routes
│   ├── products.js     # Product management routes
│   ├── clipboard.js    # Clipboard management routes
│   ├── shares.js       # Sharing routes
│   ├── system.js       # System routes
│   └── utilities.js    # Utility routes
└── server.js           # Main server file
```

## Data Models

### User
- Basic profile information
- Authentication credentials
- Product associations

### Product
- Name and description
- Owner and members
- Access control settings

### Clipboard Entry
- Content and type (text, image, file, link)
- Tags for organization
- Product association
- Creation metadata

### Family Group
- Group management
- Member relationships
- Shared settings

## Security Features

- **JWT Authentication** - Secure token-based authentication
- **Password Hashing** - bcrypt with salt rounds
- **Role-based Access** - Owner, member, viewer roles
- **Product Isolation** - Users can only access authorized products
- **Input Validation** - Comprehensive request validation
- **Rate Limiting** - Protection against abuse

## Content Types

### Text
- **Max Length:** 10,000 characters
- **Features:** Search, format, analyze, batch process
- **Formats:** Plain text, Markdown, JSON, XML, CSV

### Images
- **Max Size:** 10MB
- **Formats:** JPEG, PNG, GIF, BMP, WebP
- **Features:** Preview, resize, compress

### Files
- **Max Size:** 50MB
- **Formats:** PDF, DOC, DOCX, XLS, XLSX, ZIP, RAR
- **Features:** Preview, download, metadata

### Links
- **Max Length:** 1KB
- **Features:** Validate, preview, archive
- **Auto-protocol:** HTTPS automatically added

## Development

### Scripts

```bash
npm start          # Start production server
npm run dev        # Start development server with nodemon
npm test           # Run tests
npm run lint       # Run ESLint
npm run format     # Format code with Prettier
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `3000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/cb-yourl-cloud` |
| `JWT_SECRET` | JWT signing secret | Required |
| `JWT_EXPIRES_IN` | JWT expiration time | `24h` |

### Database Setup

1. **Install MongoDB**
   ```bash
   # Ubuntu/Debian
   sudo apt-get install mongodb
   
   # macOS
   brew install mongodb
   
   # Windows
   # Download from https://www.mongodb.com/try/download/community
   ```

2. **Start MongoDB**
   ```bash
   sudo systemctl start mongodb  # Linux
   brew services start mongodb   # macOS
   ```

3. **Create Database**
   ```bash
   mongo
   use cb-yourl-cloud
   ```

## Testing

### Manual Testing

1. **Start the server**
   ```bash
   npm run dev
   ```

2. **Test endpoints using curl or Postman**
   ```bash
   # Health check
   curl http://localhost:3000/health
   
   # Register user
   curl -X POST http://localhost:3000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"username":"testuser","email":"test@example.com","password":"password123","firstName":"Test","lastName":"User"}'
   ```

### Automated Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- --grep "User Model"
```

## Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong JWT secret
- [ ] Configure MongoDB with authentication
- [ ] Set up SSL/TLS certificates
- [ ] Configure reverse proxy (nginx)
- [ ] Set up monitoring and logging
- [ ] Configure backup strategy
- [ ] Set up CI/CD pipeline

### Docker Deployment

```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
# Build and run
docker build -t cb-yourl-cloud .
docker run -p 3000:3000 cb-yourl-cloud
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow ESLint configuration
- Write meaningful commit messages
- Add tests for new features
- Update documentation as needed
- Follow the existing code style

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- **Documentation:** [API Documentation](API_DOCUMENTATION.md)
- **Issues:** [GitHub Issues](https://github.com/yourusername/cb-yourl-cloud/issues)
- **Discussions:** [GitHub Discussions](https://github.com/yourusername/cb-yourl-cloud/discussions)
- **Email:** support@cb.yourl.cloud

## Roadmap

### Version 1.1
- [ ] Real-time notifications
- [ ] Advanced search filters
- [ ] Content encryption
- [ ] API rate limiting

### Version 1.2
- [ ] Mobile app
- [ ] Offline support
- [ ] Content versioning
- [ ] Advanced analytics

### Version 2.0
- [ ] Multi-tenant support
- [ ] Enterprise features
- [ ] Advanced security
- [ ] Performance optimization

## Acknowledgments

- Built with ❤️ for friends and family
- Inspired by the need for secure, collaborative clipboard sharing
- Thanks to the open-source community for amazing tools and libraries
