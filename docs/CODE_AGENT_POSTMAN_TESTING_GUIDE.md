# Code Agent Postman Testing Guide

This guide documents the current Code Agent endpoints and exact payloads for Postman testing.

## Base URLs

Use one of these depending on your setup:

- Gateway (recommended for client-like testing): `http://localhost:5000/api/v1/code`
- Agent service direct (internal): `http://localhost:8081/api/v1/code`

If your ports differ, replace `5000` and `8081` accordingly.

## Authentication and Required Headers

### 1) Through Gateway (`/api/v1/code/...`)

Use your normal API auth:

- `Authorization: Bearer <your_jwt>` (if your environment requires auth)
- `Content-Type: application/json`

### 2) Direct to Agent Service (`:8081/api/v1/code/...`)

The agent uses internal auth middleware. You must send:

- `X-Service-Secret: <INTERNAL_SERVICE_SECRET>`
- `X-User-Context: <base64_json_user_context>`
- `Content-Type: application/json`

`X-User-Context` JSON shape before base64 encoding:

```json
{
  "userId": "test-user-123",
  "email": "tester@inso.ai",
  "plan": "pro",
  "tenantId": "tenant-001"
}
```

Generate Base64 quickly:

```bash
echo -n '{"userId":"test-user-123","email":"tester@inso.ai","plan":"pro","tenantId":"tenant-001"}' | base64
```

## Endpoints

## 1) POST `/execute`

Purpose: Generate code, debug code, or architecture output through one endpoint.

Request body:

```json
{
  "prompt": "Build an Express.js CRUD API for tasks with validation and error handling.",
  "language": "javascript",
  "intent": "generate",
  "options": {
    "qualityProfile": "strict",
    "temperature": 0.08,
    "maxTokens": 9000
  }
}
```

Allowed `intent` values:

- `generate` (default)
- `debug`
- `architect`

Allowed `options.qualityProfile` values:

- `balanced`
- `strict`
- `creative`

### Debug example

```json
{
  "prompt": "function sum(a,b){ return a-b }",
  "intent": "debug",
  "error": "Expected 5 but got -1 for sum(2,3)",
  "options": {
    "qualityProfile": "strict"
  }
}
```

Success response (shape):

```json
{
  "success": true,
  "data": {
    "intent": "generate",
    "code": "...",
    "language": "javascript",
    "explanation": "...",
    "tests": "...",
    "runInstructions": ["npm install", "npm test"],
    "dependencies": ["express", "zod"],
    "edgeCases": ["empty payload", "duplicate ID"],
    "complexity": {
      "time": "O(n)",
      "space": "O(1)"
    },
    "assumptions": ["Node.js >= 20"],
    "model": "gemini-3.1-pro",
    "metadata": {
      "tokensUsed": 0,
      "inputTokens": 0,
      "outputTokens": 0,
      "qualityProfile": "strict"
    }
  }
}
```

## 2) POST `/review`

Purpose: Structured code review with score, severity issues, and priority fixes.

Request body:

```json
{
  "code": "const token = req.headers.authorization; if(token){ doSomething(); }"
}
```

Success response (shape):

```json
{
  "success": true,
  "data": {
    "intent": "review",
    "review": "...",
    "positives": ["..."],
    "issues": [
      {
        "severity": "high",
        "description": "...",
        "line": 1
      }
    ],
    "suggestions": ["..."],
    "securityFlags": ["..."],
    "priorityFixes": ["..."],
    "score": 7
  }
}
```

## 3) POST `/explain`

Purpose: Explain code with conceptual model and line mapping.

Request body:

```json
{
  "code": "async function fetchData(){ const res = await fetch(url); return res.json(); }"
}
```

Success response (shape):

```json
{
  "success": true,
  "data": {
    "intent": "explain",
    "explanation": "...",
    "mentalModel": "...",
    "lineByLine": [{ "lines": "1-2", "description": "..." }],
    "complexity": "...",
    "keyConcepts": ["async/await"],
    "pitfalls": ["Unhandled rejection"]
  }
}
```

## 4) POST `/architect`

Purpose: High-level architecture and implementation plan without full code.

Request body:

```json
{
  "prompt": "Design a multi-tenant notification service with retry queues and webhook delivery.",
  "options": {
    "qualityProfile": "strict"
  }
}
```

Success response (shape):

```json
{
  "success": true,
  "data": {
    "intent": "architect",
    "explanation": "...",
    "model": "gemini-3.1-pro",
    "metadata": {
      "qualityProfile": "strict"
    }
  }
}
```

## 5) GET `/health`

Purpose: Agent-level health status.

Sample response:

```json
{
  "success": true,
  "agent": "code",
  "status": "operational",
  "timestamp": "2026-07-22T00:00:00.000Z"
}
```

## 6) Agent root health/readiness endpoints

If calling the service root directly:

- `GET http://localhost:8081/health`
- `GET http://localhost:8081/liveness`
- `GET http://localhost:8081/readiness`

## Common Error Cases

- `400`: missing required fields (`prompt` or `code`)
- `401`: missing/invalid `X-User-Context` on direct agent calls
- `403`: invalid `X-Service-Secret` on direct agent calls
- `500`: model/provider execution issues

## Quick Postman Collection Structure

Create a collection with folder `Code Agent` and requests:

1. `POST {{code_base}}/execute`
2. `POST {{code_base}}/execute (debug)`
3. `POST {{code_base}}/review`
4. `POST {{code_base}}/explain`
5. `POST {{code_base}}/architect`
6. `GET {{code_base}}/health`

Suggested variables:

- `code_base = http://localhost:5000/api/v1/code` (gateway)
- `internal_code_base = http://localhost:8081/api/v1/code` (direct)
- `internal_service_secret = <your secret>`
- `internal_user_context = <base64>`
