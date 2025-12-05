# Report Generation Module

## Overview

The Report Generation Module is a comprehensive AI-powered service for creating professional reports from user messages, uploaded files, or both. It supports multiple input formats (PDF, DOCX, CSV, XLSX, TXT, JSON, etc.) and can export reports in various formats (PDF, DOCX, CSV, XLSX, TXT, MD, HTML, JSON).

## Features

- **Conversational AI Interface**: Natural language report generation with multi-turn conversations
- **Multiple File Upload Support**: Upload and analyze up to 10 files simultaneously
- **Flexible Input Formats**: Supports PDF, DOCX, DOC, XLSX, XLS, CSV, TXT, JSON, MD, HTML
- **Multiple Export Formats**: Generate reports in PDF, DOCX, CSV, XLSX, TXT, Markdown, HTML, JSON
- **Report Types**: Executive summary, analytical, financial, technical, research, business, comparison, custom
- **Customizable Sections**: Title page, executive summary, table of contents, introduction, findings, analysis, recommendations, conclusion
- **Guest & Authenticated Users**: Support for both user types with usage tracking
- **Subscription-Based Limits**: Integrated with subscription system for usage control

## Architecture

### Module Structure

```
src/app/modules/report/
├── report.constant.js          # Constants and configuration
├── report.validation.js        # Zod validation schemas
├── report.service.js           # Core business logic
├── report.controller.js        # Request handlers
├── report.route.js             # API endpoints
├── middlewares/
│   └── uploadReportFiles.js    # File upload handling
└── utils/
    ├── fileParser.js           # File parsing utilities
    └── reportExporter.js       # Report export utilities
```

### Technology Stack

- **AI Model**: OpenAI GPT-4o (configurable)
- **File Upload**: Multer with disk storage
- **PDF Generation**: PDFKit
- **Conversation Management**: Integrated with existing conversation service
- **Validation**: Zod schemas

## API Endpoints

### 1. Conversational Assistant (Primary Endpoint)

**POST** `/api/v1/reports/assistant`

Generate reports through natural language conversation with optional file uploads.

**Authentication**: Optional (supports guest users)

**Request Body**:
```json
{
  "message": "Generate a sales report based on the uploaded data",
  "conversationId": "report_1234567890_abc123",
  "userId": "optional-for-guest",
  "outputFormat": "pdf",
  "reportType": "analytical"
}
```

**With File Upload**:
```bash
curl -X POST http://localhost:5000/api/v1/reports/assistant \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "message=Generate a report from these files" \
  -F "files=@data.csv" \
  -F "files=@analysis.pdf" \
  -F "outputFormat=pdf"
```

**Response**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Request processed successfully",
  "data": {
    "conversationId": "report_1234567890_abc123",
    "success": true,
    "needsMoreInfo": false,
    "response": "I've generated your analytical report in PDF format...",
    "report": {
      "reportId": "report_1234567890_xyz789",
      "title": "Sales Analysis Report",
      "outputFormat": "pdf",
      "filePath": "/output/reports/report_1234567890_xyz789.pdf",
      "downloadUrl": "/api/v1/reports/download/report_1234567890_xyz789.pdf",
      "metadata": {
        "reportType": "analytical",
        "tone": "professional",
        "generatedAt": "2025-12-04T10:30:00.000Z"
      }
    }
  }
}
```

**If More Information Needed**:
```json
{
  "statusCode": 200,
  "success": true,
  "data": {
    "conversationId": "report_1234567890_abc123",
    "success": true,
    "needsMoreInfo": true,
    "response": "I'd be happy to help generate your report. What type of report would you like? (e.g., analytical, financial, executive summary)",
    "missingParams": ["reportType"]
  }
}
```

### 2. Direct Generation

**POST** `/api/v1/reports/generate`

Generate reports programmatically with all parameters provided.

**Authentication**: Optional

**Request Body**:
```json
{
  "content": "Your report content here...",
  "title": "Q4 Financial Report",
  "reportType": "financial",
  "outputFormat": "pdf",
  "tone": "professional",
  "sections": [
    "title_page",
    "executive_summary",
    "table_of_contents",
    "introduction",
    "findings",
    "analysis",
    "recommendations",
    "conclusion"
  ],
  "includeTitlePage": true,
  "includeTableOfContents": true,
  "includeExecutiveSummary": true,
  "customInstructions": "Focus on year-over-year growth metrics"
}
```

**Response**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Report generated successfully",
  "data": {
    "success": true,
    "report": {
      "reportId": "report_1234567890_xyz789",
      "title": "Q4 Financial Report",
      "outputFormat": "pdf",
      "filePath": "/output/reports/report_1234567890_xyz789.pdf",
      "downloadUrl": "/api/v1/reports/download/report_1234567890_xyz789.pdf",
      "sections": [...],
      "metadata": {...}
    }
  }
}
```

