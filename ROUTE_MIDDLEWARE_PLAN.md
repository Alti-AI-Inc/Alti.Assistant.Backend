# Route Middleware Plan

**Created:** February 24, 2026

This document maps every route file to its current middleware state and the enforcement changes needed for Task 4.

---

## Legend

| Symbol | Meaning                    |
| ------ | -------------------------- |
| ✅     | Already applied            |
| ➕     | Needs to be added          |
| —      | Not applicable / no change |

**Middleware shorthand:**

- `DRL` = `checkDailyRequestLimit`
- `RAG` = `checkRAGFeature`
- `STG` = `checkStorageLimit`

---

## Group 1 — Conversational AI (text-only, no file storage)

These routes handle chat/generation requests. They need `checkDailyRequestLimit` only.

| Route File                                   | Endpoint                             | Method | Current DRL | Change |
| -------------------------------------------- | ------------------------------------ | ------ | ----------- | ------ |
| `search/search.route.js`                     | `/assistant_v2`                      | POST   | ✅          | —      |
| `search/search.route.js`                     | `/code`                              | POST   | ✅          | —      |
| `search/search.route.js`                     | `/writing`                           | POST   | ✅          | —      |
| `search/search.route.js`                     | `/assistant` (native grounding test) | POST   | —           | —      |
| `search/search.route.js`                     | `/stream`                            | POST   | —           | —      |
| `translation/translation.route.js`           | `/assistant`                         | POST   | ✅          | —      |
| `translation/translation.route.js`           | `/translate`                         | POST   | —           | —      |
| `translation/translation.route.js`           | `/detect`                            | POST   | —           | —      |
| `brainstorm/brainstorm.route.js`             | `/assistant`                         | POST   | ✅          | —      |
| `creative_writing/creative_writing.route.js` | `/assistant`                         | POST   | ✅          | —      |
| `presentation/presentation.route.js`         | `/assistant`                         | POST   | ✅          | —      |
| `presentation/presentation.route.js`         | `/generate`                          | POST   | —           | —      |
| `plan_generator/plan_generator.route.js`     | `/assistant`                         | POST   | ✅          | —      |
| `plan_generator/plan_generator.route.js`     | `/assistant/async`                   | POST   | ✅          | —      |
| `report/report.route.js`                     | `/assistant`                         | POST   | ✅          | —      |
| `report/report.route.js`                     | `/generate`                          | POST   | —           | —      |
| `document_drafting/document.route.js`        | `/assistant`                         | POST   | ✅          | —      |
| `document_drafting/document.route.js`        | `/generate`                          | POST   | —           | —      |
| `image/image.route.js`                       | `/generate`                          | POST   | ✅          | —      |
| `image/image.route.js`                       | `/analyze`                           | POST   | ✅          | —      |
| `rewrite/rewrite.route.js`                   | `/assistant`                         | POST   | ✅          | —      |
| `code/code.route.js`                         | `/assistant`                         | POST   | —           | ➕ DRL |
| `writing/workflow.route.js`                  | `/assistant`                         | POST   | —           | ➕ DRL |
| `deep_research/deep_research.route.js`       | `/assistant`                         | POST   | —           | ➕ DRL |
| `summary/summary.route.js`                   | `/summarize`                         | POST   | —           | ➕ DRL |
| `workflow_automation → chat.routes.js`       | `/chat/create`                       | POST   | ✅          | —      |
| `workflow_automation → chat.routes.js`       | `/chat/confirm`                      | POST   | ✅          | —      |
| `workflow_automation → chat.routes.js`       | `/chat/continue`                     | POST   | ✅          | —      |

---

## Group 2 — File Upload + Document Analysis (need RAG + Storage checks)

These routes accept file uploads. They need `checkRAGFeature` (plan must have RAG access) and `checkStorageLimit` (tracks quota).

