# Google Search Grounding Integration Guide

## Overview

This guide explains how to integrate Google's native `google_search` grounding tool into your search system. Google's grounding provides automatic search query generation, execution, and citation management - solving the `thought_signature` error.

## Problem Solved

**Previous Error:**
```
GoogleGenerativeAIFetchError: Function call is missing a thought_signature in functionCall parts
```

**Root Cause:** The `gemini-3-pro-preview` model with custom tools (via `bindTools()`) requires `thought_signature` configuration that LangChain doesn't automatically provide.

**Solution:** Use Google's native `google_search` grounding tool which handles everything automatically.

## Architecture

### Two-Tier Search System

```
User Query
    ↓
┌───────────────────┐
│  Smart Router     │ ← Analyzes complexity
│  (analyzes query) │
└────────┬──────────┘
         │
    ┌────┴─────┐
    │          │
┌───▼──────┐  ┌▼────────────┐
│  Simple  │  │  Complex    │
│  Queries │  │  Queries    │
└────┬─────┘  └┬────────────┘
     │         │
┌────▼──────────────┐  ┌──▼──────────────┐
│ Native Grounding  │  │  ReAct Agent    │
│ (google_search)   │  │  (multi-step)   │
│ - Faster          │  │  - Reasoning    │
│ - Auto citations  │  │  - Verification │
│ - Built-in        │  │  - Filtering    │
└───────────────────┘  └─────────────────┘
```

### When to Use Each Method

#### Native Grounding (Gemini 2.0/1.5 + google_search)
✅ **Use for:**
- Simple factual queries
- Single-step information retrieval
- General knowledge questions
- Quick lookups
- News and current events

❌ **Don't use for:**
- Multi-step reasoning (compare, analyze)
- Requires filtering (home vs away games)
- Complex decision-making
- Needs verification from multiple sources

#### ReAct Agent (Gemini 1.5 Pro + Custom Tools)
✅ **Use for:**
- Multi-step reasoning
- Comparison queries ("A vs B")
- Prediction/analysis requests
- Filtering requirements (specific criteria)
- Verification across sources

❌ **Don't use for:**
- Simple lookups (slower, unnecessary)

## Implementation

### 1. Native Grounding Service

**File:** `src/app/modules/search/services/geminiGroundingService.js`

```javascript
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

export function createGroundedModel(modelName = "gemini-2.0-flash-exp") {
  return genAI.getGenerativeModel({
    model: modelName,
    tools: [
      {
        googleSearch: {} // Native Google Search grounding
      }
    ]
  });
}

export async function executeGroundedSearch(query, conversationHistory = []) {
  const model = createGroundedModel();
  const chat = model.startChat({ history: [...] });
  
  const result = await chat.sendMessage(query);
  const response = await result.response;
  
  // Extract grounding metadata
  const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
  
  // groundingMetadata contains:
  // - webSearchQueries: Array of search queries used
  // - groundingChunks: Web sources (uri, title)
  // - groundingSupports: Links text segments to sources
  
  return {
    answer: response.text(),
    references: extractReferences(groundingMetadata),
    citations: buildCitations(groundingMetadata)
  };
}
```

### 2. Smart Router

**File:** `src/app/modules/search/services/smartSearchRouter.js`

```javascript
export async function executeSmartSearch(query, conversationHistory = [], options = {}) {
  const analysis = analyzeQueryComplexity(query, conversationHistory);
  
  if (analysis.isComplex) {
    // Use ReAct Agent for complex queries
    return await executeToolBasedConversation(messages, options);
  } else {
    // Use native grounding for simple queries
    return await executeGroundedSearch(query, conversationHistory);
  }
}
```

**Complexity Analysis Criteria:**
- Multi-step indicators: "compare", "vs", "should I", "recommend"
- Specific criteria: "home game", "away game", "only", "specifically"
- Multi-source needs: "verify", "confirm", "check multiple"
- Predictions: "predict", "who will win", "chances", "odds"
- Long conversation history (>5 messages)
- Multiple questions in one query

### 3. Fixed ReAct Agent

**File:** `src/app/modules/search/services/geminiService.js`

```javascript
// Changed from gemini-3-pro-preview to stable model
export const llm = new ChatGoogleGenerativeAI({
  model: "gemini-1.5-pro", // Stable model
  apiKey: config.gemini_secret_key,
  temperature: 0,
  maxRetries: 2,
});
```

## Integration with Existing Code

### Option A: Replace Current Search (Recommended)

Update `search.controller.js`:

