# Knowledge Bank API Documentation

## Overview

The Knowledge Bank is a file management system that allows users to upload, store, retrieve, and process their files. It's **separate from the knowledgebot** functionality. Files are stored in Google Cloud Storage (GCS) and metadata is saved in MongoDB. Files can be processed using the RAG (Retrieval-Augmented Generation) system for semantic search and AI-powered interactions.

### Key Features
- ✅ Upload files to GCS bucket
- ✅ Store file metadata in database
- ✅ Retrieve user's files with filtering
- ✅ Delete files (soft delete)
- ✅ Process files with RAG system
- ✅ Track storage statistics
- ✅ Authentication required for all operations

### Differences: Knowledge Bank vs Knowledgebot
- **Knowledge Bank**: General user file storage system, files belong to the user
- **Knowledgebot**: Bot-specific knowledge base, files belong to a specific bot/knowledge base

---

## Base URL
```
/api/v1/knowledge-bank
```

---

## Authentication
All endpoints require authentication. Include the JWT token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

---

## Endpoints

### 1. Upload File

**POST** `/upload`

Upload a file to the knowledge bank. Files are stored in GCS and metadata is saved to the database.

#### Request
- **Content-Type**: `multipart/form-data`
- **Body Parameters**:
  - `files` (file, required): The file to upload
  - `description` (string, optional): File description
  - `tags` (JSON array string, optional): Tags for the file, e.g., `["important", "work"]`
  - `processImmediately` (boolean string, optional): Set to `"true"` to process file immediately
  - `uploadSource` (string, optional): Source of upload (default: "web")
  - `metadata` (JSON object string, optional): Additional metadata

#### Example Request (cURL)
```bash
curl -X POST http://localhost:5000/api/v1/knowledge-bank/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "files=@/path/to/document.pdf" \
  -F "description=Important project document" \
  -F "tags=[\"project\", \"important\"]" \
  -F "processImmediately=true"
```

#### Example Request (JavaScript/Fetch)
```javascript
const formData = new FormData();
formData.append('files', fileInput.files[0]);
formData.append('description', 'Important project document');
formData.append('tags', JSON.stringify(['project', 'important']));
formData.append('processImmediately', 'true');

const response = await fetch('/api/v1/knowledge-bank/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const result = await response.json();
```

#### Response
```json
{
  "statusCode": 200,
  "success": true,
  "message": "File uploaded successfully",
  "data": {
    "success": true,
    "fileId": "674a1b2c3d4e5f6g7h8i9j0k",
    "fileName": "document.pdf",
    "fileType": "pdf",
    "fileSize": 1048576,
    "formattedFileSize": "1 MB",
    "gcsUrl": "https://storage.googleapis.com/alti_knowledge_bank_files/users/USER_ID/1699876543210_document.pdf",
    "uploadedAt": "2024-11-05T10:30:00.000Z",
    "processingStatus": "pending"
  }
}
```

---

### 2. Get User Files

**GET** `/files`

Retrieve all files uploaded by the authenticated user with optional filtering.

#### Query Parameters
- `fileType` (string, optional): Filter by file type (e.g., "pdf", "docx")
- `processingStatus` (string, optional): Filter by status ("pending", "processing", "completed", "failed")
- `isProcessed` (boolean, optional): Filter by processing status (true/false)
- `limit` (number, optional): Number of results (default: 100)
- `skip` (number, optional): Number to skip for pagination (default: 0)

#### Example Request
```bash
curl -X GET "http://localhost:5000/api/v1/knowledge-bank/files?fileType=pdf&isProcessed=true&limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Response
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Files retrieved successfully",
  "data": {
    "files": [
      {
        "id": "674a1b2c3d4e5f6g7h8i9j0k",
        "fileName": "document.pdf",
        "fileType": "pdf",
        "fileSize": 1048576,
        "formattedFileSize": "1 MB",
        "gcsUrl": "https://storage.googleapis.com/alti_knowledge_bank_files/users/USER_ID/1699876543210_document.pdf",
        "documentId": "doc_abc123xyz",
        "title": "Important Project Document",
        "description": "Important project document",
        "tags": ["project", "important"],
        "chunkCount": 15,
        "isProcessed": true,
        "processingStatus": "completed",
        "processingError": null,
        "processedAt": "2024-11-05T10:35:00.000Z",
        "createdAt": "2024-11-05T10:30:00.000Z",
        "updatedAt": "2024-11-05T10:35:00.000Z"
      }
    ],
    "totalCount": 1,
    "filters": {
      "fileType": "pdf",
      "processingStatus": null,
      "isProcessed": true
    }
  }
}
```

