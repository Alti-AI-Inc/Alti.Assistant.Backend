# Review Agent Postman Testing Guide

This document covers endpoints, required request body data, headers, and example payloads for the new Review Agent.

## Base URLs

Use one of the following depending on your setup:

- Gateway route: `http://localhost:5000/api/v1/review`
- Direct agent route: `http://localhost:8088/api/v1/review`

## Required Headers

### Gateway mode

- `Content-Type: application/json`
- `Authorization: Bearer <your_jwt>` (if your environment requires auth)

### Direct agent mode

- `Content-Type: application/json`
- `X-Service-Secret: <INTERNAL_SERVICE_SECRET>`
- `X-User-Context: <base64_encoded_json>`

Example raw JSON before Base64 for `X-User-Context`:

```json
{
  "userId": "test-user-123",
  "email": "qa@alti.ai",
  "plan": "pro",
  "tenantId": "tenant-001"
}
```

## Endpoints

## 1) POST /execute

Purpose: Run a structured expert review over content (code/doc/architecture/security/etc).

### Request body

Required fields:

- `content` (string)

Optional fields:

- `reviewType` (string): `code | document | architecture | security | performance | api | product | general`
- `context` (string): extra background/context
- `rubric` (string[]): custom criteria list
- `options` (object)

Optional `options` fields:

- `qualityProfile` (string): `balanced | strict | concise`
- `temperature` (number)
- `maxTokens` (number)

### Example

```json
{
  "content": "This API endpoint builds SQL using string concatenation from req.query.userId.",
  "reviewType": "security",
  "context": "Node.js Express API in production handling PII",
  "rubric": ["OWASP alignment", "Data privacy risks", "Actionable fixes"],
  "options": {
    "qualityProfile": "strict",
    "temperature": 0.03,
    "maxTokens": 9000
  }
}
```

### Response shape

```json
{
  "success": true,
  "data": {
    "reviewType": "security",
    "overallSummary": "...",
    "score": 6,
    "findings": [
      {
        "severity": "high",
        "category": "security",
        "title": "SQL Injection Risk",
        "impact": "...",
        "evidence": "...",
        "recommendation": "Use parameterized queries"
      }
    ],
    "strengths": ["..."],
    "quickWins": ["..."],
    "assumptions": ["..."],
    "model": "gemini-3.1-pro",
    "metadata": {
      "reviewer": "agent-review",
      "qualityProfile": "strict"
    }
  }
}
```

## 2) POST /compare

Purpose: Compare original vs revised version and identify improvements/regressions.

### Request body

Required fields:

- `original` (string)
- `revised` (string)

Optional fields:

- `reviewType` (string)
- `options` (object)

### Example

```json
{
  "original": "SELECT * FROM users WHERE id = " + "${userId}",
  "revised": "db.query('SELECT * FROM users WHERE id = $1', [userId])",
  "reviewType": "security",
  "options": {
    "qualityProfile": "balanced"
  }
}
```

### Response shape

```json
{
  "success": true,
  "data": {
    "reviewType": "security",
    "verdict": "improved",
    "summary": "...",
    "improvements": ["..."],
    "regressions": [],
    "remainingGaps": ["..."],
    "nextActions": ["..."]
  }
}
```

## 3) POST /checklist

Purpose: Validate content against a checklist and produce pass/fail coverage.

### Request body

Required fields:

- `content` (string)
- `checklist` (string[]) non-empty

Optional fields:

- `reviewType` (string)
- `options` (object)

### Example

```json
{
  "content": "API spec draft ...",
  "checklist": [
    "Includes auth requirements",
    "Documents all error codes",
    "Includes rate-limit behavior"
  ],
  "reviewType": "api",
  "options": {
    "qualityProfile": "concise"
  }
}
```

### Response shape

```json
{
  "success": true,
  "data": {
    "reviewType": "api",
    "passRate": "67%",
    "results": [
      {
        "item": "Includes auth requirements",
        "status": "pass",
        "notes": "...",
        "fix": ""
      }
    ],
    "criticalFailures": ["..."],
    "recommendedOrder": ["..."]
  }
}
```

## 4) GET /health

Purpose: Agent route-level health.

Request body: none.

## 5) Service health endpoints (direct service)

- `GET http://localhost:8088/health`
- `GET http://localhost:8088/liveness`
- `GET http://localhost:8088/readiness`

Request body: none.

## Common Error Responses

- `400` Missing required fields
- `401` Missing/invalid `X-User-Context` when direct-calling agent
- `403` Invalid `X-Service-Secret` when direct-calling agent
- `500` Provider/model runtime error
