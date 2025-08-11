# Zaido Browser Extension - Cloud Integration Guide

## Overview

The Zaido browser extension integrates with cb.yourl.cloud to provide secure screenshot capture and text selection monitoring with cloud streaming capabilities. This document outlines the integration points, API usage, and implementation details.

## Architecture

### Extension Components
- **Background Script** (`background-cloud.js`): Service worker handling extension lifecycle and cloud communication
- **Content Script** (`content-cloud.js`): Injected into web pages for text selection monitoring and area capture
- **Popup UI** (`popup-cloud.js`): User interface for capture controls and cloud status
- **Manifest** (`manifest.json`): Extension configuration with cloud permissions

### Cloud Integration Points
- **Authentication**: JWT-based user authentication via `/api/auth`
- **Data Sync**: Screenshot and text selection synchronization via `/api/sync`
- **Storage**: Cloud-based data persistence with owner-only access control

## API Integration

### Authentication Flow

```javascript
// User authentication
const response = await fetch(`${CONFIG.CLOUD_ENDPOINT}/api/${CONFIG.API_VERSION}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials)
});

// Store JWT token and user ID
await chrome.storage.local.set({
    [STORAGE_KEYS.CLOUD_TOKEN]: result.token,
    [STORAGE_KEYS.USER_ID]: result.userId
});
```

### Data Synchronization

```javascript
// Sync local data to cloud
const syncData = {
    userId: auth[STORAGE_KEYS.USER_ID],
    screenshots: screenshots,
    textSelections: textSelections,
    timestamp: Date.now()
};

const response = await fetch(`${CONFIG.CLOUD_ENDPOINT}/api/${CONFIG.API_VERSION}/sync`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth[STORAGE_KEYS.CLOUD_TOKEN]}`
    },
    body: JSON.stringify(syncData)
});
```

### Screenshot Capture

```javascript
// Capture visible tab
const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: 'png',
    quality: 90
});

// Store with metadata
const screenshot = {
    id: generateId(),
    dataUrl: dataUrl,
    tabId: tab.id,
    timestamp: Date.now(),
    type: 'visible_tab',
    format: 'png',
    url: tab.url,
    title: tab.title
};
```

### Text Selection Monitoring

```javascript
// Monitor text selection events
document.addEventListener('mouseup', (e) => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 10) {
        this.captureTextSelection(selection.toString().trim());
    }
});

// Store text selection
const selection = {
    id: generateId(),
    text: message.text,
    tabId: tab.id,
    timestamp: Date.now(),
    url: tab.url,
    title: tab.title
};
```

## Message Flow

### Area Capture Process
1. **Popup** → **Background**: `startAreaSelection` action with tab ID
2. **Background** → **Content Script**: Message to initiate area selection mode
3. **Content Script**: Creates selection overlay and handles user interaction
4. **Content Script** → **Background**: `captureAreaScreenshot` with area coordinates
5. **Background**: Captures full screenshot and crops to selected area
6. **Background**: Stores screenshot and syncs to cloud

### Text Selection Process
1. **Content Script**: Monitors text selection events
2. **Content Script** → **Background**: `STORE_SELECTED_TEXT` with text content
3. **Background**: Stores text selection and syncs to cloud

## Configuration

### Environment Variables
```javascript
const CONFIG = {
    CLOUD_ENDPOINT: 'https://cb.yourl.cloud',
    API_VERSION: 'v1',
    SYNC_INTERVAL: 30000, // 30 seconds
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000
};
```

### Storage Keys
```javascript
const STORAGE_KEYS = {
    SETTINGS: 'zaido_cloud_settings',
    SCREENSHOTS: 'zaido_cloud_screenshots',
    TEXT_SELECTIONS: 'zaido_cloud_text_selections',
    CLOUD_TOKEN: 'zaido_cloud_token',
    USER_ID: 'zaido_cloud_user_id'
};
```

## Security Features