---

### 3. Get File by ID

**GET** `/files/:fileId`

Retrieve details of a specific file by its ID.

#### Path Parameters
- `fileId` (string, required): The file's unique identifier

#### Example Request
```bash
curl -X GET http://localhost:5000/api/v1/knowledge-bank/files/674a1b2c3d4e5f6g7h8i9j0k \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Response
```json
{
  "statusCode": 200,
  "success": true,
  "message": "File retrieved successfully",
  "data": {
    "id": "674a1b2c3d4e5f6g7h8i9j0k",
    "fileName": "document.pdf",
    "fileType": "pdf",
    "fileSize": 1048576,
    "formattedFileSize": "1 MB",
    "gcsUrl": "https://storage.googleapis.com/alti_knowledge_bank_files/users/USER_ID/1699876543210_document.pdf",
    "gcsPath": "users/USER_ID/1699876543210_document.pdf",
    "documentId": "doc_abc123xyz",
    "title": "Important Project Document",
    "description": "Important project document",
    "tags": ["project", "important"],
    "chunkCount": 15,
    "isProcessed": true,
    "processingStatus": "completed",
    "processingError": null,
    "processedAt": "2024-11-05T10:35:00.000Z",
    "metadata": {},
    "createdAt": "2024-11-05T10:30:00.000Z",
    "updatedAt": "2024-11-05T10:35:00.000Z"
  }
}
```

---

### 4. Delete File

**DELETE** `/files/:fileId`

Delete a file from the knowledge bank (soft delete - file is marked as inactive).

#### Path Parameters
- `fileId` (string, required): The file's unique identifier

#### Example Request
```bash
curl -X DELETE http://localhost:5000/api/v1/knowledge-bank/files/674a1b2c3d4e5f6g7h8i9j0k \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Response
```json
{
  "statusCode": 200,
  "success": true,
  "message": "File deleted successfully"
}
```

#### Error Response (File Not Found)
```json
{
  "statusCode": 404,
  "success": false,
  "message": "File not found or could not be deleted"
}
```

---

### 5. Process File

**POST** `/files/:fileId/process`

Process a file by adding it to the RAG system for semantic search and AI interactions.

#### Path Parameters
- `fileId` (string, required): The file's unique identifier

