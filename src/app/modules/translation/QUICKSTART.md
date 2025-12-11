# Translation Module - Quick Start Guide

## Installation

```bash
# Install required dependencies
npm install @google-cloud/translate @langchain/google-genai mammoth pdf-parse xlsx multer zod
```

## Setup

1. **Configure Google Cloud Translation API:**
```bash
# Set environment variable
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
export GOOGLE_CLOUD_PROJECT_ID="your-project-id"
```

2. **Configure Gemini API:**
```bash
export GEMINI_SECRET_KEY="your-gemini-api-key"
```

## Quick Examples

### 1. Text Translation (Conversational)

```bash
# Simple translation
curl -X POST http://localhost:5000/api/v1/translation/assistant \
  -F "message=Translate 'Hello, how are you?' to French"

# Response:
# "Bonjour, comment allez-vous ?"
```

### 2. File Translation

```bash
# Upload and translate a document
curl -X POST http://localhost:5000/api/v1/translation/assistant \
  -F "message=Translate this document to Spanish" \
  -F "file=@document.pdf"
```

### 3. Direct Translation (Non-conversational)

```bash
curl -X POST http://localhost:5000/api/v1/translation/translate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Good morning",
    "targetLanguage": "es"
  }'

# Response: "Buenos días"
```

### 4. Language Detection

```bash
curl -X POST http://localhost:5000/api/v1/translation/detect \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Bonjour, comment allez-vous?"
  }'

# Response:
# {
#   "languageCode": "fr",
#   "languageName": "French",
#   "confidence": 0.98
# }
```

### 5. Get Supported Languages

```bash
curl -X GET http://localhost:5000/api/v1/translation/languages
```

## JavaScript/TypeScript Usage

### Using Fetch API

```javascript
// Text translation
async function translateText(text, targetLanguage) {
  const response = await fetch('/api/v1/translation/translate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      text,
      targetLanguage
    })
  });
  
  const result = await response.json();
  return result.data.translatedText;
}

// Usage
const translated = await translateText('Hello', 'es');
console.log(translated); // "Hola"
```

### File Upload with FormData

```javascript
async function translateFile(file, targetLanguage, message) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('message', message);
  
  const response = await fetch('/api/v1/translation/assistant', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });
  
  const result = await response.json();
  return result.data;
}

// Usage
const fileInput = document.querySelector('#file-input');
const file = fileInput.files[0];
const result = await translateFile(file, 'fr', 'Translate this to French');
```

### Conversational Translation

```javascript
class TranslationConversation {
  constructor() {
    this.conversationId = null;
  }
  
  async sendMessage(message, file = null) {
    const formData = new FormData();
    formData.append('message', message);
    
    if (this.conversationId) {
      formData.append('conversationId', this.conversationId);
    }
    
    if (file) {
      formData.append('file', file);
    }
    
    const response = await fetch('/api/v1/translation/assistant', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    
    const result = await response.json();
    this.conversationId = result.data.conversationId;
    
    return result.data;
  }
}

// Usage
const conversation = new TranslationConversation();

// Turn 1
let response = await conversation.sendMessage('I need to translate something');
console.log(response.message);
// "I can help you translate text or documents. What language would you like to translate to?"

// Turn 2
response = await conversation.sendMessage('Spanish');
console.log(response.message);
// "What text would you like to translate to Spanish?"

// Turn 3
response = await conversation.sendMessage('Hello, how are you?');
console.log(response.translation.translatedText);
// "Hola, ¿cómo estás?"
```

## React Component Example

```jsx
import React, { useState } from 'react';

function TranslationWidget() {
  const [text, setText] = useState('');
  const [targetLang, setTargetLang] = useState('es');
  const [translation, setTranslation] = useState('');
  const [loading, setLoading] = useState(false);

  const handleTranslate = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/translation/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          targetLanguage: targetLang
        })
      });
      
      const result = await response.json();
      setTranslation(result.data.translatedText);
    } catch (error) {
      console.error('Translation failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="translation-widget">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Enter text to translate"
      />
      
      <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
        <option value="es">Spanish</option>
        <option value="fr">French</option>
        <option value="de">German</option>
        <option value="it">Italian</option>
        <option value="pt">Portuguese</option>
      </select>
      
      <button onClick={handleTranslate} disabled={loading}>
        {loading ? 'Translating...' : 'Translate'}
      </button>
      
      {translation && (
        <div className="translation-result">
          <h3>Translation:</h3>
          <p>{translation}</p>
        </div>
      )}
    </div>
  );
}

export default TranslationWidget;
```

## Python Usage

```python
import requests

# Text translation
def translate_text(text, target_language, source_language=None):
    url = 'http://localhost:5000/api/v1/translation/translate'
    payload = {
        'text': text,
        'targetLanguage': target_language
    }
    if source_language:
        payload['sourceLanguage'] = source_language
    
    response = requests.post(url, json=payload)
    result = response.json()
    return result['data']['translatedText']

# Usage
translated = translate_text('Hello, world!', 'es')
print(translated)  # ¡Hola, mundo!

# File translation
def translate_file(file_path, target_language, message):
    url = 'http://localhost:5000/api/v1/translation/assistant'
    
    with open(file_path, 'rb') as f:
        files = {'file': f}
        data = {'message': message}
        
        response = requests.post(url, files=files, data=data)
        result = response.json()
        return result['data']

# Usage
result = translate_file('document.pdf', 'fr', 'Translate this to French')
print(result['translation']['translatedText'])
```

## Common Language Codes

| Language | Code |
|----------|------|
| English | en |
| Spanish | es |
| French | fr |
| German | de |
| Italian | it |
| Portuguese | pt |
| Russian | ru |
| Japanese | ja |
| Korean | ko |
| Chinese (Simplified) | zh-CN |
| Chinese (Traditional) | zh-TW |
| Arabic | ar |
| Hindi | hi |
| Turkish | tr |
| Vietnamese | vi |
| Thai | th |
| Dutch | nl |
| Polish | pl |
| Swedish | sv |

## Supported File Formats

- **Text:** .txt, .md, .html
- **Documents:** .docx, .pdf
- **Data:** .json, .csv, .xlsx

## Tips

1. **Auto-detect source language:** Omit `sourceLanguage` or set to `"auto"`
2. **Multi-turn conversations:** Use the same `conversationId` for context
3. **File size limit:** Maximum 10MB per file
4. **Text length limit:** Maximum 100,000 characters for direct text input
5. **Rate limiting:** Be mindful of rate limits in production

## Error Handling

```javascript
async function translateWithErrorHandling(text, targetLanguage) {
  try {
    const response = await fetch('/api/v1/translation/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, targetLanguage })
    });
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.message);
    }
    
    return result.data.translatedText;
  } catch (error) {
    if (error.message.includes('language code')) {
      console.error('Invalid language code');
    } else if (error.message.includes('limit')) {
      console.error('Text too long or file too large');
    } else {
      console.error('Translation failed:', error.message);
    }
    throw error;
  }
}
```

## Need Help?

- Check the full documentation in `README.md`
- Review the conversation patterns in the presentation module
- Examine the test scripts in `/scripts` directory
- Contact the development team for support