### Permission Model
- **Minimal Permissions**: Only essential Chrome APIs required
- **Owner-Only Access**: Cloud data accessible only to authenticated user
- **Secure Storage**: JWT tokens stored in Chrome's secure storage
- **HTTPS Only**: All cloud communication via secure connections

### Data Privacy
- **Local Processing**: Screenshots and text processed locally before cloud sync
- **User Control**: Users control what data is synced to cloud
- **Secure Transmission**: All data encrypted in transit
- **Access Control**: Owner-only access to cloud-stored data

## Error Handling

### Network Failures
```javascript
try {
    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
} catch (error) {
    console.error('Cloud operation failed:', error);
    // Implement retry logic with exponential backoff
}
```

### Authentication Failures
```javascript
if (response.status === 401) {
    // Token expired or invalid
    await chrome.storage.local.remove([STORAGE_KEYS.CLOUD_TOKEN, STORAGE_KEYS.USER_ID]);
    this.updateCloudStatus(false);
    this.showAuthModal();
}
```

## Performance Optimizations

### Sync Strategy
- **Incremental Sync**: Only new/modified data sent to cloud
- **Batch Operations**: Multiple items synced in single request
- **Background Sync**: Periodic synchronization via Chrome alarms
- **Offline Support**: Local storage with sync when connection restored

### Memory Management
- **Data URL Limits**: Screenshots stored as data URLs with size limits
- **Cleanup**: Old data automatically removed based on storage limits
- **Lazy Loading**: Data loaded only when needed

## Testing and Debugging

### Console Logging
```javascript
const LOGGING = {
    messages: true,
    screenshots: true,
    cloud: true,
    errors: true
};
```

### Development Tools
- **Chrome DevTools**: Extension debugging via service worker inspection
- **Console Output**: Detailed logging for all operations
- **Network Tab**: Monitor cloud API requests and responses

## Deployment

### Build Process
```powershell
# Build cloud-enabled extension
.\build-cloud\build-cloud.ps1
```

### Distribution
- **Chrome Web Store**: For public distribution
- **Developer Mode**: For testing and development
- **Enterprise**: For corporate deployment

## API Endpoints Used

### Authentication
- `POST /api/v1/auth` - User login/registration

### Data Management
- `POST /api/v1/sync` - Synchronize local data to cloud
- `GET /api/v1/sync` - Retrieve cloud data

### Utilities
- `POST /api/v1/utilities/validate-content` - Validate data before storage
- `POST /api/v1/utilities/format-content` - Format and clean data

## Troubleshooting

### Common Issues

1. **Area Capture Not Working**
   - Check content script injection
   - Verify message passing between components
   - Ensure proper event listener setup

2. **Cloud Sync Failures**
   - Verify authentication token validity
   - Check network connectivity
   - Review API endpoint configuration

3. **Permission Errors**
   - Confirm manifest permissions
   - Check host permissions for cloud domain
   - Verify content security policy

### Debug Steps
1. Open Chrome DevTools for extension
2. Check service worker console for errors
3. Monitor network requests to cloud APIs
4. Verify content script injection on target pages

## Future Enhancements

### Planned Features
- **Real-time Sync**: WebSocket-based live synchronization
- **Advanced Analytics**: Usage statistics and insights
- **Team Collaboration**: Shared access to cloud data
- **Mobile Support**: Cross-platform data access

### API Extensions
- **Webhook Support**: Real-time notifications
- **Advanced Search**: Full-text search across all data
- **Data Export**: Multiple format support
- **Backup/Restore**: Complete data management

## Support and Resources

### Documentation
- **API Reference**: https://cb.yourl.cloud/docs
- **Extension Guide**: This document
- **Chrome Extensions**: https://developer.chrome.com/docs/extensions/

### Contact
- **Support**: support@cb.yourl.cloud
- **Status**: https://cb.yourl.cloud/status
- **Issues**: GitHub repository issues

---

*Last updated: January 2025*
*Version: 1.0.0*
