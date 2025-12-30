# Plan Generator Module

An intelligent AI-powered planning assistant that helps users transform ideas into comprehensive, actionable plans through conversational brainstorming and strategic planning.

## Overview

The Plan Generator module uses advanced AI (Gemini 2.0) to analyze ideas, conduct multi-dimensional brainstorming, and create detailed plans with phases, action items, resources, risks, and success metrics.

## Features

### 🎯 Core Capabilities

- **Intelligent Idea Analysis**: Automatically categorizes ideas and assesses complexity
- **Multi-Dimensional Brainstorming**: SWOT analysis, market research, risk assessment, and more
- **Structured Plan Generation**: Creates comprehensive plans with objectives, phases, and action items
- **Conversational Refinement**: Iteratively improve plans through natural dialogue
- **Multiple Export Formats**: Export plans as PDF, DOCX, Markdown, JSON, or HTML
- **Guest & Authenticated Support**: Works for both authenticated users and guests

### 📊 Plan Types Supported

- Business Plans
- Project Plans
- Product Launch Plans
- Event Plans
- Marketing Campaigns
- Research Plans
- Content Strategy
- Startup Plans
- General Plans

### 🔍 Brainstorming Aspects

- SWOT Analysis (Strengths, Weaknesses, Opportunities, Threats)
- Market Analysis
- Competitive Landscape
- Resource Requirements (Budget, Team, Tools)
- Timeline Estimation
- Risk Assessment & Mitigation
- Stakeholder Mapping
- Financial Projections
- Technical Feasibility
- Success Metrics & KPIs

## Architecture

```
plan_generator/
├── plan_generator.constant.js      # Configuration, prompts, constants
├── plan_generator.validation.js    # Zod validation schemas
├── plan_generator.route.js         # Express routes
├── plan_generator.controller.js    # Request handlers
├── plan_generator.service.js       # Core business logic
├── middlewares/
│   └── uploadPlanFiles.js         # File upload middleware
├── services/
│   ├── ideaAnalyzer.js            # Idea analysis & categorization
│   ├── brainstormEngine.js        # Brainstorming generation
│   ├── planGenerator.js           # Plan creation
│   └── planRefiner.js             # Plan refinement & optimization
├── README.md
└── QUICKSTART.md
```

## API Endpoints

### 1. Conversational Assistant (Main Entry Point)

**POST** `/api/v1/plan-generator/assistant`

The primary endpoint for natural language interaction.

**Request:**
```json
{
  "message": "I want to launch a food delivery app",
  "conversationId": "optional_existing_id",
  "userId": "optional_for_guests"
}
```

**Optional:** Attach file (PDF, DOCX, TXT, XLSX) for additional context

**Response:**
```json
{
  "success": true,
  "conversationId": "plan_1234567890_abc123",
  "response": "Great! I understand you want to create a product_launch plan...",
  "planStage": "idea_analysis",
  "hasAnalysis": true,
  "hasBrainstorm": false,
  "hasPlan": false
}
```

**Flow:**
1. **Idea Analysis**: AI analyzes clarity, determines plan type, identifies missing info
2. **Brainstorming**: Generates comprehensive insights across multiple dimensions
3. **Plan Generation**: Creates structured, actionable plan
4. **Refinement**: Iteratively improve based on user feedback

---

### 2. Direct Plan Generation

**POST** `/api/v1/plan-generator/generate`

Programmatic plan generation with all parameters specified.

**Request:**
```json
{
  "idea": "Launch a food delivery app in urban areas",
  "planType": "product_launch",
  "complexity": "complex",
  "planDepth": "comprehensive",
  "domains": ["technical", "business", "marketing"],
  "constraints": {
    "budget": 50000,
    "timeline": "6 months",
    "teamSize": 5
  },
  "brainstormAspects": [
    "swot_analysis",
    "market_analysis",
    "risk_assessment"
  ]
}
```

