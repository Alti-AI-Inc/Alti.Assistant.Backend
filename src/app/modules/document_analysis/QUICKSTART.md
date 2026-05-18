# Document Analysis - Quick Start Guide

Get started with the Document Analysis API in 3 simple steps.

## 🚀 Quick Start

### Step 1: Test with Simple Text

```bash
curl -X POST http://localhost:5000/api/v1/document-analysis/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Analyze this: Our Q4 revenue grew 45% to $2.3M"
  }'
```

### Step 2: Try Different Analysis Types

```bash
# Sentiment Analysis
curl -X POST http://localhost:5000/api/v1/document-analysis/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "message": "This product is amazing! Great support!",
    "analysisType": "sentiment"
  }'

# Extract Key Points
curl -X POST http://localhost:5000/api/v1/document-analysis/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Long text here...",
    "analysisType": "key_points"
  }'

# Get Summary
curl -X POST http://localhost:5000/api/v1/document-analysis/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Long document text...",
    "analysisType": "summary"
  }'
```

### Step 3: Upload a File

```bash
curl -X POST http://localhost:5000/api/v1/document-analysis/analyze \
  -F "file=@document.pdf" \
  -F "message=What are the main points in this document?"
```

## 📝 Analysis Types

| Type                   | Description            | Use Case                   |
| ---------------------- | ---------------------- | -------------------------- |
| `general`              | Comprehensive analysis | Default, covers everything |
| `sentiment`            | Emotional tone         | Customer feedback, reviews |
| `summary`              | Concise summary        | Long documents, articles   |
| `key_points`           | Main points            | Reports, meetings notes    |
| `entity_extraction`    | Extract entities       | Contracts, legal docs      |
| `topic_classification` | Categorize topics      | Content organization       |
| `language_detection`   | Language analysis      | Multi-language docs        |

## 🎯 Common Use Cases

### Use Case 1: Customer Feedback Analysis

```json
{
  "message": "Customer review text here...",
  "analysisType": "sentiment",
  "outputFormat": "structured"
}
```

### Use Case 2: Contract Review

```bash
# Upload contract PDF
-F "file=@contract.pdf"
-F "message=Extract all payment terms and deadlines"
-F "analysisType=entity_extraction"
```

### Use Case 3: Meeting Notes Summary

```json
{
  "message": "Long meeting transcript...",
  "analysisType": "summary"
}
```

### Use Case 4: Document Q&A

```json
// First request
{
  "file": "report.pdf"
}

// Save the conversationId from response

// Follow-up question
{
  "conversationId": "analysis_xxx",
  "message": "What are the financial implications?"
}
```

## 🔑 Response Example

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Analysis completed successfully",
  "data": {
    "success": true,
    "conversationId": "analysis_1734567890_abc123",
    "analysis": "The content demonstrates positive sentiment with...",
    "metadata": {
      "analysisType": "sentiment",
      "outputFormat": "narrative",
      "model": "gemini-3.5-flash",
      "fileProcessed": false,
      "fileName": null
    }
  }
}
```

## 💡 Pro Tips

1. **No message needed for file analysis** - Just upload the file
2. **Combine file + message** - Upload file and ask specific questions
3. **Use conversationId** - Continue conversations for follow-up questions
4. **Try structured format** - Better for data extraction
5. **Guest friendly** - Works without authentication

## 🔧 Supported Files

- **Documents**: PDF, DOCX, DOC, TXT
- **Spreadsheets**: XLSX, XLS
- **Presentations**: PPTX, PPT
- **Max size**: 10 MB

## 📦 Postman Collection

Import the Postman collection for easy testing:

- File: `/postman_collections/Document_Analysis_API.postman_collection.json`
- Includes 12 ready-to-use examples

## ⚙️ Configuration

Model: **Gemini 3.5 Flash**

- Fast responses
- Cost-effective
- High quality analysis
- 4096 token output limit

## 🆘 Troubleshooting

**"No content provided"**

- Add either `message` or `file` parameter

**"File too large"**

- Compress or split files over 10MB

**"Unsupported file type"**

- Use PDF, DOCX, TXT, XLSX, or PPTX

**"Conversation not found"**

- Verify conversationId is correct
- Ensure you're the owner (authenticated users)

## 🎓 Learning Path

1. ✅ Try text analysis (Step 1)
2. ✅ Experiment with analysis types (Step 2)
3. ✅ Upload a file (Step 3)
4. ✅ Use conversation context
5. ✅ Combine file + specific questions

Ready to analyze! 🚀