### 3. Analyze Files

**POST** `/api/v1/reports/analyze`

Analyze uploaded files and extract insights.

**Authentication**: Optional

**Request Body** (multipart/form-data):
```
files: [file1.csv, file2.pdf, file3.xlsx]
analysisType: "detailed"  // Options: summary, detailed, comparison, extraction
instructions: "Focus on trends and anomalies"
conversationId: "report_1234567890_abc123"
```

**Response**:
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Files analyzed successfully",
  "data": {
    "success": true,
    "analysis": "Detailed analysis of the uploaded files...",
    "filesAnalyzed": 3,
    "extractedData": [
      {
        "filename": "file1.csv",
        "content": "...",
        "data": [...],
        "metadata": {...}
      }
    ]
  }
}
```

### 4. Download Report

**GET** `/api/v1/reports/download/:filename`

Download a generated report file.

**Authentication**: None required

**Example**:
```bash
curl -O http://localhost:5000/api/v1/reports/download/report_1234567890_xyz789.pdf
```

### 5. Export Report (Placeholder)

**POST** `/api/v1/reports/export`

Export an existing report to a different format.

**Authentication**: Required

**Request Body**:
```json
{
  "reportId": "report_1234567890_xyz789",
  "outputFormat": "docx"
}
```

### 6. Get Report (Placeholder)

**GET** `/api/v1/reports/:reportId`

Retrieve report metadata and content.

**Authentication**: Required

### 7. List Reports (Placeholder)

**GET** `/api/v1/reports?page=1&limit=10&reportType=analytical&sortBy=createdAt&sortOrder=desc`

List user's reports with pagination and filtering.

**Authentication**: Required

### 8. Modify Report (Placeholder)

**POST** `/api/v1/reports/modify`

Modify an existing report.

**Authentication**: Required

## Configuration

### Environment Variables

Add the following to your `.env` file:

```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key

# Report Configuration (optional)
REPORT_AI_MODEL=gpt-4o
```

### Constants Configuration

Edit `report.constant.js` to customize:

- Supported file formats
- Output formats
- Report types
- File size limits
- Default parameters
- AI model settings

## Usage Examples

### Example 1: Simple Text-Based Report

```javascript
const response = await fetch('http://localhost:5000/api/v1/reports/generate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({
    content: 'Our Q4 sales increased by 25% compared to Q3. Key drivers include...',
    title: 'Q4 Sales Report',
    reportType: 'business',
    outputFormat: 'pdf',
    tone: 'professional'
  })
});

const data = await response.json();
console.log('Download URL:', data.data.report.downloadUrl);
```

### Example 2: Conversational Report with File Upload

```javascript
const formData = new FormData();
formData.append('message', 'Analyze these sales files and create a comprehensive report');
formData.append('files', file1);
formData.append('files', file2);
formData.append('outputFormat', 'pdf');

const response = await fetch('http://localhost:5000/api/v1/reports/assistant', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: formData
});

const data = await response.json();
```

### Example 3: Multi-Turn Conversation

```javascript
// First request
let response = await fetch('http://localhost:5000/api/v1/reports/assistant', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    message: 'I need a report'
  })
});

let data = await response.json();
// Response: "What type of report would you like?"

// Second request with conversation ID
response = await fetch('http://localhost:5000/api/v1/reports/assistant', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    message: 'An analytical report about sales trends',
    conversationId: data.data.conversationId
  })
});

data = await response.json();
// Response: "I'd be happy to create an analytical report..."
```

### Example 4: File Analysis Only

```javascript
const formData = new FormData();
formData.append('files', csvFile);
formData.append('files', excelFile);
formData.append('analysisType', 'detailed');
formData.append('instructions', 'Compare data trends across both files');