**Response:**
```json
{
  "success": true,
  "analysis": { /* idea analysis */ },
  "brainstorm": { /* brainstorming insights */ },
  "plan": { /* complete plan */ },
  "message": "Plan generated successfully"
}
```

---

### 3. Brainstorm Only

**POST** `/api/v1/plan-generator/brainstorm`

Generate brainstorming insights without creating a full plan.

**Request:**
```json
{
  "idea": "Create an online learning platform",
  "aspects": ["swot_analysis", "market_analysis", "resource_needs"],
  "context": {
    "industry": "EdTech",
    "targetMarket": "University students",
    "budget": 30000
  }
}
```

**Response:**
```json
{
  "success": true,
  "analysis": { /* idea analysis */ },
  "brainstorm": {
    "swot_analysis": { /* SWOT */ },
    "market_analysis": { /* market insights */ },
    "key_insights": ["insight1", "insight2"],
    "recommendations": ["rec1", "rec2"]
  }
}
```

---

### 4. Export Plan

**POST** `/api/v1/plan-generator/export`

Export a generated plan in various formats.

**Request:**
```json
{
  "conversationId": "plan_1234567890_abc123",
  "format": "markdown",  // pdf, docx, json, markdown, html
  "userId": "optional_for_guests"
}
```

**Response:**
```json
{
  "success": true,
  "format": "markdown",
  "content": "# Plan Title\n\n## Executive Summary...",
  "plan": { /* full plan object */ }
}
```

---

### 5. Get Conversation History

**GET** `/api/v1/plan-generator/conversation/:conversationId`

Retrieve full conversation history and generated plan.

**Response:**
```json
{
  "success": true,
  "conversation": {
    "conversationId": "plan_1234567890_abc123",
    "messages": [ /* conversation history */ ],
    "metadata": {
      "planStage": "refinement",
      "analysis": { /* idea analysis */ },
      "brainstorm": { /* brainstorm data */ },
      "generatedPlan": { /* complete plan */ }
    }
  }
}
```

## Plan Structure

Generated plans follow this comprehensive structure:

```javascript
{
  "title": "Product Launch Plan: Food Delivery App",
  "executive_summary": "2-3 paragraph overview...",
  "objectives": [
    {
      "objective": "Launch MVP in 6 months",
      "description": "Detailed description",
      "priority": "high",
      "timeline": "Month 1-6"
    }
  ],
  "phases": [
    {
      "phase_number": 1,
      "name": "Planning & Research",
      "duration": "4 weeks",
      "objectives": ["Define requirements", "Market research"],
      "deliverables": ["Requirements doc", "Market analysis"],
      "milestones": [
        {
          "name": "Requirements Complete",
          "description": "All requirements documented",
          "deadline": "Week 4",
          "success_criteria": ["Stakeholder approval"]
        }
      ]
    }
  ],
  "action_items": [
    {
      "task": "Conduct user research",
      "phase": "Planning & Research",
      "priority": "high",
      "estimated_effort": "2 weeks",
      "assigned_to": "Product Manager",
      "dependencies": [],
      "status": "not_started"
    }
  ],
  "resources": {
    "budget": {
      "total_estimate": "$50,000",
      "breakdown": [
        {
          "category": "Development",
          "amount": "$30,000",
          "justification": "App development costs"
        }
      ]
    },
    "team": [
      {
        "role": "Full-Stack Developer",
        "responsibilities": ["API development", "Frontend"],
        "required_skills": ["React", "Node.js"],
        "commitment": "full-time"
      }
    ],
    "tools_and_technology": [
      {
        "tool": "React Native",
        "purpose": "Mobile app development",
        "cost": "Free"
      }
    ]
  },
  "risks": [
    {
      "risk": "Market competition",
      "category": "market",
      "probability": "high",
      "impact": "high",
      "mitigation": "Focus on unique value proposition",
      "contingency": "Pivot to niche market"
    }
  ],
  "success_metrics": {
    "kpis": [
      {
        "metric": "User Acquisition",
        "target": "1000 users",
        "measurement": "App downloads",
        "frequency": "weekly"
      }
    ]
  },
  "timeline": {
    "start_date": "TBD",
    "estimated_completion": "6 months",
    "critical_path": ["Development", "Testing", "Launch"],
    "buffer_time": "2 weeks"
  },
  "next_steps": [
    "Finalize requirements",
    "Assemble development team",
    "Set up infrastructure"
  ]
}
```

