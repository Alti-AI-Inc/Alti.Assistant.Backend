# Legal Contract Generation Module

## Overview

The Legal Contract Generation module is an AI-powered system that creates professional legal contracts through an intelligent conversational interface. The AI generates essential questions based on the contract type and user context, ensuring all necessary information is collected before generating a comprehensive, legally-formatted contract.

## Features

- **Conversational Interface**: Natural language interaction for contract creation
- **AI-Generated Questions**: Smart question generation based on context and contract type
- **File Upload Support**: Upload reference documents (.pdf, .docx, .doc, .txt) for context
- **Multiple Contract Types**: Support for 13+ contract types including employment, NDA, service agreements, etc.
- **Flexible Output**: Generate contracts as text (with future support for DOCX and PDF)
- **Guest & Authenticated Users**: Works for both logged-in users and guests
- **Conversation History**: Full conversation tracking and retrieval
- **Contract Modification**: Request changes to generated contracts
- **Smart Question Limiting**: AI asks only 2-5 essential questions to avoid user frustration

## Supported Contract Types

- **Employment**: Employment agreements and offer letters
- **NDA**: Non-disclosure agreements (mutual and one-way)
- **Service Agreement**: Professional services contracts
- **Freelance**: Independent contractor agreements
- **Consulting**: Consulting engagement agreements
- **Lease**: Rental and lease agreements
- **Partnership**: Business partnership agreements
- **Sales**: Sales and purchase agreements
- **License**: Software and IP licensing agreements
- **Vendor**: Vendor and supplier agreements
- **Loan**: Loan agreements
- **Independent Contractor**: IC agreements
- **General**: Custom general-purpose contracts

## API Endpoints

### 1. Conversational Assistant (Main Entry Point)

**Endpoint:** `POST /api/v1/legal-contract/assistant`

**Authentication:** Optional (supports both guests and authenticated users)

**Request:**

```javascript
// Form Data
{
  "message": "I need to create an employment contract for a software developer",
  "conversationId": "contract_123...", // Optional - for continuing conversation
  "userId": "guest_user_id", // Optional - for guest users
  "outputFormat": "text", // Optional: text, docx, pdf
  "file": <file> // Optional - Reference document
}
```

**Response:**

```json
{
  "success": true,
  "message": "Request processed successfully",
  "data": {
    "conversationId": "contract_1234567890_abc123",
    "response": "I'll help you create an employment contract. Let me ask a few essential questions...",
    "questions": [
      {
        "id": "q1",
        "question": "What is the employer's full legal name and address?",
        "reason": "Required for legal entity identification",
        "type": "text"
      },
      {
        "id": "q2",
        "question": "What is the job title and position description?",
        "reason": "Defines the employment role and responsibilities",
        "type": "text"
      }
      // ... more questions
    ],
    "contractType": "employment",
    "summary": "I'll create an employment contract for a software developer position",
    "needsMoreInfo": true,
    "contractGenerated": false
  }
}
```

### 2. Continue Conversation (Answer Questions)

**Endpoint:** `POST /api/v1/legal-contract/assistant`

**Request:**

```javascript
// Form Data
{
  "message": "The employer is TechCorp Inc. at 123 Tech St, San Francisco. The position is Senior Software Developer with a salary of $120,000/year starting January 1, 2024.",
  "conversationId": "contract_1234567890_abc123"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Request processed successfully",
  "data": {
    "conversationId": "contract_1234567890_abc123",
    "response": "I have generated your legal contract based on the information provided...",
    "contract": "EMPLOYMENT AGREEMENT\n\nThis Employment Agreement...",
    "contractType": "employment",
    "needsMoreInfo": false,
    "contractGenerated": true
  }
}
```

### 3. Direct Contract Generation

**Endpoint:** `POST /api/v1/legal-contract/generate`

**Authentication:** Optional

**Request:**

```json
{
  "contractType": "employment",
  "complexity": "standard",
  "jurisdiction": "us_federal",
  "outputFormat": "text",
  "parties": [
    {
      "name": "TechCorp Inc.",
      "role": "employer",
      "address": "123 Tech Street, San Francisco, CA 94105",
      "email": "hr@techcorp.com"
    },
    {
      "name": "John Doe",
      "role": "employee",
      "address": "456 Main Street, San Francisco, CA 94102",
      "email": "john.doe@email.com"
    }
  ],
  "terms": {
    "position": "Senior Software Developer",
    "startDate": "January 1, 2024",
    "salary": "$120,000 per year",
    "benefits": "Health insurance, 401k, paid time off"
  },
  "additionalInstructions": "Include non-compete clause",
  "includeBoilerplate": true
}
```

### 4. Get Conversation History

**Endpoint:** `GET /api/v1/legal-contract/conversation/:conversationId`

**Authentication:** Required

**Response:**

```json
{
  "success": true,
  "data": {
    "conversationId": "contract_1234567890_abc123",
    "title": "Legal Contract: Employment",
    "messages": [
      {
        "role": "user",
        "content": "I need an employment contract",
        "timestamp": "2024-01-01T10:00:00Z"
      }
      // ... more messages
    ],
    "metadata": {
      "contractType": "employment",
      "contractGenerated": true,
      "questions": [...],
      "answers": {...}
    }
  }
}
```

### 5. Download Contract

