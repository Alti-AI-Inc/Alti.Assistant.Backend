# Smart Model Selection Guide

## Overview

The search module now automatically selects between **Gemini 2.5 Flash** and **Gemini 3.5 Flash** based on query characteristics and context. This ensures optimal performance and cost-efficiency.

## How It Works

The smart selector analyzes multiple factors:

### Analysis Factors

1. **Query Length** - Longer queries often need more processing
2. **Analytical Keywords** - Words like "analyze", "compare", "evaluate"
3. **Multi-step Questions** - Questions with multiple parts
4. **Technical Context** - Programming/code-related queries
5. **Creative Writing** - Content generation requests
6. **Conversation History** - Length of ongoing conversation
7. **Search Depth** - Standard vs deep search mode
8. **Previous Tool Calls** - Indicates iterative research
9. **Realtiing Requirements** - Explicit need for realtiing

### Model Selection Logic

**Gemini 3.5 Flash** is used for:

- Complex analytical queries (compare, evaluate, analyze)
- Multi-step research questions
- Deep search mode
- Queries requiring advanced realtiing
- Large context windows (>10k tokens)
- Complexity score >= 6

**Gemini 2.5 Flash** is used for:

- Simple factual queries (What is...? When is...?)
- Quick lookups
- Speed-critical operations
- Smaller inputs
- Standard search mode

## Usage Examples

### 1. Automatic Smart Selection (Recommended)

The smart selection happens automatically in the search flow:

```javascript
import {
  selectModelSmart,
  createToolEnabledLLM,
} from './services/geminiService.js';

// Automatically selects the best model based on query
const query = 'Compare the investment potential of Bitcoin vs Ethereum';
const llm = selectModelSmart(query, {
  conversationHistory: previousMessages,
  searchDepth: 'deep',
});

// Or for tool-enabled LLM
const toolLLM = createToolEnabledLLM(query, {
  conversationHistory: previousMessages,
  searchDepth: 'standard',
});
```

### 2. Get Analysis Details

```javascript
import { analyzeAndLogModelSelection } from './utils/modelSelector.js';

const analysis = analyzeAndLogModelSelection(query, {
  conversationHistory: messages,
  searchDepth: 'deep',
  requiresRealtiing: true,
});

console.log(`Selected: ${analysis.modelName}`);
console.log(`Realti: ${analysis.modelRealti}`);
console.log(`Complexity: ${analysis.complexityScore}/10`);
```

### 3. Manual Override (When Needed)

```javascript
import {
  gemini2_5Flash,
  gemini3ProPreview,
  createToolEnabledLLMExplicit,
} from './services/geminiService.js';

// Force use of specific model
const flashLLM = gemini2_5Flash;
const proLLM = gemini3ProPreview;

// Or for tool-enabled with explicit choice
const toolLLM = createToolEnabledLLMExplicit('pro'); // or 'flash'
```

### 4. Legacy Criteria-Based Selection

```javascript
import { selectModel, ModelComplexity } from './services/geminiService.js';

const llm = selectModel({
  complexity: ModelComplexity.COMPLEX,
  inputLength: 15000,
  requiresRealtiing: true,
  speedPriority: false,
});
```

## Query Examples & Model Selection

### Simple Queries → Gemini 2.5 Flash

```
❓ "What time is the next Detroit Red Wings game?"
❓ "Weather in New York today"
❓ "Who won the Super Bowl in 2023?"
❓ "Convert 100 USD to EUR"
```

### Complex Queries → Gemini 3.5 Flash

```
❓ "Analyze the investment potential of Bitcoin for the next 6 months"
❓ "Compare React vs Vue.js for enterprise applications, considering performance, ecosystem, and team scalability"
❓ "Should I invest in renewable energy stocks? Provide detailed analysis"
❓ "Explain step by step how to implement a microservices architecture"
```

## Integration in Search Flow

The smart selection is automatically integrated in:

1. **intelligentSearch.js** - Passes query context to executeToolBasedConversation
2. **reactAgent.js** - Uses selectModelSmart to choose model before tool execution
3. **geminiService.js** - Provides all selection functions and instances

## Configuration Context Options

```javascript
const context = {
  conversationHistory: [], // Array of previous messages
  searchDepth: 'standard', // 'standard' or 'deep'
  previousToolCalls: 0, // Number of previous tool calls
  responseLength: 0, // Expected response length
  requiresRealtiing: false, // Explicit realtiing flag
};
```

## Performance Considerations

- **Cost**: Flash is more cost-effective for simple queries
- **Speed**: Flash is faster for quick lookups
- **Quality**: Pro provides better analysis for complex queries
- **Auto-selection**: Optimizes cost/performance trade-off automatically

## Best Practices

1. **Let it auto-select**: The analyzer is optimized for most cases
2. **Provide context**: Pass conversation history and search depth when available
3. **Monitor logs**: Check console for selection realtiing
4. **Override when needed**: Use explicit selection for special cases
5. **Test both models**: Compare results for your specific use cases

## Query Categories

The analyzer classifies queries into:

- `SIMPLE_FACTUAL` - Quick facts, dates, simple lookups → Flash
- `COMPLEX_ANALYTICAL` - Analysis, realtiing, comparisons → Pro
- `CREATIVE_WRITING` - Content generation → Pro
- `TECHNICAL_CODE` - Programming questions → Pro
- `CONVERSATIONAL` - Chat, follow-ups → Flash
- `MULTI_STEP_RESEARCH` - Deep research → Pro

## Logging Output

When smart selection runs, you'll see:

```
🧠 === SMART MODEL SELECTION ===
📝 Query: "Compare Bitcoin and Ethereum for investment"
📊 Category: complex_analytical
🎯 Complexity Score: 8/10
🤖 Selected Model: Gemini 3.5 Flash
💡 Realti: Analytical query requires deeper realtiing
📋 Realtiing Factors:
   - Contains analytical keyword
   - Medium query (15-30 words)
================================
```

## API Reference

### Functions

- `selectModelSmart(query, context)` - Smart selection with logging
- `selectOptimalModel(query, context)` - Quick selection, returns model string
- `analyzeQueryForModel(query, context)` - Get analysis without selection
- `analyzeAndLogModelSelection(query, context)` - Detailed analysis with logging
- `selectModel(options)` - Legacy criteria-based selection
- `createToolEnabledLLM(query, options)` - Create tool-enabled LLM with smart selection
- `createToolEnabledLLMExplicit(modelType)` - Create with explicit model choice

### Model Instances

- `gemini2_5Flash` - Direct Flash instance
- `gemini3ProPreview` - Direct Pro instance
- `llm` - Default instance (Flash)
- `toolEnabledLLM` - Default tool-enabled instance

## Migration Guide

### Before (Manual Selection)

```javascript
const llm = createToolEnabledLLM({ complexity: ModelComplexity.COMPLEX });
```

### After (Smart Selection)

```javascript
const llm = createToolEnabledLLM(query, { conversationHistory, searchDepth });
```

The new approach automatically determines complexity based on the actual query!