```javascript
import { executeSmartSearch } from './services/smartSearchRouter.js';

export const performSearch = catchAsync(async (req, res) => {
  // ... existing validation ...
  
  // Replace current search with smart router
  const result = await executeSmartSearch(
    message,
    conversationHistory,
    { userId, conversationId: actualConversationId }
  );
  
  return sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Search completed successfully',
    data: {
      responseMessage: {
        answer: result.answer,
        reference: result.reference,
        citations: result.citations,
        citationMetadata: result.citationMetadata
      },
      conversationId: actualConversationId,
      searchMethod: result.citationMetadata?.method // 'native_grounding' or 'react_agent'
    }
  });
});
```

### Option B: Add as Alternative Endpoint

Add new endpoint to test:

```javascript
// In search.route.js
router.post(
  '/search-grounded',
  optionalAuth,
  searchController.performGroundedSearch
);

// In search.controller.js
export const performGroundedSearch = catchAsync(async (req, res) => {
  const { message, conversationId } = req.body;
  
  const result = await executeGroundedSearch(message, conversationHistory);
  
  return sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    data: {
      responseMessage: result,
      searchMethod: 'native_grounding'
    }
  });
});
```

## Benefits of Native Grounding

### 1. **Automatic Everything**
- ✅ Model decides when to search
- ✅ Generates optimal search queries
- ✅ Executes searches automatically
- ✅ Provides structured citations
- ✅ No `thought_signature` issues

### 2. **Better Citations**
```json
{
  "groundingMetadata": {
    "webSearchQueries": ["UEFA Euro 2024 winner"],
    "groundingChunks": [
      {"web": {"uri": "https://...", "title": "aljazeera.com"}}
    ],
    "groundingSupports": [
      {
        "segment": {"text": "Spain won Euro 2024..."},
        "groundingChunkIndices": [0]
      }
    ]
  }
}
```

### 3. **Inline Citation Support**
- Links specific text segments to sources
- `startIndex` and `endIndex` for precise attribution
- Can build inline citations: `Text [1][2]`

### 4. **Supported Models**
- ✅ Gemini 2.5 Pro/Flash/Flash-Lite
- ✅ Gemini 2.0 Flash (latest)
- ✅ Gemini 1.5 Pro/Flash

## Pricing

- **Cost:** Billed per search query executed by the model
- **Multiple queries:** If model runs 2 searches for one prompt, counts as 2 billable uses
- **No free tier for grounding** (requires billing enabled)

## Migration Path

### Phase 1: Test (Current)
1. ✅ Create `geminiGroundingService.js`
2. ✅ Create `smartSearchRouter.js`
3. ✅ Fix ReAct agent (change to `gemini-1.5-pro`)
4. ⏳ Test via new endpoint `/search-grounded`

### Phase 2: A/B Testing
1. Route 50% traffic to native grounding
2. Compare:
   - Response times
   - Answer quality
   - Citation accuracy
   - Cost per query

### Phase 3: Full Deployment
1. Make smart router default
2. Keep ReAct agent for complex queries
3. Monitor performance

## Testing

```bash
# Test native grounding
curl -X POST http://localhost:5000/api/v1/search/search-grounded \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Who won Euro 2024?",
    "userId": "test-user"
  }'

# Test smart router
curl -X POST http://localhost:5000/api/v1/search/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Compare Bitcoin vs Ethereum for investment",
    "userId": "test-user"
  }'
```

## Troubleshooting

### Issue: Model doesn't search
**Solution:** Query might not need search. Add explicit instruction:
```javascript
const result = await chat.sendMessage(
  `Search for: ${query}\nProvide sources for your answer.`
);
```

### Issue: No grounding metadata
**Solution:** Model didn't perform search. Check:
- Is query factual/current?
- Does it require web information?
- Try more explicit phrasing

### Issue: Still getting thought_signature error
**Solution:** You're still using custom tools. Switch to:
```javascript
tools: [{ googleSearch: {} }]  // Not bindTools()
```

## Best Practices

1. **Use Smart Router:** Let it decide which method based on complexity
2. **Monitor Costs:** Track search queries per request
3. **Cache Results:** Store frequently asked queries
4. **Fallback Strategy:** If native fails, use ReAct agent
5. **Citation Display:** Use `groundingSupports` for inline citations

## References

- [Google Search Grounding Docs](https://ai.google.dev/gemini-api/docs/google-search)
- [Gemini API Models](https://ai.google.dev/gemini-api/docs/models)
- [Grounding with Search Cookbook](https://colab.research.google.com/github/google-gemini/cookbook/blob/main/quickstarts/Search_Grounding.ipynb)
