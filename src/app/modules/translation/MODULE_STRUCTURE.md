# Translation Module - File Structure

```
src/app/modules/translation/
│
├── 📄 translation.constant.js          # Constants, config, language codes
├── 📄 translation.validation.js        # Zod validation schemas
├── 📄 translation.service.js           # Main business logic
├── 📄 translation.controller.js        # HTTP controllers
├── 📄 translation.route.js             # Route definitions
│
├── 📂 services/
│   ├── 📄 conversationAnalyzer.js      # AI intent analysis (Gemini)
│   ├── 📄 translationAPIClient.js      # Google Translate integration
│   └── 📄 fileExtractionService.js     # Document text extraction
│
├── 📘 README.md                        # Complete documentation
├── 📗 QUICKSTART.md                    # Quick start guide
└── 📙 IMPLEMENTATION_SUMMARY.md        # This implementation summary
```

## Module Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     HTTP Request Layer                       │
│  POST /assistant | POST /translate | POST /detect | GET /... │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                   Controller Layer                           │
│  conversationalAssistant | translateText | detectLanguage    │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    Service Layer                             │
│  processConversationalRequest | translateTextDirect          │
└─────────────┬──────────────────────────────┬────────────────┘
              │                               │
    ┌─────────▼────────┐          ┌──────────▼─────────┐
    │  Conversation    │          │   Translation      │
    │    Analyzer      │          │   API Client       │
    │   (Gemini AI)    │          │  (Google Cloud)    │
    └──────────────────┘          └────────────────────┘
              │
    ┌─────────▼────────┐
    │ File Extraction  │
    │    Service       │
    │ (DOCX/PDF/XLSX)  │
    └──────────────────┘
```

## Request Flow Diagram

```
┌──────────────┐
│ User Request │
│ (Text/File)  │
└──────┬───────┘
       │
       ▼
┌────────────────────────┐
│  optionalAuth()        │  ← Authentication Check
│  multer.single()       │  ← File Upload
│  validateRequest()     │  ← Input Validation
└──────┬─────────────────┘
       │
       ▼
┌────────────────────────────────────────┐
│  Controller: conversationalAssistant   │
│  - Check subscription limits           │
│  - Validate user/guest                 │
│  - Forward to service                  │
└──────┬─────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────┐
│  Service: processConversationalRequest │
│  - Create/retrieve conversation        │
│  - Add user message                    │
│  - Get conversation history            │
└──────┬─────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────┐
│  Conversation Analyzer (Gemini)        │
│  - Analyze user intent                 │
│  - Extract parameters                  │
│  - Identify missing info               │
│  - Generate follow-up questions        │
└──────┬─────────────────────────────────┘
       │
       ├─── TRANSLATE_TEXT ─────────────┐
       │                                 │
       ├─── TRANSLATE_FILE ──────┐      │
       │                          │      │
       ├─── DETECT_LANGUAGE ──────┼──────┼──┐
       │                          │      │   │
       └─── GET_LANGUAGES ────────┼──────┼───┼──┐
                                  │      │   │   │
                          ┌───────▼──────▼───▼───▼────┐
                          │   Intent Handler           │
                          │   - Check required params  │
                          │   - Execute action         │
                          │   - Handle file if present │
                          └───────┬────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
            ┌───────▼────────┐        ┌────────▼──────────┐
            │ File Extraction│        │  Translation API  │
            │   (if file)    │        │  - Translate      │
            │ - Extract text │───────▶│  - Detect lang    │
            │ - Return content│        │  - Return result  │
            └────────────────┘        └───────┬───────────┘
                                              │
                                    ┌─────────▼──────────┐
                                    │  Store in          │
                                    │  Conversation      │
                                    │  - Add assistant   │
                                    │    message         │
                                    │  - Update metadata │
                                    └─────────┬──────────┘
                                              │
                                    ┌─────────▼──────────┐
                                    │  Return Response   │
                                    │  - Translation     │
                                    │  - Message         │
                                    │  - Conversation ID │
                                    └────────────────────┘
```

## Data Flow

### Text Translation Request
```
User Input: "Translate 'Hello' to Spanish"
    │
    ├─→ Intent Analysis (Gemini)
    │       ├─ Intent: TRANSLATE_TEXT
    │       ├─ Text: "Hello"
    │       └─ Target: "es"
    │
    ├─→ Translation API (Google Cloud)
    │       ├─ Source: "en" (detected)
    │       └─ Result: "Hola"
    │
    └─→ Response
            ├─ Success: true
            ├─ Original: "Hello"
            ├─ Translated: "Hola"
            └─ Languages: en → es
```

### File Translation Request
```
User Input: "Translate this PDF to French" + [file.pdf]
    │
    ├─→ File Extraction
    │       ├─ Read PDF
    │       ├─ Extract text content
    │       └─ Clean up temp file
    │
    ├─→ Intent Analysis (Gemini)
    │       ├─ Intent: TRANSLATE_FILE
    │       ├─ Has file: true
    │       └─ Target: "fr"
    │
    ├─→ Translation API (Google Cloud)
    │       ├─ Source: detected
    │       └─ Translate full text
    │
    └─→ Response
            ├─ Success: true
            ├─ File metadata
            ├─ Translated text
            └─ Languages