| Route File                                             | Endpoint     | Method | Current DRL | Add RAG | Add STG | Notes                                                                             |
| ------------------------------------------------------ | ------------ | ------ | ----------- | ------- | ------- | --------------------------------------------------------------------------------- |
| `article_writer/article_writer.route.js`               | `/assistant` | POST   | ✅          | ➕      | ➕      | `uploadArticleFile.single('file')` — optional file                                |
| `document_analysis/document_analysis.route.js`         | `/analyze`   | POST   | ✅          | ➕      | ➕      | `uploadDocumentAnalysis.single('file')`                                           |
| `document_review/document_review.route.js`             | `/assistant` | POST   | ✅          | ➕      | ➕      | `uploadDocumentReview.single('file')`                                             |
| `document_review/document_review.route.js`             | `/review`    | POST   | —           | ➕      | ➕      | `uploadDocumentReview.single('file')`                                             |
| `legal_contract/legal_contract.route.js`               | `/assistant` | POST   | ✅          | ➕      | ➕      | `uploadLegalContract.single('file')`                                              |
| `legal_contract_review/legal_contract_review.route.js` | `/assistant` | POST   | ✅          | ➕      | ➕      | `uploadLegalContractReview.single('file')`                                        |
| `legal_contract_review/legal_contract_review.route.js` | `/review`    | POST   | —           | ➕      | ➕      | `uploadLegalContractReview.single('file')`                                        |
| `rewrite/rewrite.route.js`                             | `/rewrite`   | POST   | —           | ➕      | ➕      | `uploadRewrite.single('file')` — optional file                                    |
| `report/report.route.js`                               | `/assistant` | POST   | ✅          | ➕      | ➕      | `uploadReportFiles` — multi-file                                                  |
| `report/report.route.js`                               | `/analyze`   | POST   | —           | ➕      | ➕      | `uploadReportFiles` — multi-file                                                  |
| `plan_generator/plan_generator.route.js`               | `/assistant` | POST   | ✅          | ➕      | —       | Already has old `checkStorageLimit` from tenant middleware — replace with new one |
| `summary/summary.route.js`                             | `/summarize` | POST   | —           | ➕ DRL  | ➕      | `upload.single('file')` — optional file                                           |

---

## Group 3 — Knowledge Bank (RAG core — need RAG + Storage)

These routes are the primary RAG feature surface. Both middlewares required on all upload/processing endpoints.

### `knowledge_bank/knowledge_bank.routes.js`

| Endpoint                      | Method         | Current DRL | Add RAG | Add STG | Notes                                          |
| ----------------------------- | -------------- | ----------- | ------- | ------- | ---------------------------------------------- |
| `/upload`                     | POST           | —           | ➕      | ➕      | Main file upload — `upload.any()`              |
| `/files`                      | GET            | —           | —       | —       | Read-only                                      |
| `/files/:fileId`              | GET            | —           | —       | —       | Read-only                                      |
| `/files/:fileId`              | DELETE         | —           | —       | —       | Delete (storage decrement = Task 5)            |
| `/files/:fileId/process`      | POST           | —           | ➕      | —       | Processing existing file — RAG access required |
| `/folders`                    | POST           | —           | ➕      | —       | Create folder — RAG access required            |
| `/folders`                    | GET            | —           | —       | —       | Read-only                                      |
| `/folders/:folderId`          | GET/PUT/DELETE | —           | —       | —       | Read/manage                                    |
| `/folders/:folderId/contents` | GET            | —           | —       | —       | Read-only                                      |
| `/stats`                      | GET            | —           | —       | —       | Read-only                                      |

### `knowledgebase/knowledgebase.routes.js` _(older module)_

| Endpoint         | Method | Current DRL | Add RAG | Add STG | Notes                           |
| ---------------- | ------ | ----------- | ------- | ------- | ------------------------------- |
| `/upload`        | POST   | —           | ➕      | ➕      | `upload.any()`                  |
| `/invoke-rag`    | POST   | —           | ➕      | —       | RAG query — no new file         |
| `/chat`          | POST   | —           | ➕      | —       | Chat with KB — no new file      |
| `/create`        | POST   | —           | ➕      | —       | Create KB — RAG access required |
| `/files/:fileId` | DELETE | —           | —       | —       | Delete only                     |
| `/list`          | GET    | —           | —       | —       | Read-only                       |
| `/files`         | GET    | —           | —       | —       | Read-only                       |

