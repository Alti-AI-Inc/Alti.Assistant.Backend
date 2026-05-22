# Translation Module - Setup Checklist

## ✅ Completed Tasks

- [x] Created translation module structure
- [x] Implemented conversation analyzer with Gemini AI
- [x] Integrated Google Cloud Translation API
- [x] Added file extraction service (DOCX, PDF, XLSX, TXT, etc.)
- [x] Created conversational assistant endpoint
- [x] Created direct translation endpoints
- [x] Added language detection functionality
- [x] Implemented multi-turn conversation support
- [x] Added subscription limit checking
- [x] Created comprehensive documentation
- [x] Created test scripts
- [x] Created Postman collection
- [x] Registered routes in main router
- [x] Created uploads directory

## 📋 Required Setup Steps

### 1. Install Dependencies

```bash
cd d:\alti\Alti-Core-Service-Backend
npm install @google-cloud/translate @langchain/google-genai mammoth pdf-parse xlsx
```

**Status:** ⏳ Pending

### 2. Configure Google Cloud Translation API

✅ **Already Configured!** The module uses your existing `alti_gcp.json` credentials file.

- Project ID: `alti-assistant-prod`
- Service Account: `alti-assistant-service@alti-assistant-prod.iam.gserviceaccount.com`
- Credentials file: `alti_gcp.json` (in project root)

**Just ensure Translation API is enabled in your Google Cloud project:**

1. Go to Google Cloud Console: https://console.cloud.google.com
2. Select project: `alti-assistant-prod`
3. Enable "Cloud Translation API" if not already enabled

**Status:** ✅ Configured (using alti_gcp.json)

### 3. Verify Gemini API Key

```bash
# Check if GEMINI_SECRET_KEY is already set in your environment
# If not, add it to your .env file or environment
export GEMINI_SECRET_KEY="your-gemini-api-key"
```

**Status:** ⏳ Pending (likely already configured)

### 4. Restart the Server

```bash
# Stop the current server (Ctrl+C)
# Start the server again
npm start
# or
npm run dev
```

**Status:** ⏳ Pending

## 🧪 Testing Steps

### 1. Run Test Script

```bash
node scripts/test-translation.js
```

**Expected Output:**

- ✓ All 7 tests should pass
- ✓ No errors in console
- ✓ Translations returned successfully

**Status:** ⏳ Pending

### 2. Test with Postman

```bash
# Import the collection
# File: postman_collections/Translation_API.postman_collection.json
#
# Set the baseUrl variable to: http://localhost:5000/api/v1
# Run the requests one by one
```

**Status:** ⏳ Pending

### 3. Manual Test with cURL

```bash
# Test 1: Get supported languages
curl -X GET http://localhost:5000/api/v1/translation/languages

# Test 2: Simple translation
curl -X POST http://localhost:5000/api/v1/translation/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello", "targetLanguage": "es"}'

# Test 3: Conversational assistant
curl -X POST http://localhost:5000/api/v1/translation/assistant \
  -F "message=Translate hello to French"
```

**Status:** ⏳ Pending

## 📝 Verification Checklist

### Server Startup

- [ ] Server starts without errors
- [ ] Translation routes are registered
- [ ] No missing dependency errors
- [ ] Console shows: "Registering route: /translation"

### API Endpoints

- [ ] GET /api/v1/translation/languages returns 200
- [ ] POST /api/v1/translation/translate works
- [ ] POST /api/v1/translation/detect works
- [ ] POST /api/v1/translation/assistant works

### File Upload

- [ ] Can upload .txt files
- [ ] Can upload .docx files
- [ ] Can upload .pdf files
- [ ] Files are cleaned up after processing

### Conversation Flow

- [ ] Can start a new conversation
- [ ] Can continue existing conversation
- [ ] Multi-turn conversation works
- [ ] Conversation history is maintained

### Translation Features

- [ ] Text translation works
- [ ] Language detection works
- [ ] Auto-detect source language works
- [ ] Multiple target languages work

### Error Handling

- [ ] Invalid language codes are rejected
- [ ] Missing required fields return proper errors
- [ ] File size limits are enforced
- [ ] Unsupported file formats are rejected

## 🚨 Common Issues & Solutions

### Issue 1: "Translation API not initialized"

**Solution:**

- Verify GOOGLE_APPLICATION_CREDENTIALS is set
- Check that the service account key file exists
- Ensure Translation API is enabled in Google Cloud Console
- Verify service account has Translation API permissions

### Issue 2: "Gemini API Error"

**Solution:**

- Verify GEMINI_SECRET_KEY is set correctly
- Check API key has sufficient quota
- Ensure Gemini API is enabled

### Issue 3: "Module not found: mammoth/pdf-parse/xlsx"

**Solution:**

```bash
npm install mammoth pdf-parse xlsx
```

### Issue 4: "Cannot find module '@google-cloud/translate'"

**Solution:**

```bash
npm install @google-cloud/translate
```

### Issue 5: File upload fails

**Solution:**

- Ensure uploads/translations/ directory exists
- Check file permissions on the directory
- Verify file size is under 10MB

### Issue 6: "Conversation not found"

**Solution:**

- Check that conversation service is working
- Verify MongoDB connection
- Ensure conversation ID is valid

## 📊 Quick Health Check

Run this command to verify everything is working:

```bash
# Health check script
curl -X GET http://localhost:5000/api/v1/translation/languages && \
curl -X POST http://localhost:5000/api/v1/translation/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Test", "targetLanguage": "es"}' && \
echo "\n✅ Translation module is working!"
```

## 📚 Documentation Reference

- **Full Documentation:** `src/app/modules/translation/README.md`
- **Quick Start:** `src/app/modules/translation/QUICKSTART.md`
- **Implementation Summary:** `src/app/modules/translation/IMPLEMENTATION_SUMMARY.md`
- **Module Structure:** `src/app/modules/translation/MODULE_STRUCTURE.md`

## 🎯 Next Steps After Setup

1. **Test all endpoints** using Postman collection
2. **Review logs** in console for any warnings
3. **Test file uploads** with different formats
4. **Try multi-turn conversations** to verify context handling
5. **Test with different languages** to verify coverage
6. **Check subscription limits** work correctly
7. **Test error scenarios** to verify error handling

## 📞 Support

If you encounter any issues:

1. Check the logs in the console
2. Review the documentation files
3. Verify all environment variables are set
4. Ensure all dependencies are installed
5. Check Google Cloud Translation API quota
6. Verify Gemini API is working

## ✨ Ready for Production

Once all items are checked:

- [ ] All dependencies installed
- [ ] All environment variables configured
- [ ] All tests passing
- [ ] File uploads working
- [ ] Conversations working
- [ ] Error handling verified
- [ ] Documentation reviewed

**Status:** ⏳ Awaiting setup completion

---

**Created:** December 11, 2025
**Module Version:** 1.0.0
