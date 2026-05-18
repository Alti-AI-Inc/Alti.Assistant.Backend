# Plan Generator - Quick Start Guide

Get your Plan Generator module up and running in 5 minutes!

## Step 1: Verify Installation

Ensure all files are in place:

```
src/app/modules/plan_generator/
├── plan_generator.constant.js
├── plan_generator.validation.js
├── plan_generator.route.js
├── plan_generator.controller.js
├── plan_generator.service.js
├── middlewares/
│   └── uploadPlanFiles.js
└── services/
    ├── ideaAnalyzer.js
    ├── brainstormEngine.js
    ├── planGenerator.js
    └── planRefiner.js
```

## Step 2: Register Routes

Add to `src/app/routes/index.js`:

```javascript
import { planGeneratorRoutes } from '../modules/plan_generator/plan_generator.route.js';

const moduleRoutes = [
  // ... existing routes
  {
    path: '/plan-generator',
    route: planGeneratorRoutes,
  },
];
```

## Step 3: Test the API

### Test 1: Simple Conversational Request

```bash
curl -X POST http://localhost:5000/api/v1/plan-generator/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I want to launch a mobile app"
  }'
```

**Expected Response:**

- AI will analyze your idea
- Ask clarifying questions
- Return conversationId for continued interaction

### Test 2: Direct Plan Generation

```bash
curl -X POST http://localhost:5000/api/v1/plan-generator/generate \
  -H "Content-Type: application/json" \
  -d '{
    "idea": "Create an online tutoring platform for high school students",
    "planType": "business_plan",
    "complexity": "moderate",
    "planDepth": "standard"
  }'
```

**Expected Response:**

- Complete plan with objectives, phases, and action items
- Brainstorming insights
- Resource requirements

### Test 3: Brainstorm Only

```bash
curl -X POST http://localhost:5000/api/v1/plan-generator/brainstorm \
  -H "Content-Type: application/json" \
  -d '{
    "idea": "Launch a sustainable clothing brand"
  }'
```

**Expected Response:**

- SWOT analysis
- Market insights
- Key recommendations

## Step 4: Continue Conversation

Using the conversationId from Test 1:

```bash
curl -X POST http://localhost:5000/api/v1/plan-generator/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "The app will be for fitness tracking with social features",
    "conversationId": "YOUR_CONVERSATION_ID_HERE"
  }'
```

## Step 5: Export Your Plan

```bash
curl -X POST http://localhost:5000/api/v1/plan-generator/export \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "YOUR_CONVERSATION_ID_HERE",
    "format": "markdown"
  }'
```

## Common Use Cases

### Use Case 1: Business Plan for Startup

```javascript
{
  "idea": "AI-powered resume builder that helps job seekers create professional resumes in minutes",
  "planType": "startup_plan",
  "complexity": "moderate",
  "planDepth": "strategic",
  "domains": ["technical", "business", "marketing"],
  "constraints": {
    "budget": 75000,
    "timeline": "9 months",
    "teamSize": 6
  }
}
```

### Use Case 2: Event Planning

```javascript
{
  "message": "I want to organize a charity marathon for 1000 participants in 6 months with a budget of $20,000"
}
```

### Use Case 3: Product Launch

```javascript
{
  "idea": "Launch eco-friendly water bottles with built-in filtration",
  "planType": "product_launch",
  "complexity": "complex",
  "brainstormAspects": [
    "market_analysis",
    "competitive_landscape",
    "financial_projections"
  ]
}
```

## Conversational Flow Example

**User:** "I want to create a meal planning app"

**AI:** Analyzes idea → Asks clarifying questions:

1. Who is your target audience?
2. What makes it different from existing apps?
3. What's your budget and timeline?

**User:** "For busy parents, with AI recipe suggestions, $30k budget, 6 months"

**AI:** Generates brainstorm → Creates comprehensive plan → Ready for refinement

**User:** "Can you make the timeline more aggressive?"

**AI:** Adjusts plan → Optimizes phases → Updates timeline

**User:** "Export as PDF"

**AI:** Generates PDF-ready format

## Testing with Postman

1. Import the collection: `postman_collections/Plan_Generator_API.postman_collection.json`
2. Set environment variable: `base_url = http://localhost:5000`
3. Run tests in order:
   - Start New Conversation
   - Continue Conversation
   - Generate Direct Plan
   - Export Plan

## Troubleshooting

### Issue: "Conversation not found"

**Solution:** Make sure you're using the correct conversationId returned from the first request

### Issue: "Subscription limit reached"

**Solution:** Either:

- Test with guest user (don't send auth token)
- Increase subscription limits in database

### Issue: "Failed to extract JSON from response"

**Solution:** This is usually a temporary AI model issue. Retry the request.

### Issue: File upload fails

**Solution:**

- Check file size (< 10MB)
- Verify file type (PDF, DOCX, TXT, XLSX only)
- Ensure uploads/plan_files directory exists

## Advanced Features

### 1. Add File Context

```bash
curl -X POST http://localhost:5000/api/v1/plan-generator/assistant \
  -H "Content-Type: multipart/form-data" \
  -F "message=Create a plan based on this document" \
  -F "file=@/path/to/document.pdf"
```

### 2. Refine Specific Sections

```javascript
{
  "message": "Make the budget section more detailed with monthly breakdown",
  "conversationId": "plan_123..."
}
```

### 3. Get Alternative Approaches

```javascript
{
  "message": "What are alternative approaches to this plan?",
  "conversationId": "plan_123..."
}
```

## Integration Examples

### React Frontend

```javascript
const generatePlan = async (idea) => {
  const response = await fetch(
    'http://localhost:5000/api/v1/plan-generator/generate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idea,
        planType: 'business_plan',
        planDepth: 'comprehensive',
      }),
    }
  );

  const data = await response.json();
  return data.plan;
};
```

### Node.js Backend

```javascript
import axios from 'axios';

const brainstormIdea = async (idea) => {
  try {
    const { data } = await axios.post(
      'http://localhost:5000/api/v1/plan-generator/brainstorm',
      { idea }
    );
    return data.brainstorm;
  } catch (error) {
    console.error('Brainstorm failed:', error.message);
  }
};
```

## Performance Tips

1. **Use Direct Generation** for programmatic access (faster)
2. **Use Conversational** for user-facing features (better UX)
3. **Cache Plans** in your database to avoid regeneration
4. **Batch Requests** if generating multiple plans
5. **Set Appropriate Depth**: Use "quick" for MVP, "strategic" for final plans

## Next Steps

1. ✅ Test all endpoints
2. ✅ Create your first plan
3. ✅ Export in different formats
4. 📖 Read full [README.md](./README.md)
5. 🔧 Customize prompts in `plan_generator.constant.js`
6. 🎨 Build your frontend interface
7. 📊 Add analytics tracking

## Support Resources

- Full API Documentation: [README.md](./README.md)
- Example Postman Collection: `/postman_collections/Plan_Generator_API.postman_collection.json`
- Service Architecture: Check service files in `/services` directory

## Quick Reference

| Endpoint            | Purpose                 | Auth Required |
| ------------------- | ----------------------- | ------------- |
| `/assistant`        | Conversational planning | Optional      |
| `/generate`         | Direct plan creation    | Optional      |
| `/brainstorm`       | Brainstorming only      | Optional      |
| `/export`           | Export in formats       | Optional      |
| `/conversation/:id` | Get history             | Required      |

**Happy Planning! 🚀**
