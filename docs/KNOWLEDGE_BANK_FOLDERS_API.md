# Knowledge Bank Folders - API Documentation

## Overview

The Knowledge Bank now supports **folders** for organizing files. Users can create nested folders, upload files into folders, and manage folder hierarchies.

---

## Folder Features

✅ **Create Folders** - Organize files hierarchically  
✅ **Nested Folders** - Support for parent/child folder structure  
✅ **Upload Files to Folders** - Files can be placed in specific folders  
✅ **Folder Statistics** - Track file count, size, and subfolder count  
✅ **Folder Metadata** - Add description, color, icon, and tags  
✅ **Breadcrumb Navigation** - Automatic path generation and ancestor tracking  
✅ **Recursive Delete** - Option to delete folder with all contents  

---

## Folder API Endpoints

### Base URL: `/api/v1/knowledge-bank`

---

## 1. Create Folder

**POST** `/folders`

Create a new folder in the knowledge bank. Can be a root folder or nested within another folder.

### Request Body
```json
{
  "name": "Project Documents",
  "parentFolderId": null,
  "description": "All project-related documents",
  "color": "#1890ff",
  "icon": "folder",
  "tags": ["work", "important"]
}
```

### Parameters
- `name` (string, required): Folder name (max 100 characters)
- `parentFolderId` (string, optional): Parent folder ID (null for root folder)
- `description` (string, optional): Folder description (max 500 characters)
- `color` (string, optional): Hex color code (default: "#1890ff")
- `icon` (string, optional): Icon name (default: "folder")
- `tags` (array, optional): Array of tag strings

### Example Request
```bash
curl -X POST http://localhost:5000/api/v1/knowledge-bank/folders \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Work Documents",
    "description": "Professional documents",
    "color": "#52c41a"
  }'
```

### Response
```json
{
  "statusCode": 201,
  "success": true,
  "message": "Folder created successfully",
  "data": {
    "id": "674b1c2d3e4f5g6h7i8j9k0l",
    "name": "Work Documents",
    "parentFolderId": null,
    "path": "/Work Documents",
    "description": "Professional documents",
    "color": "#52c41a",
    "icon": "folder",
    "tags": [],
    "fileCount": 0,
    "subfolderCount": 0,
    "totalSize": 0,
    "formattedTotalSize": "0 Bytes",
    "depth": 1,
    "createdAt": "2024-11-05T12:00:00.000Z",
    "updatedAt": "2024-11-05T12:00:00.000Z"
  }
}
```

---

## 2. Get User's Folders

**GET** `/folders`

Retrieve folders with optional filtering by parent folder.

### Query Parameters
- `parentFolderId` (string, optional): Filter by parent folder
  - Omit to get all folders
  - Use `"root"` to get only root-level folders
  - Use folder ID to get subfolders

### Example Requests

**Get all folders:**
```bash
curl -X GET http://localhost:5000/api/v1/knowledge-bank/folders \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Get root folders only:**
```bash
curl -X GET "http://localhost:5000/api/v1/knowledge-bank/folders?parentFolderId=root" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Get subfolders of a specific folder:**
```bash
curl -X GET "http://localhost:5000/api/v1/knowledge-bank/folders?parentFolderId=674b1c2d3e4f5g6h7i8j9k0l" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Response
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Folders retrieved successfully",
  "data": {
    "folders": [
      {
        "id": "674b1c2d3e4f5g6h7i8j9k0l",
        "name": "Work Documents",
        "parentFolderId": null,
        "path": "/Work Documents",
        "description": "Professional documents",
        "color": "#52c41a",
        "icon": "folder",
        "tags": ["work"],
        "fileCount": 5,
        "subfolderCount": 2,
        "totalSize": 5242880,
        "formattedTotalSize": "5 MB",
        "depth": 1,
        "createdAt": "2024-11-05T12:00:00.000Z",
        "updatedAt": "2024-11-05T12:05:00.000Z"
      }
    ],
    "totalCount": 1
  }
}
```

---

## 3. Get Folder by ID

**GET** `/folders/:folderId`

Get detailed folder information including ancestors and breadcrumb trail.