#### Example Request
```bash
curl -X POST http://localhost:5000/api/v1/knowledge-bank/files/674a1b2c3d4e5f6g7h8i9j0k/process \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Response
```json
{
  "statusCode": 200,
  "success": true,
  "message": "File processed successfully",
  "data": {
    "success": true,
    "fileId": "674a1b2c3d4e5f6g7h8i9j0k",
    "documentId": "doc_abc123xyz",
    "title": "Important Project Document",
    "chunkCount": 15,
    "processingStatus": "completed",
    "processedAt": "2024-11-05T10:35:00.000Z"
  }
}
```

#### Error Response (Already Processed)
```json
{
  "statusCode": 400,
  "success": false,
  "message": "File has already been processed",
  "data": {
    "documentId": "doc_abc123xyz",
    "processedAt": "2024-11-05T10:35:00.000Z"
  }
}
```

---

### 6. Get Storage Statistics

**GET** `/stats`

Get the authenticated user's storage statistics.

#### Example Request
```bash
curl -X GET http://localhost:5000/api/v1/knowledge-bank/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Response
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Storage statistics retrieved successfully",
  "data": {
    "totalFiles": 25,
    "processedFiles": 20,
    "pendingFiles": 5,
    "totalStorage": 52428800,
    "formattedStorage": "50 MB"
  }
}
```

---

## File Type Support

The Knowledge Bank supports various file types:

### Documents
- PDF (`.pdf`)
- Microsoft Word (`.doc`, `.docx`)
- Plain Text (`.txt`)
- Markdown (`.md`)

### Data Files
- CSV (`.csv`)
- JSON (`.json`)
- XML (`.xml`)

### Web Files
- HTML (`.html`)

### Spreadsheets & Presentations
- Microsoft Excel (`.xls`, `.xlsx`)
- Microsoft PowerPoint (`.ppt`, `.pptx`)

---

## Processing Status

Files can have the following processing statuses:

- **pending**: File uploaded but not yet processed
- **processing**: File is currently being processed by RAG system
- **completed**: File successfully processed and ready for use
- **failed**: Processing failed (check `processingError` field)

---

## Error Codes

| Status Code | Description |
|------------|-------------|
| 200 | Success |
| 400 | Bad Request (invalid input) |
| 401 | Unauthorized (invalid or missing token) |
| 404 | Not Found (file doesn't exist or doesn't belong to user) |
| 500 | Internal Server Error |

---

## Best Practices

1. **File Size**: Keep files under 50MB for optimal performance
2. **Processing**: Use `processImmediately=true` for files you want to query immediately
3. **Tagging**: Use descriptive tags to organize your files
4. **Error Handling**: Always check the `success` field in responses
5. **Pagination**: Use `limit` and `skip` for large file collections

---

## Configuration

### Environment Variables

Add these to your `.env` file:

```env
# GCS Configuration
GCS_KNOWLEDGE_BANK_BUCKET=alti_knowledge_bank_files
GCS_KNOWLEDGEBOT_BUCKET=alti_assistant_knowledge_bot_files
```

### GCS Bucket Setup

1. Create a bucket named `alti_knowledge_bank_files` in Google Cloud Storage
2. Set appropriate IAM permissions
3. Ensure the service account has write access

---

## Database Schema

### KnowledgeBankFile Model

```javascript
{
  fileName: String,           // Stored filename (with timestamp)
  originalName: String,       // Original filename
  fileType: String,          // File extension (lowercase)
  fileSize: Number,          // Size in bytes
  gcsUrl: String,            // Public GCS URL
  gcsPath: String,           // Path in GCS bucket
  gcsBucket: String,         // Bucket name
  userId: ObjectId,          // Reference to User
  documentId: String,        // RAG system document ID
  title: String,             // Extracted or given title
  description: String,       // User-provided description
  tags: [String],            // File tags
  chunkCount: Number,        // Number of chunks in RAG
  isProcessed: Boolean,      // Processing status flag
  processingStatus: String,  // Status enum
  processingError: String,   // Error message if failed
  processedAt: Date,         // Processing timestamp
  isActive: Boolean,         // Soft delete flag
  metadata: Mixed,           // Additional metadata
  uploadSource: String,      // Upload source
  ipAddress: String,         // Uploader IP
  createdAt: Date,          // Creation timestamp
  updatedAt: Date           // Update timestamp
}
```

---

## Examples

### Complete Upload and Process Workflow

```javascript
// 1. Upload file
const uploadFormData = new FormData();
uploadFormData.append('files', file);
uploadFormData.append('description', 'My important document');
uploadFormData.append('tags', JSON.stringify(['work', 'project']));

const uploadResponse = await fetch('/api/v1/knowledge-bank/upload', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: uploadFormData
});

const { data: uploadData } = await uploadResponse.json();
const fileId = uploadData.fileId;

// 2. Process file
const processResponse = await fetch(`/api/v1/knowledge-bank/files/${fileId}/process`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});

const { data: processData } = await processResponse.json();
console.log('Document ID:', processData.documentId);

// 3. Get file details
const fileResponse = await fetch(`/api/v1/knowledge-bank/files/${fileId}`, {
  headers: { 'Authorization': `Bearer ${token}` }
});

const { data: fileData } = await fileResponse.json();
console.log('File details:', fileData);
```

---

## Support

For issues or questions, please contact the development team or check the main README.md file.