---

## Group 4 — Image / Video Generation + Audio Transcription

Image and video generation do not use RAG (no user-uploaded files for RAG indexing). Audio transcription uploads audio files — gated at `premium_agentic` tier via `checkRAGFeature`.

> **Note:** `enhanced_image` and `video` routes are missing `checkDailyRequestLimit` entirely.

### Enhanced Image (`enhanced_image/enhanced_image.route.js`)

| Endpoint                 | Method | Add DRL | Add RAG | Add STG | Notes                                        |
| ------------------------ | ------ | ------- | ------- | ------- | -------------------------------------------- |
| `/generate`              | POST   | ➕      | —       | —       | Text-prompt → AI image, no file upload       |
| `/edit`                  | POST   | ➕      | —       | —       | Base64 image in body, not a user file upload |
| `/analyze-intent`        | POST   | —       | —       | —       | No auth, lightweight                         |
| `/analyze-image-intent`  | POST   | ➕      | —       | —       |                                              |
| `/build-enhanced-prompt` | POST   | ➕      | —       | —       |                                              |
| `/finalize-prompt`       | POST   | ➕      | —       | —       |                                              |

### Video (`video/video.route.js`)

| Endpoint      | Method | Add DRL | Add RAG | Add STG | Notes                                    |
| ------------- | ------ | ------- | ------- | ------- | ---------------------------------------- |
| `/generate`   | POST   | ➕      | —       | —       | AI video generation, no user file upload |
| `/operations` | POST   | —       | —       | —       | Status poll — not an AI call             |

### Transcription (`transcription/transcription.route.js`)

Uploads real audio files (up to 10 × 20 MB). In the RAG tier model, audio is a `premium_agentic`-only MIME category, so `checkRAGFeature` gates this to Command plan users.

| Endpoint     | Method | Add DRL | Add RAG | Add STG | Notes                                                                |
| ------------ | ------ | ------- | ------- | ------- | -------------------------------------------------------------------- |
| `/assistant` | POST   | ➕      | ➕      | ➕      | `upload.fields([audio, audios])` — audio files, premium_agentic only |

---

## Group 5 — No Enforcement Needed

These are auth/billing/admin/utility endpoints that should never be rate-limited by plan.

| Route File                                   | Reason                                                         |
| -------------------------------------------- | -------------------------------------------------------------- |
| `auth/auth.route.js`                         | Authentication — always open                                   |
| `stripe/stripe.route.js`                     | Billing operations                                             |
| `payment/payment.route.js`                   | Billing operations                                             |
| `tenant/tenant.route.js`                     | Tenant management (Task 6 handles invitation check separately) |
| `notification/notification.route.js`         | System notifications                                           |
| `support/support.route.js`                   | Support tickets                                                |
| `admin/admin.route.js`                       | Admin-only, no limits                                          |
| `streaming/streaming.route.js`               | Token-only endpoint                                            |
| `social-login/social-login.route.js`         | OAuth                                                          |
| `forum/forum.route.js`                       | Community forum                                                |
| `notes/notes.route.js`                       | Personal notes                                                 |
| `conversations/conversation.route.js`        | Conversation history reads                                     |
| `workflow_automation → workflow.routes.js`   | Workflow CRUD (management, not AI calls)                       |
| `workflow_automation → execution.routes.js`  | Execution management                                           |
| `workflow_storage/workflowStorage.routes.js` | Storage management                                             |
| `serper/serper.route.js`                     | Internal search tool                                           |
| `tavily/tavily.route.js`                     | Internal research tool                                         |
| `gemini/gemini.route.js`                     | Internal AI provider route                                     |
| `openAi/openAi.route.js`                     | Internal AI provider route                                     |
| `groq/groq.route.js`                         | Internal AI provider route                                     |
| `deepseek/deepseek.route.js`                 | Internal AI provider route                                     |
| `qwen/qwen.route.js`                         | Internal AI provider route                                     |
| `togetherAi/togeterAi.route.js`              | Internal AI provider route                                     |
| `Llama4/llama4.route.js`                     | Internal AI provider route                                     |
| `llamaindex/llamaindex.route.js`             | Internal AI provider route                                     |
| `aiModelServices/aiEndpoint.route.js`        | Internal AI provider route                                     |
| `cyberdesk/cyberdesk.route.js`               | Browser automation tool                                        |
| `browserUse/browserUse.route.js`             | Browser automation tool                                        |
| `composio*/composio.route.js` (×3)           | Integration / automation tools                                 |
| `wishper/wishper.route.js`                   | Whisper internal                                               |

