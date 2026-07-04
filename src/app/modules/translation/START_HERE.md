# Translation Module - Quick Start

## ✅ Setup Complete!

Your translation module is now fully configured and ready to use with your existing Google Cloud credentials (`alti_gcp.json`).

## 🚀 Start the Server

```bash
npm start
# or for development
npm run dev
```

## 🧪 Quick Test

Once the server is running, test the translation module:

### 1. Get Supported Languages

```bash
curl http://localhost:5000/api/v1/translation/languages
```

### 2. Simple Translation Test

```powershell
# PowerShell
$body = @{
    text = "Hello, how are you?"
    targetLanguage = "es"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/v1/translation/translate" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body
```

### 3. Conversational Test

```powershell
# PowerShell
$form = @{
    message = "Translate 'Good morning' to French"
}

Invoke-RestMethod -Uri "http://localhost:5000/api/v1/translation/assistant" `
    -Method POST `
    -Form $form
```

## 📋 What's Configured

✅ Dependencies installed
✅ Google Cloud credentials configured (alti_gcp.json)
✅ Project ID: alti-assistant-prod
✅ 40+ languages supported
✅ File upload support (DOCX, PDF, TXT, XLSX, etc.)
✅ Conversational AI with Gemini
✅ Multi-turn conversations

## 🔍 Verify Setup

Run the test script after starting the server:

```bash
node scripts/test-translation.js
```

## 📚 API Endpoints

All endpoints are now available at:

- `GET  /api/v1/translation/languages` - List supported languages
- `POST /api/v1/translation/translate` - Direct text translation
- `POST /api/v1/translation/detect` - Language detection
- `POST /api/v1/translation/assistant` - Conversational translation (with optional file upload)

## 💡 Example Use Cases

### 1. Translate User Messages

```javascript
// User: "Translate 'Hello' to Spanish"
// Response: "Hola"
```

### 2. Translate Documents

```javascript
// User uploads PDF and says: "Translate this to French"
// System extracts text from PDF and translates
```

### 3. Multi-turn Conversation

```javascript
// User: "I need to translate something"
// Bot: "What language would you like to translate to?"
// User: "Spanish"
// Bot: "What text would you like to translate?"
// User: "Thank you for your help"
// Bot: "¡Gracias por tu ayuda!"
```

## 🎯 Next Steps

1. **Start the server:** `npm start`
2. **Test the endpoints** using the commands above
3. **Import Postman collection:** `postman_collections/Translation_API.postman_collection.json`
4. **Review documentation:** `src/app/modules/translation/README.md`

## ⚠️ Important Note

Make sure the **Cloud Translation API** is enabled in your Google Cloud project:

- Go to: https://console.cloud.google.com/apis/library/translate.googleapis.com
- Select project: `alti-assistant-prod`
- Click "Enable" if not already enabled

## 🎉 You're Ready!

The translation module is fully integrated and ready to use. Start your server and test it out!

---

For full documentation, see: `src/app/modules/translation/README.md`
