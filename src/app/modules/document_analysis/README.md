# Document Analysis Module

AI-powered document and text analysis agent using Gemini 3.5 Flash. Analyze text messages or uploaded documents with intelligent insights and conversation memory.

## Features

- **Simple Interface**: One endpoint for both text and file analysis
- **Multiple Analysis Types**: General, sentiment, summary, key points, entity extraction, topic classification, language detection
- **File Upload Support**: PDF, DOCX, DOC, TXT, XLSX, XLS, PPTX, PPT
- **Conversation Memory**: Maintains context across multiple requests
- **Flexible Output**: Structured or narrative format
- **Guest & Authenticated Users**: Works without authentication
- **Gemini 3.5 Flash**: Fast, cost-effective AI analysis

## API Endpoints

### 1. Analyze Document/Text (Main Endpoint)

**POST** `/api/v1/document-analysis/analyze`

Analyze text or uploaded documents with AI.

**Request:**
```
Content-Type: multipart/form-data

Fields:
- message (optional): Text to analyze OR instructions for file analysis
- file (optional): Document file to analyze
- conversationId (optional): Continue existing conversation
- analysisType (optional): Type of analysis to perform
- outputFormat (optional): 'structured' or 'narrative'
- userId (optional): For guest users
```

**Analysis Types:**
- `general` (default) - Comprehensive analysis
- `sentiment` - Emotional tone and sentiment
- `summary` - Concise summary
- `key_points` - Extract main points
- `entity_extraction` - Extract names, places, organizations
- `topic_classification` - Categorize content
- `language_detection` - Identify language and style

**Output Formats:**
- `narrative` (default) - Natural language response
- `structured` - Organized with headings and sections

---

### Use Cases

#### 1. Analyze Text Message
```bash
curl -X POST http://localhost:5000/api/v1/document-analysis/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "message": "The company Q4 revenue increased by 45% to $2.3M. Customer satisfaction scores improved from 7.2 to 8.9. However, operational costs rose by 12%."
  }'
```

#### 2. Analyze Uploaded File
```bash
curl -X POST http://localhost:5000/api/v1/document-analysis/analyze \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@report.pdf"
```

#### 3. Analyze File with Specific Request
```bash
curl -X POST http://localhost:5000/api/v1/document-analysis/analyze \
  -F "file=@contract.pdf" \
  -F "message=Extract all monetary values and dates from this contract" \
  -F "analysisType=entity_extraction"
```

#### 4. Sentiment Analysis
```bash
curl -X POST http://localhost:5000/api/v1/document-analysis/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "message": "This product is absolutely amazing! I love how easy it is to use.",
    "analysisType": "sentiment",
    "outputFormat": "structured"
  }'
```

#### 5. Continue Conversation
```bash
curl -X POST http://localhost:5000/api/v1/document-analysis/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "analysis_1734567890_abc123",
    "message": "Can you elaborate on the key findings?"
  }'
```

---

### Response Format

**Success Response:**
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Analysis completed successfully",
  "data": {
    "success": true,
    "conversationId": "analysis_1734567890_abc123",
    "analysis": "Based on the provided content...",
    "metadata": {
      "analysisType": "general",
      "outputFormat": "narrative",
      "model": "gemini-3.5-flash",
      "fileProcessed": true,
      "fileName": "report.pdf"
    }
  }
}
```

---

### 2. Get Conversation History

**GET** `/api/v1/document-analysis/conversation/:conversationId`

Retrieve full conversation history.

**Example:**
```bash
curl -X GET http://localhost:5000/api/v1/document-analysis/conversation/analysis_1734567890_abc123 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Conversation history retrieved successfully",
  "data": {
    "conversationId": "analysis_1734567890_abc123",
    "title": "Document Analysis: Analyze this quarterly report...",
    "messages": [
      {
        "role": "user",
        "content": "Analyze this quarterly report",
        "metadata": {
          "hasFile": true,
          "fileName": "Q4_report.pdf"
        }
      },
      {
        "role": "assistant",
        "content": "The report shows...",
        "metadata": {
          "model": "gemini-3.5-flash"
        }
      }
    ],
    "metadata": {
      "category": "document_analysis",
      "model": "gemini-3.5-flash",
      "uploadedFiles": []
    }
  }
}
```

---

## Configuration

### File Limits
- **Max file size**: 10 MB
- **Supported formats**: PDF, DOCX, DOC, TXT, XLSX, XLS, PPTX, PPT

### Model Settings
- **Model**: Gemini 3.5 Flash
- **Temperature**: 0.7
- **Max tokens**: 4096

---

## Error Handling

**No Content Provided:**
```json
{
  "statusCode": 400,
  "success": false,
  "message": "No content provided for analysis. Please provide text or upload a file."
}
```

**File Too Large:**
```json
{
  "statusCode": 400,
  "success": false,
  "message": "File size exceeds the maximum limit of 10MB"
}
```

**Unsupported File:**
```json
{
  "statusCode": 400,
  "success": false,
  "message": "Unsupported file type. Please upload PDF, DOCX, TXT, XLSX, or PPTX files."
}
```

---

## Example Workflows

### Workflow 1: Quick Text Analysis
1. Send text message with `analysisType=summary`
2. Get instant summary

### Workflow 2: Deep Document Analysis
1. Upload document without message (general analysis)
2. Review analysis
3. Ask follow-up: "What are the financial implications?"
4. Continue conversation with specific questions

### Workflow 3: Entity Extraction Pipeline
1. Upload contract with `analysisType=entity_extraction`
2. Extract all entities
3. Ask: "List all dates in chronological order"
4. Ask: "What are the payment terms?"

---

## Integration Points

- ✅ **Conversations Module**: Tracks full conversation history
- ✅ **Subscription Limits**: Respects user usage quotas
- ✅ **Authentication**: Works with optionalAuth (guests welcome)
- ✅ **File Upload**: Automatic text extraction from various formats

---

## Module Structure

```
document_analysis/
├── document_analysis.constant.js    # Configuration & prompts
├── document_analysis.validation.js  # Request validation
├── document_analysis.service.js     # Business logic
├── document_analysis.controller.js  # Request handlers
├── document_analysis.route.js       # Express routes
├── services/
│   ├── fileProcessor.js            # File text extraction
│   └── textAnalyzer.js             # Gemini analysis
└── middlewares/
    └── uploadDocumentAnalysis.js   # File upload config
```

---

## Why Simple?

1. **One endpoint** - `/analyze` handles everything
2. **Smart defaults** - Just send text or file, no complex config
3. **Optional everything** - Message, file, analysis type all optional
4. **Conversation memory** - Natural follow-up questions
5. **Guest friendly** - No authentication required

---

## Next Steps

1. Test with Postman collection
2. Try different analysis types
3. Upload various file formats
4. Experiment with conversation context

For API testing, see the Postman collection in `/postman_collections/Document_Analysis_API.postman_collection.json`