### Path Parameters
- `folderId` (string, required): Folder ID

### Example Request
```bash
curl -X GET http://localhost:5000/api/v1/knowledge-bank/folders/674b1c2d3e4f5g6h7i8j9k0l \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Response
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Folder retrieved successfully",
  "data": {
    "id": "674b1c2d3e4f5g6h7i8j9k0l",
    "name": "Current Project",
    "parentFolderId": "674b1c2d3e4f5g6h7i8j9k0k",
    "path": "/Work Documents/Projects/Current Project",
    "description": "Active project files",
    "color": "#ff4d4f",
    "icon": "folder",
    "tags": ["active", "2024"],
    "fileCount": 10,
    "subfolderCount": 0,
    "totalSize": 10485760,
    "formattedTotalSize": "10 MB",
    "depth": 3,
    "breadcrumb": [
      { "id": "674b1c2d3e4f5g6h7i8j9k0a", "name": "Work Documents" },
      { "id": "674b1c2d3e4f5g6h7i8j9k0k", "name": "Projects" },
      { "id": "674b1c2d3e4f5g6h7i8j9k0l", "name": "Current Project" }
    ],
    "ancestors": [
      {
        "id": "674b1c2d3e4f5g6h7i8j9k0a",
        "name": "Work Documents",
        "path": "/Work Documents"
      },
      {
        "id": "674b1c2d3e4f5g6h7i8j9k0k",
        "name": "Projects",
        "path": "/Work Documents/Projects"
      }
    ],
    "createdAt": "2024-11-05T12:00:00.000Z",
    "updatedAt": "2024-11-05T12:30:00.000Z"
  }
}
```

---

## 4. Update Folder

**PUT** `/folders/:folderId`

Update folder properties.

### Path Parameters
- `folderId` (string, required): Folder ID

### Request Body
```json
{
  "name": "Updated Folder Name",
  "description": "New description",
  "color": "#722ed1",
  "icon": "folder-open",
  "tags": ["updated", "important"]
}
```

### Example Request
```bash
curl -X PUT http://localhost:5000/api/v1/knowledge-bank/folders/674b1c2d3e4f5g6h7i8j9k0l \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Archived Projects",
    "color": "#8c8c8c"
  }'
```

### Response
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Folder updated successfully",
  "data": {
    "id": "674b1c2d3e4f5g6h7i8j9k0l",
    "name": "Archived Projects",
    "parentFolderId": "674b1c2d3e4f5g6h7i8j9k0k",
    "path": "/Work Documents/Archived Projects",
    "description": "Active project files",
    "color": "#8c8c8c",
    "icon": "folder",
    "tags": ["active", "2024"],
    "fileCount": 10,
    "subfolderCount": 0,
    "totalSize": 10485760,
    "formattedTotalSize": "10 MB",
    "updatedAt": "2024-11-05T13:00:00.000Z"
  }
}
```

---

## 5. Delete Folder

**DELETE** `/folders/:folderId`

Delete a folder (soft delete). Use `?recursive=true` to delete all contents.

### Path Parameters
- `folderId` (string, required): Folder ID

### Query Parameters
- `recursive` (boolean, optional): If `true`, deletes all subfolders and files

### Example Requests

**Delete empty folder:**
```bash
curl -X DELETE http://localhost:5000/api/v1/knowledge-bank/folders/674b1c2d3e4f5g6h7i8j9k0l \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Delete folder with all contents:**
```bash
curl -X DELETE "http://localhost:5000/api/v1/knowledge-bank/folders/674b1c2d3e4f5g6h7i8j9k0l?recursive=true" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Response (Success)
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Folder deleted successfully"
}
```

### Response (Error - Not Empty)
```json
{
  "statusCode": 500,
  "success": false,
  "message": "Folder is not empty. Use recursive delete to remove all contents."
}
```

---

## 6. Get Folder Contents

**GET** `/folders/:folderId/contents`

Get all files and subfolders in a folder.

### Path Parameters
- `folderId` (string, required): Folder ID (use `"root"` for root level)

### Example Requests

