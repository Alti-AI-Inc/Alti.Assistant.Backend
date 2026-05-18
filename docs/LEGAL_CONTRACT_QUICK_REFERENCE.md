# Legal Contract Module - Quick Reference

## Quick Start

### 1. Basic Employment Contract

```bash
curl -X POST http://localhost:5000/api/v1/legal-contract/assistant \
  -F "message=I need an employment contract for a software engineer"
```

### 2. Continue with Answers

```bash
curl -X POST http://localhost:5000/api/v1/legal-contract/assistant \
  -F "message=Company: TechCorp, Position: Developer, Salary: $100k, Start: Jan 1" \
  -F "conversationId=contract_xxx"
```

## Endpoints Summary

| Method | Endpoint                           | Auth     | Description                      |
| ------ | ---------------------------------- | -------- | -------------------------------- |
| POST   | `/legal-contract/assistant`        | Optional | Main conversational endpoint     |
| POST   | `/legal-contract/generate`         | Optional | Direct generation (no questions) |
| GET    | `/legal-contract/conversation/:id` | Required | Get conversation history         |
| GET    | `/legal-contract/download/:id`     | Required | Download contract file           |
| POST   | `/legal-contract/modify`           | Required | Modify existing contract         |

## Supported Contract Types

| Type                     | Description               | Use Case                     |
| ------------------------ | ------------------------- | ---------------------------- |
| `employment`             | Employment agreements     | Hiring employees             |
| `nda`                    | Non-disclosure agreements | Protecting confidential info |
| `service_agreement`      | Service contracts         | Professional services        |
| `freelance`              | Freelancer contracts      | Independent contractors      |
| `consulting`             | Consulting agreements     | Advisory services            |
| `lease`                  | Rental agreements         | Property leasing             |
| `partnership`            | Partnership agreements    | Business partnerships        |
| `sales`                  | Sales contracts           | Buying/selling goods         |
| `license`                | License agreements        | Software/IP licensing        |
| `vendor`                 | Vendor agreements         | Supplier contracts           |
| `loan`                   | Loan agreements           | Lending money                |
| `independent_contractor` | IC agreements             | Contractor relationships     |
| `general`                | General purpose           | Custom contracts             |

## Response Flow

```
User Request
    ↓
AI Analyzes Intent
    ↓
Generates 2-5 Essential Questions
    ↓
User Provides Answers
    ↓
AI Generates Contract
    ↓
User Can Download/Modify
```

## Key Features

✅ **Smart Questions**: AI asks only essential questions (2-5 max)  
✅ **File Upload**: Analyze reference documents for context  
✅ **Guest Mode**: Works without authentication  
✅ **Conversation History**: Full tracking of interactions  
✅ **Multiple Formats**: Text (DOCX/PDF coming soon)  
✅ **Modification**: Request changes to generated contracts

## Configuration

```javascript
// Default settings
{
  model: 'gemini-2.5-flash',
  temperature: 0.3,
  maxQuestions: 5,
  minQuestions: 2,
  maxFileSize: 10MB,
  supportedFormats: ['.pdf', '.docx', '.doc', '.txt']
}
```

## Example Question Flow

**User**: "I need an employment contract"

**AI**: "I'll help you create an employment contract. I need to ask a few essential questions:

1. What is the employer's full legal name and address?
2. What is the employee's job title and compensation?
3. What is the employment start date and duration?"

**User**: "TechCorp Inc. at 123 Main St, Developer role, $100k/year, starts Jan 1, 2024"

**AI**: "✅ Contract generated successfully!"

## Common Use Cases

### 1. Startup Hiring

```javascript
contractType: 'employment';
complexity: 'standard';
jurisdiction: 'us_state';
```

### 2. Business Partnership

```javascript
contractType: 'partnership';
complexity: 'detailed';
jurisdiction: 'international';
```

### 3. Freelance Project

```javascript
contractType: 'freelance';
complexity: 'simple';
jurisdiction: 'us_federal';
```

### 4. Software License

```javascript
contractType: 'license';
complexity: 'standard';
jurisdiction: 'international';
```

## Error Handling

| Error                  | Status | Solution                       |
| ---------------------- | ------ | ------------------------------ |
| File too large         | 413    | Reduce file size to <10MB      |
| Invalid format         | 400    | Use .pdf, .docx, .doc, or .txt |
| Missing message        | 400    | Provide message field          |
| Conversation not found | 404    | Check conversation ID          |
| Limit exceeded         | 403    | Upgrade subscription           |

## Best Practices

1. **Be Specific**: Provide detailed information in your initial request
2. **Upload Context**: Include reference documents when available
3. **Answer Completely**: Provide all requested information in one message
4. **Review Carefully**: Always have contracts reviewed by legal counsel
5. **Save Conversation ID**: Keep it for future modifications

## Legal Disclaimer

⚠️ **IMPORTANT**: Generated contracts are draft templates only. Always consult a qualified attorney before use.

## Testing

Run test suite:

```bash
node scripts/test-legal-contract.js
```

Import Postman collection:

```
postman_collections/Legal_Contract_API.postman_collection.json
```

## Module Structure

```
legal_contract/
├── legal_contract.constant.js    # Config & prompts
├── legal_contract.validation.js  # Request validation
├── legal_contract.service.js     # Core logic
├── legal_contract.controller.js  # HTTP handlers
├── legal_contract.route.js       # API routes
└── middlewares/
    └── uploadLegalContract.js    # File upload
```

## Integration Example

```javascript
import axios from 'axios';
import FormData from 'form-data';

async function createContract(userMessage, conversationId = null) {
  const formData = new FormData();
  formData.append('message', userMessage);

  if (conversationId) {
    formData.append('conversationId', conversationId);
  }

  const response = await axios.post(
    'http://localhost:5000/api/v1/legal-contract/assistant',
    formData,
    { headers: formData.getHeaders() }
  );

  return response.data;
}
```

## Support

📖 Full Documentation: `docs/LEGAL_CONTRACT_API.md`  
🧪 Test Script: `scripts/test-legal-contract.js`  
📮 Postman Collection: `postman_collections/Legal_Contract_API.postman_collection.json`

## Future Features

- [ ] DOCX/PDF export
- [ ] Multi-language support
- [ ] Contract templates library
- [ ] Version control
- [ ] E-signature integration
- [ ] Jurisdiction-specific clauses