const response = await fetch('http://localhost:5000/api/v1/reports/analyze', {
  method: 'POST',
  body: formData
});

const data = await response.json();
console.log('Analysis:', data.data.analysis);
```

## Supported Formats

### Input Formats
- **Documents**: PDF, DOC, DOCX, TXT, MD, HTML
- **Data**: CSV, XLSX, XLS, JSON

### Output Formats
- **Documents**: PDF, DOCX, DOC, TXT, MD, HTML
- **Data**: CSV, XLSX, XLS, JSON

## Report Types

1. **Executive Summary**: High-level overview for executives
2. **Analytical**: In-depth data analysis with insights
3. **Financial**: Financial metrics and analysis
4. **Technical**: Technical documentation and specifications
5. **Research**: Academic or research-focused reports
6. **Business**: Business strategy and planning
7. **Comparison**: Comparative analysis between datasets
8. **Custom**: User-defined report structure

## Report Sections

Configure which sections to include:

- Title Page
- Executive Summary
- Table of Contents
- Introduction
- Methodology
- Findings
- Analysis
- Recommendations
- Conclusion
- Appendix
- References

## File Upload Limits

- **Maximum files per request**: 10
- **PDF**: 10 MB
- **DOC/DOCX**: 5 MB
- **XLSX/XLS**: 5 MB
- **CSV**: 2 MB
- **TXT**: 1 MB

## Error Handling

Common error responses:

```json
{
  "statusCode": 400,
  "success": false,
  "message": "File format .exe is not supported. Allowed formats: pdf, txt, doc, docx, csv, xlsx, xls, json, md, html"
}
```

```json
{
  "statusCode": 403,
  "success": false,
  "message": "You have reached your report generation limit for this month. Please upgrade your plan to continue."
}
```

```json
{
  "statusCode": 500,
  "success": false,
  "message": "Failed to generate report content"
}
```

## Dependencies Installation

The module uses several npm packages. Some advanced features require additional packages:

### Required (already in package.json):
- `openai`
- `multer`
- `pdfkit`
- `zod`

### Optional (for enhanced functionality):

```bash
npm install pdf-parse mammoth xlsx docx
```

- `pdf-parse`: For PDF content extraction
- `mammoth`: For DOCX content extraction
- `xlsx`: For Excel file processing
- `docx`: For DOCX generation

## Integration with Existing Systems

The report module integrates seamlessly with:

1. **Conversation Service**: Multi-turn conversations with context
2. **Subscription System**: Usage tracking and limits
3. **Authentication**: Supports both authenticated and guest users
4. **Rate Limiting**: Configurable rate limits per endpoint

## Future Enhancements

Placeholder endpoints are ready for implementation:

1. **Report Storage**: Database storage for report metadata
2. **Report History**: View and manage past reports
3. **Report Modification**: Edit existing reports
4. **Template System**: Pre-built report templates
5. **Chart Generation**: Automatic data visualization
6. **Collaborative Reports**: Multi-user report editing

## Testing

### Manual Testing with cURL

```bash
# Test conversational endpoint
curl -X POST http://localhost:5000/api/v1/reports/assistant \
  -H "Content-Type: application/json" \
  -d '{"message": "Create a test report", "outputFormat": "pdf"}'

# Test with file upload
curl -X POST http://localhost:5000/api/v1/reports/assistant \
  -F "message=Analyze this file" \
  -F "files=@test.csv" \
  -F "outputFormat=pdf"

# Download report
curl -O http://localhost:5000/api/v1/reports/download/report_xxx.pdf
```

## Troubleshooting

### Common Issues

1. **File upload fails**
   - Check file size limits
   - Verify file format is supported
   - Ensure `uploads/reports` directory exists

2. **PDF generation fails**
   - Verify PDFKit is installed
   - Check output directory permissions
   - Review report data structure

3. **AI generation errors**
   - Verify `OPENAI_API_KEY` is set
   - Check API quota/limits
   - Review content length

4. **File parsing errors**
   - Install optional dependencies (pdf-parse, mammoth, xlsx)
   - Verify file is not corrupted
   - Check file encoding

## License

MIT

## Support

For issues or questions, please contact the development team or create an issue in the repository.