---

## Summary of Changes (Task 4)

| Priority  | File                                                   | Add                                            |
| --------- | ------------------------------------------------------ | ---------------------------------------------- |
| 🔴 High   | `code/code.route.js`                                   | DRL                                            |
| 🔴 High   | `writing/workflow.route.js`                            | DRL                                            |
| 🔴 High   | `deep_research/deep_research.route.js`                 | DRL                                            |
| 🔴 High   | `summary/summary.route.js`                             | DRL + RAG + STG                                |
| 🔴 High   | `enhanced_image/enhanced_image.route.js`               | DRL (on 5 routes)                              |
| 🔴 High   | `video/video.route.js`                                 | DRL on `/generate`                             |
| 🔴 High   | `transcription/transcription.route.js`                 | DRL + RAG + STG on `/assistant`                |
| 🔴 High   | `knowledge_bank/knowledge_bank.routes.js`              | RAG + STG on upload/process/create             |
| 🔴 High   | `knowledgebase/knowledgebase.routes.js`                | RAG + STG on upload; RAG on chat/invoke/create |
| 🟡 Medium | `article_writer/article_writer.route.js`               | RAG + STG on `/assistant`                      |
| 🟡 Medium | `document_analysis/document_analysis.route.js`         | RAG + STG on `/analyze`                        |
| 🟡 Medium | `document_review/document_review.route.js`             | RAG + STG on `/assistant` and `/review`        |
| 🟡 Medium | `legal_contract/legal_contract.route.js`               | RAG + STG on `/assistant`                      |
| 🟡 Medium | `legal_contract_review/legal_contract_review.route.js` | RAG + STG on `/assistant` and `/review`        |
| 🟡 Medium | `rewrite/rewrite.route.js`                             | RAG + STG on `/rewrite`                        |
| 🟡 Medium | `report/report.route.js`                               | RAG + STG on `/assistant` and `/analyze`       |
| 🟢 Low    | `plan_generator/plan_generator.route.js`               | Replace old `checkStorageLimit` with new one   |

---

## Middleware Insertion Order (per route)

For any route that gets all three middlewares, the correct order is:

```
auth() / optionalAuth()
  → extractTenantContext
    → checkDailyRequestLimit   ← count the AI request
      → checkRAGFeature         ← check plan allows RAG + validate file type
        → checkStorageLimit     ← check quota before multer saves file to memory
          → upload.single(...)  ← multer runs AFTER limit checks pass
            → validateRequest
              → controller
```

> `checkStorageLimit` must run **before** multer so we reject early without loading the file into memory/disk.
> `checkRAGFeature` also runs before multer for the same reason — `req.file` won't exist yet, but the MIME type is available on the multer `fileFilter` stage. For pre-multer RAG checks, the file-type validation is skipped (only the plan-level `ragType === 'none'` check applies); the full MIME check fires on the same route's second call when multer is present — or we move multer before RAG and rely on multer's `fileFilter`. **Recommended:** move multer before `checkRAGFeature` so `req.file` is populated.

### Revised Safe Order (when multer must run first for MIME access):

```
auth / optionalAuth
  → extractTenantContext
    → checkDailyRequestLimit
      → checkStorageLimit        ← estimate from Content-Length header (pre-multer)
        → upload.single(...)     ← multer populates req.file
          → checkRAGFeature      ← MIME type now available on req.file
            → validateRequest
              → controller
```