**Get root contents:**
```bash
curl -X GET http://localhost:5000/api/v1/knowledge-bank/folders/root/contents \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Get specific folder contents:**
```bash
curl -X GET http://localhost:5000/api/v1/knowledge-bank/folders/674b1c2d3e4f5g6h7i8j9k0l/contents \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Response
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Folder contents retrieved successfully",
  "data": {
    "folder": {
      "id": "674b1c2d3e4f5g6h7i8j9k0l",
      "name": "Work Documents",
      "path": "/Work Documents",
      "breadcrumb": [
        { "id": "674b1c2d3e4f5g6h7i8j9k0l", "name": "Work Documents" }
      ]
    },
    "subfolders": [
      {
        "id": "674b1c2d3e4f5g6h7i8j9k0m",
        "name": "Projects",
        "path": "/Work Documents/Projects",
        "color": "#1890ff",
        "icon": "folder",
        "fileCount": 5,
        "subfolderCount": 2,
        "totalSize": 2097152,
        "formattedTotalSize": "2 MB",
        "createdAt": "2024-11-05T12:05:00.000Z",
        "updatedAt": "2024-11-05T12:30:00.000Z"
      }
    ],
    "files": [
      {
        "id": "674a1b2c3d4e5f6g7h8i9j0k",
        "fileName": "report.pdf",
        "fileType": "pdf",
        "fileSize": 1048576,
        "formattedFileSize": "1 MB",
        "gcsUrl": "https://storage.googleapis.com/...",
        "documentId": "doc_xyz123",
        "title": "Annual Report",
        "isProcessed": true,
        "processingStatus": "completed",
        "createdAt": "2024-11-05T12:10:00.000Z",
        "updatedAt": "2024-11-05T12:15:00.000Z"
      }
    ]
  }
}
```

---

## 7. Upload File to Folder

**POST** `/upload`

Upload a file to a specific folder by including `folderId` in the request body.

### Request Body (multipart/form-data)
- `files` (file, required): The file to upload
- `folderId` (string, optional): Target folder ID (omit for root)
- `description` (string, optional): File description
- `tags` (JSON array string, optional): File tags
- `processImmediately` (boolean string, optional): Process with RAG

### Example Request
```bash
curl -X POST http://localhost:5000/api/v1/knowledge-bank/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "files=@document.pdf" \
  -F "folderId=674b1c2d3e4f5g6h7i8j9k0l" \
  -F "description=Project documentation" \
  -F "tags=[\"project\", \"important\"]"
