# Translation Module

A comprehensive translation module for the ASON Core Service Backend that provides intelligent, conversational translation capabilities with support for multiple file formats and languages.

## Features

### 🌍 Multi-Language Support

- **40+ Languages** supported including:
  - European: English, Spanish, French, German, Italian, Portuguese, Russian, etc.
  - Asian: Chinese (Simplified & Traditional), Japanese, Korean, Hindi, Thai, Vietnamese, etc.
  - Middle Eastern: Arabic, Hebrew, Persian, Turkish, Urdu
  - African: Swahili
  - And many more!

### 📄 Document Translation

- Support for multiple file formats:
  - Plain text (`.txt`, `.md`)
  - Microsoft Word (`.docx`)
  - PDF (`.pdf`)
  - HTML (`.html`)
  - JSON (`.json`)
  - CSV (`.csv`)
  - Excel (`.xlsx`)
- Automatic text extraction from uploaded documents
- Preserves formatting where possible

### 💬 Conversational Interface

- Natural language processing for user requests
- AI-powered intent recognition using Gemini
- Context-aware conversations
- Smart parameter extraction
- Follow-up questions for missing information
- Conversation history with summarization

### 🔐 Flexible Authentication

- Supports both authenticated and guest users
- Usage tracking for subscribed users
- Rate limiting protection
- Optional authentication on all endpoints

### 🎯 Multiple Endpoints

1. **Conversational Assistant** (`POST /api/v1/translation/assistant`)

   - Main entry point for natural language translation requests
   - Optional file upload
   - Handles complex, multi-turn conversations

2. **Direct Translation** (`POST /api/v1/translation/translate`)

   - Direct text translation without conversation
   - Programmatic access for integrations

3. **Language Detection** (`POST /api/v1/translation/detect`)

   - Automatically detect the language of provided text
   - Returns language code, name, and confidence score

4. **Supported Languages** (`GET /api/v1/translation/languages`)
   - Get complete list of supported languages
   - Returns language codes and names

## Architecture

### Module Structure

```
translation/
├── services/
│   ├── conversationAnalyzer.js    # AI-powered intent analysis
│   ├── translationAPIClient.js    # Google Translate API integration
│   └── fileExtractionService.js   # Document text extraction
├── translation.constant.js         # Constants and configuration
├── translation.validation.js       # Zod validation schemas
├── translation.service.js          # Main business logic
├── translation.controller.js       # HTTP request handlers
└── translation.route.js            # Route definitions
```

### Key Components

#### 1. Conversation Analyzer

- Uses Google Gemini 2.5 Flash for intent recognition
- Extracts translation parameters from natural language
- Handles conversation summarization for long chats
- Normalizes language codes to ISO 639-1 format

#### 2. Translation API Client

- Integrates with Google Cloud Translation API
- Supports language detection
- Batch translation capabilities
- Validates language codes

#### 3. File Extraction Service

- Extracts text from various document formats
- Uses specialized libraries:
  - `mammoth` for DOCX files
  - `pdf-parse` for PDF files
  - `xlsx` for Excel files
- Automatic cleanup of temporary files

#### 4. Translation Service

- Orchestrates conversation flow
- Manages conversation state
- Handles different translation intents
- Integrates with conversation service

## API Endpoints

### 1. Conversational Assistant

**Endpoint:** `POST /api/v1/translation/assistant`

**Description:** Main conversational endpoint that handles natural language translation requests with optional file uploads.

**Request:**

```javascript
// Multipart form-data
{
  "message": "Translate this document to Spanish",
  "conversationId": "trans_1234567890_abc123", // Optional, for continuing conversation
  "userId": "guest_user_id", // Optional, for guest users
  "file": File // Optional, document to translate
}
```

**Response:**

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Request processed successfully",
  "data": {
    "conversationId": "trans_1234567890_abc123",
    "success": true,
    "needsMoreInfo": false,
    "message": "Translation completed! Translated from English to Spanish.",
    "translation": {
      "success": true,
      "originalText": "Hello, world!",
      "translatedText": "¡Hola, mundo!",
      "sourceLanguage": "en",
      "sourceLanguageName": "English",
      "targetLanguage": "es",
      "targetLanguageName": "Spanish",
      "characterCount": 13
    },
    "collectedParams": {
      "targetLanguage": "es",
      "sourceLanguage": "auto",
      "hasFile": false
    }
  }
}
```

**Examples:**

```bash
# Text translation
curl -X POST http://localhost:5000/api/v1/translation/assistant \
  -F "message=Translate 'Hello, how are you?' to French"

# File translation
curl -X POST http://localhost:5000/api/v1/translation/assistant \
  -F "message=Translate this document to German" \
  -F "file=@document.pdf"

# Continue conversation
curl -X POST http://localhost:5000/api/v1/translation/assistant \
  -F "message=Now translate it to Italian" \
  -F "conversationId=trans_1234567890_abc123"
```

### 2. Direct Translation

**Endpoint:** `POST /api/v1/translation/translate`

**Description:** Direct text translation without conversation context. For programmatic access.

**Request:**

```json
{
  "text": "Hello, world!",
  "targetLanguage": "es",
  "sourceLanguage": "en" // Optional, auto-detect if not provided
}
```

**Response:**

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Translation completed successfully",
  "data": {
    "success": true,
    "originalText": "Hello, world!",
    "translatedText": "¡Hola, mundo!",
    "sourceLanguage": "en",
    "sourceLanguageName": "English",
    "targetLanguage": "es",
    "targetLanguageName": "Spanish",
    "characterCount": 13
  }
}
```

### 3. Language Detection

**Endpoint:** `POST /api/v1/translation/detect`

**Description:** Detect the language of provided text.