```

### Multi-turn Conversation
```
Turn 1: "I need to translate something"
    ├─→ Intent: GENERAL_QUESTION
    ├─→ Missing: targetLanguage, text
    └─→ Response: "What language would you like to translate to?"

Turn 2: "Spanish" (conversationId: conv_123)
    ├─→ Load conversation history
    ├─→ Intent: TRANSLATE_TEXT (partial)
    ├─→ Collected: targetLanguage = "es"
    ├─→ Missing: text
    └─→ Response: "What text would you like to translate to Spanish?"

Turn 3: "Hello, how are you?" (conversationId: conv_123)
    ├─→ Load conversation history
    ├─→ Intent: TRANSLATE_TEXT
    ├─→ Collected: text = "Hello, how are you?", targetLanguage = "es"
    ├─→ Execute translation
    └─→ Response: "Hola, ¿cómo estás?"
```

## Supported File Formats

```
📄 Text Files
   ├─ .txt   → Direct read (UTF-8)
   ├─ .md    → Direct read (Markdown)
   └─ .html  → Direct read (HTML)

📘 Document Files
   ├─ .docx  → Mammoth library
   └─ .pdf   → pdf-parse library

📊 Data Files
   ├─ .json  → Direct read (JSON)
   ├─ .csv   → Direct read (CSV)
   └─ .xlsx  → XLSX library
```

## Integration Points

```
┌─────────────────────────────────────────────────────────────┐
│                    Translation Module                        │
└─────┬──────────────┬──────────────┬────────────────────┬────┘
      │              │              │                    │
      ▼              ▼              ▼                    ▼
┌──────────┐  ┌───────────┐  ┌───────────┐      ┌──────────┐
│Conversation│ │Subscription│ │Google Cloud│      │ Gemini   │
│  Service   │ │  Service   │ │ Translate  │      │   API    │
│            │ │            │ │            │      │          │
│- Create    │ │- Check     │ │- Translate │      │- Analyze │
│- Store     │ │  limits    │ │- Detect    │      │  intent  │
│- Retrieve  │ │- Track     │ │- Validate  │      │- Extract │
│- Update    │ │  usage     │ │            │      │  params  │
└────────────┘ └────────────┘ └────────────┘      └──────────┘
```

## API Endpoints Overview

```
GET  /api/v1/translation/languages
     └─→ Returns: List of 40+ supported languages

POST /api/v1/translation/translate
     ├─→ Body: { text, targetLanguage, sourceLanguage? }
     └─→ Returns: Translation result

POST /api/v1/translation/detect
     ├─→ Body: { text }
     └─→ Returns: Language detection result

POST /api/v1/translation/assistant
     ├─→ FormData: { message, conversationId?, file? }
     └─→ Returns: Conversational response with translation
```

## Language Support Matrix

```
🌍 European Languages (15+)
   English (en), Spanish (es), French (fr), German (de),
   Italian (it), Portuguese (pt), Russian (ru), Dutch (nl),
   Polish (pl), Swedish (sv), Norwegian (no), Danish (da),
   Finnish (fi), Greek (el), Czech (cs), Hungarian (hu),
   Romanian (ro), Ukrainian (uk)

🌏 Asian Languages (10+)
   Japanese (ja), Korean (ko), Chinese Simplified (zh-CN),
   Chinese Traditional (zh-TW), Hindi (hi), Bengali (bn),
   Vietnamese (vi), Thai (th), Indonesian (id), Malay (ms),
   Filipino (fil)

🌍 Middle Eastern & Others (10+)
   Arabic (ar), Hebrew (he), Persian (fa), Turkish (tr),
   Urdu (ur), Swahili (sw)
```

## Error Handling Flow

```
Request
   │
   ├─→ Validation Error
   │      └─→ 400 Bad Request
   │
   ├─→ Authentication Error
   │      └─→ 403 Forbidden (usage limit)
   │
   ├─→ File Upload Error
   │      ├─→ Cleanup temp file
   │      └─→ 400 Bad Request
   │
   ├─→ Translation API Error
   │      ├─→ Log error
   │      └─→ 500 Internal Server Error
   │
   └─→ Success
          └─→ 200 OK
```

## Dependencies Tree

```
translation module
│
├── @google-cloud/translate
│   └─→ Translation & language detection
│
├── @langchain/google-genai
│   └─→ Intent analysis with Gemini
│
├── mammoth
│   └─→ DOCX text extraction
│
├── pdf-parse
│   └─→ PDF text extraction
│
├── xlsx
│   └─→ Excel file reading
│
├── multer
│   └─→ File upload handling
│
└── zod
    └─→ Input validation
```

## Testing Strategy

```
Unit Tests (Future)
   ├─ conversationAnalyzer.test.js
   ├─ translationAPIClient.test.js
   ├─ fileExtractionService.test.js
   └─ translation.service.test.js

Integration Tests (Current)
   └─ test-translation.js
       ├─ Test 1: Get supported languages
       ├─ Test 2: Direct text translation
       ├─ Test 3: Language detection
       ├─ Test 4: Conversational simple
       ├─ Test 5: Conversational multi-turn
       ├─ Test 6: File translation
       └─ Test 7: Multiple languages

Manual Testing
   └─ Translation_API.postman_collection.json
       ├─ 16 predefined requests
       ├─ Environment variables
       └─ Test scripts
```

---

**Module Status:** ✅ Production Ready
**Last Updated:** December 11, 2025
**Version:** 1.0.0