**Endpoint:** `GET /api/v1/legal-contract/download/:conversationId?format=text`

**Authentication:** Required

**Query Parameters:**

- `format`: text, docx, or pdf (currently only text supported)

**Response:** File download

### 6. Modify Contract

**Endpoint:** `POST /api/v1/legal-contract/modify`

**Authentication:** Required

**Request:**

```json
{
  "conversationId": "contract_1234567890_abc123",
  "modifications": "Add a remote work policy section and increase vacation to 20 days"
}
```

## Usage Examples

### Example 1: Create Employment Contract

```javascript
// Step 1: Initial request
POST /api/v1/legal-contract/assistant
FormData: {
  message: "I need an employment contract for a senior developer"
}

// AI responds with essential questions

// Step 2: Provide answers
POST /api/v1/legal-contract/assistant
FormData: {
  message: "Employer: TechCorp Inc., Position: Senior Developer, Salary: $120k, Start: Jan 1",
  conversationId: "contract_xxx"
}

// AI generates the complete contract
```

### Example 2: NDA with Reference Document

```javascript
POST /api/v1/legal-contract/assistant
FormData: {
  message: "Create a mutual NDA for a business partnership",
  file: <uploaded-reference-nda.pdf>
}

// AI analyzes the uploaded document and asks relevant questions
```

### Example 3: Quick Service Agreement

```javascript
POST /api/v1/legal-contract/generate
{
  "contractType": "service_agreement",
  "parties": [...],
  "terms": {
    "services": "Web development and design",
    "payment": "$5000 upon completion",
    "timeline": "30 days"
  }
}
```

## Configuration

Located in `legal_contract.constant.js`:

```javascript
export const LEGAL_CONTRACT_CONFIG = {
  MODEL: 'gemini-2.5-flash',
  TEMPERATURE: 0.3,
  MAX_OUTPUT_TOKENS: 8192,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_QUESTIONS: 5, // Maximum questions to ask
  MIN_QUESTIONS: 2, // Minimum before generating
};
```

## File Structure

```
src/app/modules/legal_contract/
├── legal_contract.constant.js      # Configuration and constants
├── legal_contract.validation.js    # Zod validation schemas
├── legal_contract.service.js       # Core business logic
├── legal_contract.controller.js    # Request handlers
├── legal_contract.route.js         # API route definitions
└── middlewares/
    └── uploadLegalContract.js      # File upload middleware
```

## How It Works

1. **User Request**: User sends a natural language request with optional file
2. **Intent Analysis**: AI analyzes the request and identifies contract type
3. **Question Generation**: AI generates 2-5 essential questions based on:
   - Contract type requirements
   - Uploaded document context
   - Conversation history
4. **Answer Collection**: User provides answers through conversation
5. **Contract Generation**: Once minimum questions answered, AI generates contract
6. **Review & Modify**: User can request modifications or download

## Smart Question Generation

The AI dynamically generates questions based on:

- **Contract Type**: Different questions for employment vs. NDA vs. service agreements
- **Context**: Uploaded documents reduce questions needed
- **Conversation History**: Avoids re-asking for information already provided
- **Legal Requirements**: Focuses on legally essential information

Example for Employment Contract:

```javascript
{
  "questions": [
    {
      "id": "q1",
      "question": "What is the employer's full legal name and registered address?",
      "reason": "Required for legal entity identification in the contract",
      "type": "text"
    },
    {
      "id": "q2",
      "question": "What is the employee's job title and start date?",
      "reason": "Essential for defining the employment relationship",
      "type": "text"
    },
    {
      "id": "q3",
      "question": "What is the compensation structure (salary/hourly rate and frequency)?",
      "reason": "Required for payment terms",
      "type": "text"
    }
  ]
}
```

## Legal Disclaimer

⚠️ **IMPORTANT**: All contracts generated by this AI system are **draft templates only** and should be reviewed by a qualified attorney before use. The AI cannot provide legal advice and generated contracts may not be suitable for all jurisdictions or circumstances.

## Testing

Use the provided Postman collection: `postman_collections/Legal_Contract_API.postman_collection.json`

Test scenarios:

1. Create employment contract from scratch
2. Generate NDA with uploaded reference document
3. Quick freelance contract with direct generation
4. Modify existing contract
5. Download contract in text format

## Future Enhancements

- [ ] DOCX and PDF export functionality
- [ ] Multi-party contract support
- [ ] Template library for quick starts
- [ ] Version control for contract revisions
- [ ] E-signature integration
- [ ] Advanced jurisdiction-specific clauses
- [ ] Contract comparison tool
- [ ] Automated clause suggestions

## Dependencies

- `@google/generative-ai`: AI model for contract generation
- `pdf-parse`: PDF text extraction
- `mammoth`: Word document processing
- `multer`: File upload handling
- `zod`: Schema validation

## Error Handling

The module includes comprehensive error handling:

- Invalid file types/sizes
- Missing required information
- AI generation failures
- Conversation not found
- Subscription limit exceeded

## Contributing

When adding new contract types:

1. Add type to `CONTRACT_TYPES`
2. Create system prompt in `SYSTEM_PROMPTS`
3. Update validation schema
4. Add examples to Postman collection

## Support

For issues or questions:

- Check conversation history for context
- Review generated questions for clarity
- Ensure file uploads meet size/type requirements
- Verify subscription limits for authenticated users