**Request:**

```json
{
  "text": "Bonjour, comment allez-vous?"
}
```

**Response:**

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Language detected successfully",
  "data": {
    "success": true,
    "languageCode": "fr",
    "languageName": "French",
    "confidence": 0.98,
    "isSupported": true
  }
}
```

### 4. Get Supported Languages

**Endpoint:** `GET /api/v1/translation/languages`

**Description:** Get list of all supported languages.

**Response:**

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Supported languages retrieved successfully",
  "data": {
    "success": true,
    "languages": [
      { "code": "en", "name": "English" },
      { "code": "es", "name": "Spanish" },
      { "code": "fr", "name": "French" }
      // ... more languages
    ],
    "count": 40
  }
}
```

## Usage Examples

### Example 1: Simple Text Translation

```javascript
// User: "Translate 'Good morning' to Spanish"
// Assistant extracts:
// - Intent: translate_text
// - Text: "Good morning"
// - Target language: es
// - Response: "Buenos días"
```

### Example 2: File Translation

```javascript
// User uploads document.pdf and says: "Translate this to French"
// Assistant:
// 1. Extracts text from PDF
// 2. Detects source language (e.g., English)
// 3. Translates to French
// 4. Returns translated text
```

### Example 3: Multi-turn Conversation

```javascript
// Turn 1
// User: "I need to translate something"
// Assistant: "I can help you translate text or documents. What language would you like to translate to?"

// Turn 2
// User: "Spanish"
// Assistant: "What text or document would you like to translate to Spanish?"

// Turn 3
// User: "Hello, how are you today?"
// Assistant: "Translation completed! Translated from English to Spanish: ¡Hola, ¿cómo estás hoy?"
```

### Example 4: Language Detection

```javascript
// User: "What language is this: 'Guten Morgen'"
// Assistant: "Detected language: German (de) with 99.5% confidence."
```

## Configuration

### Environment Variables

```bash
# Google Cloud Configuration
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
GOOGLE_CLOUD_PROJECT_ID=your-project-id

# Gemini API (for conversation analysis)
GEMINI_SECRET_KEY=your-gemini-api-key
```

### File Upload Settings

Located in `translation.constant.js`:

```javascript
export const FILE_SIZE_LIMITS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_TEXT_LENGTH: 100000, // 100K characters
};

export const SUPPORTED_DOCUMENT_FORMATS = [
  '.txt',
  '.docx',
  '.pdf',
  '.html',
  '.md',
  '.json',
  '.csv',
  '.xlsx',
];
```

## Dependencies

### Required NPM Packages

```bash
npm install @google-cloud/translate
npm install @langchain/google-genai
npm install mammoth          # For DOCX files
npm install pdf-parse        # For PDF files
npm install xlsx             # For Excel files
npm install multer           # For file uploads
npm install zod              # For validation
```

## Integration with Conversation Service

The translation module integrates seamlessly with the existing conversation service:

- **Conversation Creation:** Creates conversations with `category: 'translation'`
- **Message Storage:** All user and assistant messages are stored
- **Metadata Tracking:** Tracks collected parameters and intent history
- **Summarization:** Long conversations are summarized to save tokens
- **User Context:** Supports both guest and authenticated users

## Error Handling

The module provides comprehensive error handling:

- **Invalid Language Codes:** Validates and normalizes language codes
- **Unsupported File Formats:** Rejects files with invalid formats
- **File Size Limits:** Enforces 10MB file size limit
- **Text Length Limits:** Enforces 100K character limit for direct text
- **Translation Failures:** Gracefully handles API failures
- **File Cleanup:** Automatically cleans up temporary files

## Rate Limiting

Configurable rate limits (currently commented out in routes):

- Conversational Assistant: 30 requests per 15 minutes
- Direct Translation: 20 requests per 15 minutes
- Language Detection: 30 requests per 15 minutes

## Subscription Integration

For authenticated users:

- Tracks usage against subscription limits
- Prevents translation when limits are exceeded
- Suggests plan upgrades when necessary

## Testing

### Manual Testing with cURL

```bash
# Test conversational assistant
curl -X POST http://localhost:5000/api/v1/translation/assistant \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "message=Translate hello to Spanish"

# Test direct translation
curl -X POST http://localhost:5000/api/v1/translation/translate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"text": "Hello", "targetLanguage": "es"}'

# Test language detection
curl -X POST http://localhost:5000/api/v1/translation/detect \
  -H "Content-Type: application/json" \
  -d '{"text": "Bonjour"}'

# Get supported languages
curl -X GET http://localhost:5000/api/v1/translation/languages
```

## Future Enhancements

- [ ] Support for glossaries and custom terminology
- [ ] Translation memory for consistent translations
- [ ] Real-time streaming translations
- [ ] Support for additional file formats (RTF, ODT, etc.)
- [ ] Translation history and favorites
- [ ] Batch file translation
- [ ] Export translated documents in original format
- [ ] Translation quality assessment
- [ ] Support for formality levels
- [ ] Neural machine translation (NMT) models

## Troubleshooting

### Common Issues

1. **"Translation API not initialized"**

   - Ensure `GOOGLE_APPLICATION_CREDENTIALS` is set correctly
   - Verify service account has Translation API access

2. **"Invalid language code"**

   - Use ISO 639-1 format (e.g., 'en', 'es', 'fr')
   - Check supported languages list

3. **"File extraction failed"**

   - Ensure document is not corrupted
   - Check file format is supported
   - Verify file size is under 10MB

4. **"Usage limit reached"**
   - User has exceeded subscription limits
   - Upgrade plan or wait for reset

## License

Part of the ASON Core Service Backend.

## Support

For issues or questions, please contact the development team or create an issue in the repository.
