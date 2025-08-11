const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { validateProductAccess } = require('../middleware/productAccess');

const router = express.Router();

// @route   POST /api/utilities/validate-content
// @desc    Validate clipboard content before saving
// @access  Private
router.post('/validate-content', [
  body('content').notEmpty().trim(),
  body('type').isIn(['text', 'image', 'file', 'link']),
  body('productId').notEmpty()
], validateProductAccess, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { content, type, productId } = req.body;
    const validation = {
      isValid: true,
      warnings: [],
      errors: [],
      suggestions: []
    };

    // Content length validation
    if (type === 'text') {
      if (content.length > 10000) {
        validation.isValid = false;
        validation.errors.push('Text content exceeds maximum length of 10,000 characters');
      } else if (content.length > 5000) {
        validation.warnings.push('Text content is quite long, consider breaking it into smaller pieces');
      }
    }

    // URL validation for links
    if (type === 'link') {
      try {
        const url = new URL(content);
        if (!['http:', 'https:'].includes(url.protocol)) {
          validation.warnings.push('Consider using HTTPS for security');
        }
      } catch (error) {
        validation.isValid = false;
        validation.errors.push('Invalid URL format');
      }
    }

    // File size validation (for base64 encoded files)
    if (type === 'file' || type === 'image') {
      if (content.startsWith('data:')) {
        const base64Length = content.length - content.indexOf(',') - 1;
        const fileSizeInBytes = Math.ceil((base64Length * 3) / 4);
        const maxSize = 10 * 1024 * 1024; // 10MB
        
        if (fileSizeInBytes > maxSize) {
          validation.isValid = false;
          validation.errors.push(`File size (${(fileSizeInBytes / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size of 10MB`);
        }
      }
    }

    // Content type suggestions
    if (type === 'text') {
      if (content.includes('@') && content.includes('.')) {
        validation.suggestions.push('This looks like an email address - consider using "link" type');
      }
      if (content.startsWith('http://') || content.startsWith('https://')) {
        validation.suggestions.push('This looks like a URL - consider using "link" type');
      }
    }

    res.json({
      message: 'Content validation completed',
      validation,
      content: {
        type,
        length: content.length,
        estimatedSize: type === 'text' ? content.length : 'N/A'
      }
    });
  } catch (error) {
    console.error('Content validation error:', error);
    res.status(500).json({ error: 'Content validation failed' });
  }
});

// @route   POST /api/utilities/format-content
// @desc    Format and clean clipboard content
// @access  Private
router.post('/format-content', [
  body('content').notEmpty().trim(),
  body('type').isIn(['text', 'image', 'file', 'link']),
  body('formatOptions').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { content, type, formatOptions = {} } = req.body;
    let formattedContent = content;
    const changes = [];

    if (type === 'text') {
      // Remove extra whitespace
      if (formatOptions.removeExtraWhitespace !== false) {
        const beforeLength = formattedContent.length;
        formattedContent = formattedContent.replace(/\s+/g, ' ').trim();
        if (beforeLength !== formattedContent.length) {
          changes.push('Removed extra whitespace');
        }
      }

      // Normalize line endings
      if (formatOptions.normalizeLineEndings !== false) {
        formattedContent = formattedContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        changes.push('Normalized line endings');
      }

      // Capitalize first letter of sentences
      if (formatOptions.capitalizeSentences) {
        formattedContent = formattedContent.replace(/(^|\.\s+)([a-z])/g, (match, p1, p2) => {
          return p1 + p2.toUpperCase();
        });
        changes.push('Capitalized sentence beginnings');
      }
    }

    if (type === 'link') {
      // Ensure URL has protocol
      if (!formattedContent.startsWith('http://') && !formattedContent.startsWith('https://')) {
        formattedContent = 'https://' + formattedContent;
        changes.push('Added HTTPS protocol');
      }

      // Remove trailing slashes
      if (formatOptions.removeTrailingSlash !== false) {
        formattedContent = formattedContent.replace(/\/+$/, '');
        changes.push('Removed trailing slashes');
      }
    }

    res.json({
      message: 'Content formatting completed',
      originalContent: content,
      formattedContent,
      changes,
      formatOptions
    });
  } catch (error) {
    console.error('Content formatting error:', error);
    res.status(500).json({ error: 'Content formatting failed' });
  }
});

