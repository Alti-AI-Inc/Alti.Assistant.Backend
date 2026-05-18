# Brainstorm Module - Quick Start Guide

Get started with the Brainstorm Assistant in 5 minutes!

## Quick Test

### 1. Simple Brainstorm Request

```bash
curl -X POST http://localhost:5000/api/v1/brainstorm/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Help me brainstorm ideas for a pet care mobile app"
  }'
```

That's it! The AI will:

- Analyze your idea
- Generate creative concepts
- Provide opportunities and challenges
- Suggest next steps

## Common Use Cases

### Use Case 1: Product Ideation

**Request:**

```json
{
  "message": "I want to create a productivity tool for remote workers"
}
```

**What you get:**

- 20+ product feature ideas
- User-centric perspectives
- Market opportunities
- Technical considerations

### Use Case 2: Business Strategy

**Request:**

```json
{
  "idea": "Subscription box for sustainable living products",
  "brainstormType": "business_strategy",
  "technique": "swot",
  "depth": "deep"
}
```

**What you get:**

- Strengths analysis
- Weaknesses to address
- Market opportunities
- Competitive threats

### Use Case 3: Marketing Campaign

**Request:**

```json
{
  "message": "Brainstorm marketing ideas for launching a new coffee brand targeting Gen Z"
}
```

**What you get:**

- Campaign concepts
- Channel strategies
- Content ideas
- Engagement tactics

### Use Case 4: Problem Solving

**Request:**

```json
{
  "idea": "Our mobile app has low user retention",
  "brainstormType": "problem_solving",
  "technique": "five_whys",
  "perspective": ["user_centric", "technical"]
}
```

**What you get:**

- Root cause analysis
- Solution alternatives
- Implementation strategies
- Quick wins

## Multi-Turn Conversation

### Step 1: Start Brainstorm

```json
{
  "message": "Help me brainstorm a food delivery startup idea"
}
```

**Save the conversationId from response!**

### Step 2: Continue Conversation

```json
{
  "conversationId": "brainstorm_1234567890_abc",
  "message": "Can you focus on the technical implementation?"
}
```

### Step 3: Refine Ideas

```json
{
  "conversationId": "brainstorm_1234567890_abc",
  "message": "Let's refine the top 3 ideas to be more unique"
}
```

## Using Different Techniques

### SCAMPER Technique

Great for improving existing ideas:

```json
{
  "idea": "Traditional calendar app",
  "technique": "scamper"
}
```

Gets you variations:

- **Substitute**: What if we substitute paper with AR?
- **Combine**: Combine calendar with task management
- **Adapt**: Adapt gaming mechanics for scheduling
- etc.

### Mind Mapping

Great for exploring connections:

```json
{
  "idea": "Educational platform for kids",
  "technique": "mind_map"
}
```

### Six Thinking Hats

Great for comprehensive analysis:

```json
{
  "idea": "AI chatbot for customer service",
  "technique": "six_thinking_hats"
}
```

## Setting Depth Levels

### Quick (5-10 min)

```json
{
  "message": "Quick ideas for team building activities",
  "depth": "quick"
}
```

- ~10 ideas
- Brief descriptions
- Fast results

### Standard (10-15 min)

```json
{
  "depth": "standard"
}
```

- ~20 ideas
- Good detail
- Balanced approach
- **Default option**

### Deep (15-25 min)

```json
{
  "depth": "deep"
}
```

- ~35 ideas
- Detailed analysis
- Multiple perspectives
- Rich insights

### Comprehensive (25+ min)

```json
{
  "depth": "comprehensive"
}
```

- 50+ ideas
- Exhaustive analysis
- All perspectives
- Maximum value

## Adding Constraints

Real-world constraints help get practical ideas:

```json
{
  "idea": "Online education platform",
  "constraints": {
    "budget": "$10,000 initial budget",
    "timeline": "3 months to MVP",
    "technology": ["React", "Node.js"],
    "targetAudience": "College students aged 18-24",
    "industry": "EdTech",
    "competitors": ["Coursera", "Udemy"]
  }
}
```

## Focus Areas

Prioritize specific aspects:

