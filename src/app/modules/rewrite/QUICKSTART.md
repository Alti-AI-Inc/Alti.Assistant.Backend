# Rewrite Module - Quick Start Guide

Get started with the Rewrite module in 5 minutes!

## What It Does

The Rewrite module allows users to:

- ✍️ Rewrite text or uploaded documents
- 🎨 Choose different writing styles (formal, casual, professional, academic, etc.)
- 📁 Optionally generate downloadable files
- 💬 Use natural conversation or direct API calls

## Quick Examples

### 1. Simple Text Rewrite (Conversational)

**Request:**

```bash
POST /api/v1/rewrite/assistant
Content-Type: application/json

{
  "message": "Make this more professional",
  "textContent": "Hey! Thanks for the help. I'll get back to you soon."
}
```

**Response:**

```json
{
  "success": true,
  "rewrittenContent": "Thank you for your assistance. I will respond to you shortly.",
  "conversationId": "rewrite_1234567890_abc123"
}
```

### 2. Upload File and Rewrite

**Request:**

```bash
POST /api/v1/rewrite/assistant
Content-Type: multipart/form-data

message: "Rewrite this in formal style"
file: [document.pdf]
```

**Response:**

```json
{
  "success": true,
  "rewrittenContent": "Formally rewritten content...",
  "conversationId": "rewrite_1234567890_xyz456"
}
```

### 3. Generate Downloadable File

**Request:**

```bash
POST /api/v1/rewrite/assistant
Content-Type: application/json

{
  "message": "Simplify this and create a file",
  "textContent": "Your complex text here..."
}
```

**Response:**

```json
{
  "success": true,
  "rewrittenContent": "Simplified version...",
  "file": {
    "filename": "rewritten_1234567890.txt",
    "path": "output/rewrites/rewritten_1234567890.txt"
  }
}
```

### 4. Direct/Programmatic Rewrite

**Request:**

```bash
POST /api/v1/rewrite/rewrite
Content-Type: application/json

{
  "textContent": "Your text here",
  "intent": "formal",
  "style": "professional",
  "mode": "preserve_meaning",
  "outputFormat": "text"
}
```

## Common Use Cases

### Use Case 1: Email Tone Adjustment

```javascript
// Make an informal email professional
{
  "message": "Make this email professional",
  "textContent": "Hey boss! Just wanted to let you know I finished the report."
}
```

### Use Case 2: Academic Paper Simplification

```javascript
// Simplify complex academic text
{
  "message": "Simplify this for a general audience",
  "file": [academic_paper.pdf]
}
```

### Use Case 3: Content Expansion

```javascript
// Expand brief notes into detailed content
{
  "message": "Expand this with more details",
  "textContent": "Meeting notes: Discussed project timeline and budget."
}
```

### Use Case 4: Grammar Correction

```javascript
// Fix grammar and improve readability
{
  "message": "Fix all grammar errors",
  "textContent": "Me and my team has been working on this project since last week."
}
```

## Supported Rewrite Styles

Simply mention these in your message:

- **Formal** - "Make it formal", "formal tone"
- **Casual** - "Make it casual", "friendly tone"
- **Professional** - "Make it professional", "business style"
- **Academic** - "Academic style", "scholarly"
- **Creative** - "Make it creative", "engaging"
- **Simplify** - "Simplify", "make it simple"
- **Expand** - "Expand this", "add more details"
- **Shorten** - "Make it shorter", "condense"

## File Generation

To get a downloadable file, include keywords like:

- "create a file"
- "generate file"
- "save as file"
- "download"
- "export"

## Testing with cURL

### Test 1: Basic Text Rewrite

```bash
curl -X POST http://localhost:3000/api/v1/rewrite/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Make this formal",
    "textContent": "Thanks! I will check it out."
  }'
```

### Test 2: File Upload

```bash
curl -X POST http://localhost:3000/api/v1/rewrite/assistant \
  -F "message=Rewrite this professionally" \
  -F "file=@/path/to/document.pdf"
```

### Test 3: With File Output

```bash
curl -X POST http://localhost:3000/api/v1/rewrite/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Simplify and create a file",
    "textContent": "Your complex text here..."
  }'
```

## Integration Example (JavaScript/TypeScript)

```javascript
// Simple rewrite function
async function rewriteText(text, style) {
  const response = await fetch('/api/v1/rewrite/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Rewrite in ${style} style`,
      textContent: text,
    }),
  });

  const result = await response.json();
  return result.data.rewrittenContent;
}

// Usage
const professional = await rewriteText(
  'Hey! Thanks for the update.',
  'professional'
);
console.log(professional);
// Output: "Thank you for the update."
```

## React Component Example

```jsx
import React, { useState } from 'react';

function RewriteTool() {
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRewrite = async (style) => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/rewrite/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Make this ${style}`,
          textContent: text,
        }),
      });

      const data = await response.json();
      setResult(data.data.rewrittenContent);
    } catch (error) {
      console.error('Rewrite failed:', error);
    }
    setLoading(false);
  };

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Enter text to rewrite..."
      />

      <button onClick={() => handleRewrite('formal')}>Formal</button>
      <button onClick={() => handleRewrite('casual')}>Casual</button>
      <button onClick={() => handleRewrite('professional')}>
        Professional
      </button>

      {loading && <p>Rewriting...</p>}
      {result && (
        <div>
          <h3>Result:</h3>
          <p>{result}</p>
        </div>
      )}
    </div>
  );
}
```

## File Upload Example (JavaScript)

```javascript
async function rewriteFile(file, instructions) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('message', instructions);

  const response = await fetch('/api/v1/rewrite/assistant', {
    method: 'POST',
    body: formData,
  });

  const result = await response.json();
  return result.data;
}

// Usage
const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];
const result = await rewriteFile(file, 'Rewrite in professional style');
console.log(result.rewrittenContent);
```

## Conversation Continuity

```javascript
// First request
const response1 = await fetch('/api/v1/rewrite/assistant', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Make this formal',
    textContent: 'Hey! Great work on the project.',
  }),
});

const { conversationId } = await response1.json();

// Follow-up request with context
const response2 = await fetch('/api/v1/rewrite/assistant', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Now make it more casual',
    conversationId: conversationId,
  }),
});
```

## Troubleshooting

### Issue: "Content is required"

**Solution:** Provide either `textContent` or upload a `file`

### Issue: "File type not supported"

**Solution:** Use supported formats: PDF, DOCX, DOC, TXT, XLSX, XLS, PPTX, PPT

### Issue: File too large

**Solution:** Ensure file is under 10 MB

### Issue: No file generated when requested

**Solution:** Include file keywords in message: "create file", "generate file", etc.

## Next Steps

1. **Read the full documentation**: [README.md](README.md)
2. **Test the endpoints** using the examples above
3. **Integrate into your application** using the provided examples
4. **Explore advanced features** like conversation history and custom styles

## Support

For issues or questions:

1. Check the full [README.md](README.md)
2. Review error messages for specific guidance
3. Contact the development team

## Summary

You now know how to:

- ✅ Rewrite text using natural language
- ✅ Upload and rewrite documents
- ✅ Generate downloadable files
- ✅ Use different writing styles
- ✅ Maintain conversation context

Start rewriting! 🚀