// @route   POST /api/utilities/analyze-content
// @desc    Analyze clipboard content and provide insights
// @access  Private
router.post('/analyze-content', [
  body('content').notEmpty().trim(),
  body('type').isIn(['text', 'image', 'file', 'link'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { content, type } = req.body;
    const analysis = {
      type,
      length: content.length,
      insights: [],
      metadata: {},
      suggestions: []
    };

    if (type === 'text') {
      // Word count
      const words = content.trim().split(/\s+/).filter(word => word.length > 0);
      analysis.metadata.wordCount = words.length;
      analysis.metadata.characterCount = content.length;
      analysis.metadata.lineCount = content.split('\n').length;

      // Language detection (simple heuristic)
      const englishWords = content.toLowerCase().match(/\b(the|and|or|but|in|on|at|to|for|of|with|by)\b/g);
      if (englishWords && englishWords.length > words.length * 0.1) {
        analysis.metadata.likelyLanguage = 'English';
      }

      // Content type detection
      if (content.includes('@') && content.includes('.') && content.includes(' ')) {
        analysis.insights.push('Contains email-like content');
      }
      if (content.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/)) {
        analysis.insights.push('Contains IP address');
      }
      if (content.match(/\b\d{4}-\d{2}-\d{2}\b/)) {
        analysis.insights.push('Contains date format');
      }

      // Suggestions
      if (words.length > 100) {
        analysis.suggestions.push('Consider breaking long text into smaller, searchable pieces');
      }
      if (content.includes('password') || content.includes('secret')) {
        analysis.suggestions.push('Consider marking this as sensitive content');
      }
    }

    if (type === 'link') {
      try {
        const url = new URL(content);
        analysis.metadata.domain = url.hostname;
        analysis.metadata.protocol = url.protocol;
        analysis.metadata.path = url.pathname;
        
        if (url.protocol === 'http:') {
          analysis.suggestions.push('Consider using HTTPS for security');
        }
      } catch (error) {
        analysis.insights.push('Invalid URL format');
      }
    }

    if (type === 'image' || type === 'file') {
      if (content.startsWith('data:')) {
        const header = content.split(',')[0];
        const mimeType = header.split(':')[1].split(';')[0];
        analysis.metadata.mimeType = mimeType;
        analysis.metadata.encoding = 'base64';
        
        if (mimeType.startsWith('image/')) {
          analysis.insights.push('Base64 encoded image detected');
        }
      }
    }

    res.json({
      message: 'Content analysis completed',
      analysis
    });
  } catch (error) {
    console.error('Content analysis error:', error);
    res.status(500).json({ error: 'Content analysis failed' });
  }
});

// @route   POST /api/utilities/batch-process
// @desc    Process multiple clipboard entries in batch
// @access  Private
router.post('/batch-process', [
  body('entries').isArray({ min: 1, max: 100 }),
  body('operations').isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { entries, operations } = req.body;
    const results = [];

    for (const entry of entries) {
      const result = {
        id: entry.id || entry._id,
        original: entry.content,
        processed: entry.content,
        operations: [],
        errors: []
      };

      for (const operation of operations) {
        try {
          switch (operation.type) {
            case 'trim':
              result.processed = result.processed.trim();
              result.operations.push('trimmed');
              break;
            case 'lowercase':
              result.processed = result.processed.toLowerCase();
              result.operations.push('converted to lowercase');
              break;
            case 'uppercase':
              result.processed = result.processed.toUpperCase();
              result.operations.push('converted to uppercase');
              break;
            case 'removeExtraSpaces':
              result.processed = result.processed.replace(/\s+/g, ' ');
              result.operations.push('removed extra spaces');
              break;
            case 'normalizeLineEndings':
              result.processed = result.processed.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
              result.operations.push('normalized line endings');
              break;
            default:
              result.errors.push(`Unknown operation: ${operation.type}`);
          }
        } catch (error) {
          result.errors.push(`Operation ${operation.type} failed: ${error.message}`);
        }
      }

      results.push(result);
    }

    res.json({
      message: 'Batch processing completed',
      totalProcessed: results.length,
      results
    });
  } catch (error) {
    console.error('Batch processing error:', error);
    res.status(500).json({ error: 'Batch processing failed' });
  }
});

// @route   GET /api/utilities/supported-formats
// @desc    Get list of supported content formats and types
// @access  Public
router.get('/supported-formats', (req, res) => {
  const formats = {
    text: {
      extensions: ['.txt', '.md', '.json', '.xml', '.csv'],
      mimeTypes: ['text/plain', 'text/markdown', 'application/json', 'text/xml', 'text/csv'],
      maxSize: '10MB',
      features: ['search', 'format', 'analyze', 'batch-process']
    },
    image: {
      extensions: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'],
      mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'],
      maxSize: '10MB',
      features: ['preview', 'resize', 'compress']
    },
    file: {
      extensions: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.rar'],
      mimeTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      maxSize: '50MB',
      features: ['preview', 'download', 'metadata']
    },
    link: {
      extensions: ['.url', '.webloc'],
      mimeTypes: ['text/uri-list', 'application/x-url'],
      maxSize: '1KB',
      features: ['validate', 'preview', 'archive']
    }
  };

  res.json({
    message: 'Supported formats retrieved',
    formats,
    globalLimits: {
      maxEntriesPerProduct: 10000,
      maxTagsPerEntry: 20,
      maxSharedUsers: 100
    }
  });
});

module.exports = router;