## Configuration

### Model Settings

```javascript
MODEL: 'gemini-2.0-flash-exp'
FALLBACK_MODEL: 'gemini-2.5-flash'
TEMPERATURE_BRAINSTORM: 0.8  // Creative
TEMPERATURE_PLANNING: 0.6     // Structured
MAX_OUTPUT_TOKENS: 16384
```

### File Upload Limits

```javascript
MAX_FILE_SIZE: 10MB
SUPPORTED_FORMATS: ['.pdf', '.docx', '.doc', '.txt', '.xlsx', '.xls']
```

## Usage Examples

### Example 1: Startup Business Plan

```bash
curl -X POST http://localhost:5000/api/v1/plan-generator/generate \
  -H "Content-Type: application/json" \
  -d '{
    "idea": "Create a sustainable fashion e-commerce platform",
    "planType": "startup_plan",
    "complexity": "complex",
    "planDepth": "strategic",
    "constraints": {
      "budget": 100000,
      "timeline": "12 months",
      "teamSize": 8
    }
  }'
```

### Example 2: Conversational Planning

```bash
# Step 1: Start conversation
curl -X POST http://localhost:5000/api/v1/plan-generator/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I want to organize a tech conference"
  }'

# Step 2: Continue conversation (use returned conversationId)
curl -X POST http://localhost:5000/api/v1/plan-generator/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "It will be for 500 people over 2 days",
    "conversationId": "plan_1234567890_abc123"
  }'
```

### Example 3: Brainstorm & Export

```bash
# Brainstorm
curl -X POST http://localhost:5000/api/v1/plan-generator/brainstorm \
  -H "Content-Type: application/json" \
  -d '{
    "idea": "Launch a mobile fitness app",
    "aspects": ["swot_analysis", "market_analysis"]
  }'
```

## Integration

### Add to Main Routes

```javascript
// In src/app/routes/index.js
import { planGeneratorRoutes } from '../modules/plan_generator/plan_generator.route.js';

const router = express.Router();

const moduleRoutes = [
  // ... existing routes
  {
    path: '/plan-generator',
    route: planGeneratorRoutes,
  },
];
```

## Best Practices

1. **Start Conversational**: Use `/assistant` endpoint for best results
2. **Provide Context**: More details = better plans
3. **Iterate**: Refine plans through conversation
4. **Use Constraints**: Specify budget, timeline, team size for realistic plans
5. **Export Early**: Save plans in multiple formats
6. **Track Conversations**: Store conversationId for future reference

## Error Handling

All endpoints return standardized error responses:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Error description",
  "errorMessages": [
    {
      "path": "field",
      "message": "Specific error"
    }
  ]
}
```

## Rate Limits

- `/assistant`: 30 requests / 15 minutes
- `/generate`: 20 requests / 15 minutes
- `/brainstorm`: 30 requests / 15 minutes
- `/export`: 20 requests / 15 minutes

## Dependencies

- `@google/generative-ai`: Gemini AI integration
- `multer`: File upload handling
- `zod`: Validation
- Conversation module for history management
- Payment module for subscription limits

## Future Enhancements

- [ ] Gantt chart visualization
- [ ] Budget calculator
- [ ] Team collaboration features
- [ ] Plan templates library
- [ ] Real-time progress tracking
- [ ] Integration with project management tools
- [ ] Advanced analytics & insights

## Support

For issues or questions, refer to:
- [QUICKSTART.md](./QUICKSTART.md) for quick implementation guide
- API documentation in `/docs`
- Example Postman collection in `/postman_collections`