```json
{
  "idea": "Sustainable fashion marketplace",
  "focusAreas": ["innovation", "profitability", "sustainability"]
}
```

Available focus areas:

- `innovation` - Novel approaches
- `feasibility` - Practical implementation
- `marketability` - Market appeal
- `scalability` - Growth potential
- `uniqueness` - Differentiation
- `profitability` - Revenue potential
- `user_value` - User benefits
- `sustainability` - Long-term viability

## Export Your Session

After brainstorming, export for documentation:

```json
{
  "conversationId": "brainstorm_1234567890_abc",
  "format": "markdown",
  "includeHistory": true
}
```

Download as:

- Markdown for documentation
- JSON for further processing

## Authentication

### For Testing (Guest)

No authentication needed! Just send requests.

### For Production (Authenticated)

Add your JWT token:

```bash
curl -X POST http://localhost:5000/api/v1/brainstorm/assistant \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Your idea here"}'
```

## Response Format

You'll get:

```json
{
  "success": true,
  "conversationId": "brainstorm_xxx",
  "response": "## 💡 Main Ideas (20)\n\n### 1. Idea Title...",
  "brainstormData": {
    "mainIdeas": [...],
    "subIdeas": [...],
    "opportunities": [...],
    "risks": [...],
    "nextSteps": [...]
  },
  "metadata": {
    "totalIdeasGenerated": 25,
    "techniqueUsed": "free_association"
  }
}
```

## Common Patterns

### Pattern 1: Broad to Narrow

```
1. Start: "Brainstorm SaaS ideas"
2. Focus: "Focus on B2B SaaS"
3. Refine: "Refine top 3 for small businesses"
```

### Pattern 2: Multiple Perspectives

```
1. Business view: "From business perspective"
2. Technical view: "Now technical feasibility"
3. User view: "What about user experience?"
```

### Pattern 3: Technique Combination

```
1. Generate: Use free_association for many ideas
2. Analyze: Switch to SWOT for evaluation
3. Improve: Use SCAMPER for refinement
```

## Troubleshooting

### "Needs more info"

Add more context:

```json
{
  "message": "E-commerce platform for handmade crafts targeting millennial women, budget under $5k"
}
```

### Too generic results

Be more specific:

```json
{
  "message": "Yoga app",
  "additionalInstructions": "Focus on beginners, home practice, no equipment needed, 15-min sessions"
}
```

### Want different style

Try different techniques:

- Too scattered? Use `mind_map`
- Need evaluation? Use `swot`
- Want variations? Use `scamper`

## Next Steps

1. **Try it now** - Start with a simple idea
2. **Experiment** - Try different techniques and depths
3. **Iterate** - Refine your best ideas
4. **Export** - Save your sessions
5. **Read full docs** - Check [README.md](./README.md) for all features

## Example Complete Workflow

```bash
# 1. Initial brainstorm
curl -X POST http://localhost:5000/api/v1/brainstorm/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Brainstorm ideas for a sustainable fashion marketplace"
  }'

# Save conversationId from response

# 2. Analyze from business perspective
curl -X POST http://localhost:5000/api/v1/brainstorm/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "YOUR_CONVERSATION_ID",
    "message": "Analyze from a business and financial perspective"
  }'

# 3. Refine top ideas
curl -X POST http://localhost:5000/api/v1/brainstorm/refine \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "YOUR_CONVERSATION_ID",
    "message": "Refine the top 3 ideas for feasibility",
    "focusOn": ["Circular fashion rental", "Upcycling marketplace"]
  }'

# 4. Export session
curl -X POST http://localhost:5000/api/v1/brainstorm/export \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "YOUR_CONVERSATION_ID",
    "format": "markdown"
  }'
```

## Tips for Success

✅ **DO:**

- Be specific about your idea
- Mention your target audience
- Include constraints (budget, timeline)
- Use conversationId to continue discussions
- Try multiple techniques
- Export valuable sessions

❌ **DON'T:**

- Be too vague ("an app")
- Skip context
- Ignore the generated insights
- Forget to save conversationId
- Use only one perspective

---

**Ready to brainstorm?** Start with the conversational assistant and let the AI guide you!

For detailed API documentation, see [README.md](./README.md)
