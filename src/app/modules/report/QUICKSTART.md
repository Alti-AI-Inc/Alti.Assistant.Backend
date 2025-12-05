# Report Module - Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### Prerequisites

1. OpenAI API Key configured in `.env`:
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   ```

2. Server running:
   ```bash
   npm run dev
   ```

### Basic Usage

#### 1. Generate a Simple Report

**Request:**
```bash
curl -X POST http://localhost:5000/api/v1/reports/generate \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Our company achieved 150% revenue growth in Q4 2024. Key factors include new product launches and market expansion.",
    "title": "Q4 2024 Growth Report",
    "reportType": "business",
    "outputFormat": "pdf"
  }'
```

**Response:**
```json
{
  "success": true,
  "report": {
    "reportId": "report_1733308800_xyz789",
    "title": "Q4 2024 Growth Report",
    "downloadUrl": "/api/v1/reports/download/report_1733308800_xyz789.pdf"
  }
}
```

#### 2. Conversational Report Generation

**Request:**
```bash
curl -X POST http://localhost:5000/api/v1/reports/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Create a professional sales report for Q4"
  }'
```

**Response:**
The AI will guide you through the process, asking for any missing information.

#### 3. Generate Report from Files

**Request:**
```bash
curl -X POST http://localhost:5000/api/v1/reports/assistant \
  -F "message=Create a comprehensive analysis report" \
  -F "files=@sales_data.csv" \
  -F "files=@market_analysis.pdf" \
  -F "outputFormat=pdf"
```

**Response:**
Returns analysis and generated report with download link.

#### 4. Download Report

```bash
curl -O http://localhost:5000/api/v1/reports/download/report_1733308800_xyz789.pdf
```

## 📊 Report Types

Choose from these report types:

- `executive_summary` - High-level overview
- `analytical` - Detailed analysis
- `financial` - Financial metrics
- `technical` - Technical documentation
- `research` - Research findings
- `business` - Business strategy
- `comparison` - Comparative analysis
- `custom` - Custom structure

## 📄 Output Formats

Export your report in any of these formats:

- `pdf` - PDF document (default)
- `docx` - Microsoft Word
- `csv` - Comma-separated values
- `xlsx` - Microsoft Excel
- `txt` - Plain text
- `md` - Markdown
- `html` - HTML document
- `json` - JSON data

## 📁 Supported Input Files

Upload these file types:

- PDF, DOC, DOCX - Documents
- CSV, XLSX, XLS - Spreadsheets
- TXT, MD - Text files
- JSON - Data files
- HTML - Web pages

## 🎯 Common Use Cases

### Use Case 1: Financial Report from Excel Data

```javascript
const formData = new FormData();
formData.append('files', excelFile);
formData.append('message', 'Generate a financial report with charts and insights');
formData.append('reportType', 'financial');
formData.append('outputFormat', 'pdf');

fetch('http://localhost:5000/api/v1/reports/assistant', {
  method: 'POST',
  body: formData
});
```

### Use Case 2: Compare Multiple Documents

```bash
curl -X POST http://localhost:5000/api/v1/reports/analyze \
  -F "files=@version1.pdf" \
  -F "files=@version2.pdf" \
  -F "analysisType=comparison" \
  -F "instructions=Highlight key differences and improvements"
```

### Use Case 3: Executive Summary

```javascript
{
  "content": "Detailed quarterly data and metrics...",
  "reportType": "executive_summary",
  "tone": "professional",
  "sections": ["executive_summary", "key_findings", "recommendations"],
  "outputFormat": "pdf"
}
```

### Use Case 4: Multi-Turn Conversation

```javascript
// Step 1: Start conversation
const step1 = await fetch('/api/v1/reports/assistant', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'I need to create a report'
  })
});

const { conversationId } = await step1.json();

// Step 2: Provide details
const step2 = await fetch('/api/v1/reports/assistant', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'It should be an analytical report about sales trends in PDF format',
    conversationId
  })
});
```

## ⚙️ Configuration

### Default Settings

The module comes with sensible defaults:

- **AI Model**: GPT-4o
- **Report Type**: Analytical
- **Output Format**: PDF
- **Tone**: Professional
- **Sections**: Complete report structure

### Custom Configuration

Modify `report.constant.js` to change:

```javascript
export const REPORT_CONFIG = {
  MODEL: 'gpt-4o',  // Change AI model
  TEMPERATURE: 0.7,  // Creativity level
  MAX_TOKENS: 4096,  // Response length
};

export const DEFAULT_PARAMS = {
  reportType: 'analytical',
  outputFormat: 'pdf',
  tone: 'professional',
  // ... more defaults
};
```

## 🔒 Authentication

### For Guest Users (No Auth Required)

```javascript
fetch('/api/v1/reports/assistant', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Create report',
    userId: 'guest_12345'  // Optional guest ID
  })
});
```

### For Authenticated Users

```javascript
fetch('/api/v1/reports/assistant', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  },
  body: JSON.stringify({
    message: 'Create report'
  })
});
```

## 📈 Rate Limits

Default rate limits (configurable in routes):

- Conversational endpoint: 20 requests / 15 minutes
- Direct generation: 10 requests / 15 minutes
- File analysis: 15 requests / 15 minutes

## 🐛 Troubleshooting

### Error: "OPENAI_API_KEY not set"

**Solution:**
```bash
echo "OPENAI_API_KEY=your_key_here" >> .env
```

### Error: "File format not supported"

**Solution:** Check supported formats in README.md

### Error: "File size exceeds limit"

**Solution:** Reduce file size or split into multiple files

### PDF Generation Issues

**Solution:** Install PDFKit dependency:
```bash
npm install pdfkit
```

### File Parsing Issues

**Solution:** Install optional dependencies:
```bash
npm install pdf-parse mammoth xlsx docx
```

## 📚 Next Steps

1. ✅ Test basic report generation
2. ✅ Try file upload and analysis
3. ✅ Experiment with different output formats
4. ✅ Explore conversational mode
5. ✅ Integrate with your application

## 💡 Pro Tips

1. **Use conversational mode** for complex reports - the AI will guide you
2. **Upload multiple files** for comprehensive analysis
3. **Specify custom instructions** for tailored reports
4. **Try different tones** - professional, formal, technical, casual
5. **Use sections parameter** to control report structure

## 🔗 Related Documentation

- Full API Documentation: `README.md`
- Constants Configuration: `report.constant.js`
- Validation Schemas: `report.validation.js`

## 📞 Need Help?

- Check the full README.md for detailed documentation
- Review the example code in the documentation
- Test with the provided cURL commands

Happy reporting! 🎉