```

### Response
```json
{
  "statusCode": 200,
  "success": true,
  "message": "File uploaded successfully",
  "data": {
    "success": true,
    "fileId": "674c1d2e3f4g5h6i7j8k9l0m",
    "fileName": "document.pdf",
    "fileType": "pdf",
    "fileSize": 1048576,
    "formattedFileSize": "1 MB",
    "gcsUrl": "https://storage.googleapis.com/...",
    "folderId": "674b1c2d3e4f5g6h7i8j9k0l",
    "uploadedAt": "2024-11-05T13:00:00.000Z",
    "processingStatus": "pending"
  }
}
```

---

## 8. Get Files in Folder

**GET** `/files?folderId=:folderId`

Get all files in a specific folder.

### Query Parameters
- `folderId` (string, optional): Folder ID (use `"null"` for root files)
- Other filters: `fileType`, `processingStatus`, `isProcessed`, `limit`, `skip`

### Example Requests

**Get files in root (no folder):**
```bash
curl -X GET "http://localhost:5000/api/v1/knowledge-bank/files?folderId=null" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Get files in specific folder:**
```bash
curl -X GET "http://localhost:5000/api/v1/knowledge-bank/files?folderId=674b1c2d3e4f5g6h7i8j9k0l" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Response
```json
{
  "statusCode": 200,
  "success": true,
  "message": "Files retrieved successfully",
  "data": {
    "files": [
      {
        "id": "674c1d2e3f4g5h6i7j8k9l0m",
        "fileName": "document.pdf",
        "fileType": "pdf",
        "fileSize": 1048576,
        "formattedFileSize": "1 MB",
        "gcsUrl": "https://storage.googleapis.com/...",
        "documentId": "doc_xyz123",
        "title": "Document Title",
        "description": "Project documentation",
        "tags": ["project", "important"],
        "chunkCount": 15,
        "isProcessed": true,
        "processingStatus": "completed",
        "createdAt": "2024-11-05T13:00:00.000Z",
        "updatedAt": "2024-11-05T13:05:00.000Z"
      }
    ],
    "totalCount": 1,
    "filters": {
      "folderId": "674b1c2d3e4f5g6h7i8j9k0l"
    }
  }
}
```

---

## Folder Hierarchy Example

```
Knowledge Bank (Root)
├── Work Documents (folder)
│   ├── Projects (folder)
│   │   ├── Project A (folder)
│   │   │   ├── requirements.pdf (file)
│   │   │   └── design.docx (file)
│   │   └── Project B (folder)
│   │       └── proposal.pdf (file)
│   └── Reports (folder)
│       └── annual-report.pdf (file)
├── Personal (folder)
│   └── notes.txt (file)
└── root-file.pdf (file - no folder)
```

---

## Folder Statistics

Folder statistics are automatically updated when:
- Files are uploaded to the folder
- Files are deleted from the folder
- Subfolders are created
- Subfolders are deleted

Statistics include:
- `fileCount`: Number of files in folder (direct children only)
- `subfolderCount`: Number of immediate subfolders
- `totalSize`: Total size of all files in folder and subfolders

---

## Best Practices

1. **Naming**: Use descriptive folder names
2. **Organization**: Create a logical hierarchy (3-5 levels max)
3. **Root Files**: Keep root level clean, use folders for organization
4. **Tags**: Use tags for cross-folder categorization
5. **Colors**: Use color coding for visual organization
6. **Deletion**: Use caution with `recursive=true` - it's permanent

---

## Error Codes

| Status Code | Description |
|------------|-------------|
| 201 | Folder created successfully |
| 200 | Success |
| 400 | Bad Request (invalid input, duplicate name) |
| 401 | Unauthorized (missing/invalid token) |
| 404 | Not Found (folder doesn't exist or doesn't belong to user) |
| 500 | Internal Server Error |

---

## Common Error Messages

- **"Folder name is required"** - Missing folder name
- **"A folder with this name already exists in this location"** - Duplicate folder name in same parent
- **"Parent folder not found or does not belong to user"** - Invalid parentFolderId
- **"Folder is not empty. Use recursive delete to remove all contents."** - Attempting to delete non-empty folder without recursive flag
- **"Folder not found or does not belong to user"** - Invalid folderId or permission issue

---

## JavaScript Examples

### Create Nested Folder Structure

```javascript
// Create root folder
const workDocsResponse = await fetch('/api/v1/knowledge-bank/folders', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Work Documents',
    color: '#52c41a'
  })
});

const { data: workDocsFolder } = await workDocsResponse.json();

// Create subfolder
const projectsResponse = await fetch('/api/v1/knowledge-bank/folders', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Projects',
    parentFolderId: workDocsFolder.id,
    color: '#1890ff'
  })
});

const { data: projectsFolder } = await projectsResponse.json();

// Upload file to folder
const formData = new FormData();
formData.append('files', fileInput.files[0]);
formData.append('folderId', projectsFolder.id);

await fetch('/api/v1/knowledge-bank/upload', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});
```

### Navigate Folder Structure

```javascript
// Get root folders
const rootResponse = await fetch(
  '/api/v1/knowledge-bank/folders?parentFolderId=root',
  { headers: { 'Authorization': `Bearer ${token}` } }
);

// Get folder contents
const contentsResponse = await fetch(
  `/api/v1/knowledge-bank/folders/${folderId}/contents`,
  { headers: { 'Authorization': `Bearer ${token}` } }
);

const { data } = await contentsResponse.json();
console.log('Subfolders:', data.subfolders);
console.log('Files:', data.files);
```

---

For complete API documentation, see [KNOWLEDGE_BANK_API.md](./KNOWLEDGE_BANK_API.md)
