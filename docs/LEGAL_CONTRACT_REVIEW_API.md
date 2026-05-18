# Legal Contract Review API

A comprehensive AI-powered legal contract review module that analyzes contracts, identifies risks, evaluates clauses, and provides actionable recommendations.

## 🎯 Features

- **Conversational Contract Review**: Natural language interface for contract analysis
- **Multiple Review Types**:

  - General comprehensive review
  - Clause-by-clause analysis
  - Risk assessment with severity levels
  - Compliance checking
  - Fairness evaluation
  - Terminology review
  - Amendment suggestions
  - Contract comparison
  - Executive summary generation

- **Flexible Input Methods**:

  - Upload contract files (PDF, DOCX, DOC, TXT)
  - Paste contract text directly
  - Use cached contracts from previous conversations

- **Intelligent Analysis**:

  - AI-powered intent detection
  - Context-aware conversation handling
  - Automatic parameter extraction
  - Multi-turn conversation support

- **Output Formats**:
  - Plain text (default)
  - Markdown
  - PDF-ready format
  - DOCX-ready format

## 📋 API Endpoints

### 1. Conversational Assistant (Recommended)

**POST** `/api/legal-contract-review/assistant`

The main endpoint for natural language contract review requests.

#### Request

```javascript
// With file upload (multipart/form-data)
{
  "message": "Please review this employment contract and identify any red flags",
  "conversationId": "contract_review_1234567890_abc123", // optional
  "userId": "user123", // optional for guest users
  "outputFormat": "text" // optional: text, markdown, pdf, docx
}
// + file: contract.pdf

// With pasted text (application/json)
{
  "message": "This Employment Agreement is made between Company X and Employee Y...",
  "conversationId": "contract_review_1234567890_abc123", // optional
  "outputFormat": "markdown"
}
```

#### Response

```json
{
  "success": true,
  "message": "Request processed successfully",
  "data": {
    "conversationId": "contract_review_1234567890_abc123",
    "response": "## Legal Contract Review\n\n### Executive Summary\n...",
    "contractInfo": {
      "filename": "employment_contract.pdf",
      "size": 125840,
      "contentLength": 15420,
      "publicUrl": "https://storage.googleapis.com/...",
      "contractId": "contract_1234567890_xyz789"
    },
    "reviewParams": {
      "reviewType": "general_review",
      "reviewDepth": "standard",
      "contractType": "employment",
      "aspects": ["obligations", "rights", "liabilities", "termination"]
    },
    "outputFormat": "text",
    "needsContract": false,
    "needsMoreInfo": false
  }
}
```

### 2. Direct Review Endpoint

**POST** `/api/legal-contract-review/review`

Programmatic endpoint with explicit parameters (no conversation).

#### Request

```javascript
{
  "reviewType": "risk_assessment",
  "reviewDepth": "detailed",
  "contractType": "nda",
  "aspects": [
    "confidentiality",
    "obligations",
    "termination",
    "liabilities"
  ],
  "additionalInstructions": "Focus on non-compete clauses",
  "outputFormat": "markdown"
}
// + file: nda_contract.pdf
```

#### Response

```json
{
  "success": true,
  "message": "Contract review completed successfully",
  "data": {
    "success": true,
    "review": "# Legal Contract Risk Assessment\n\n## Risk Matrix\n...",
    "contractInfo": {
      "filename": "nda_contract.pdf",
      "size": 89234,
      "contentLength": 8920
    },
    "reviewParams": {
      "reviewType": "risk_assessment",
      "reviewDepth": "detailed",
      "contractType": "nda",
      "aspects": [
        "confidentiality",
        "obligations",
        "termination",
        "liabilities"
      ]
    },
    "outputFormat": "markdown"
  }
}
```

### 3. Get Conversation History

**GET** `/api/legal-contract-review/conversation/:conversationId`

Retrieve all messages and metadata from a contract review conversation.

#### Response

```json
{
  "success": true,
  "message": "Conversation history retrieved successfully",
  "data": {
    "conversationId": "contract_review_1234567890_abc123",
    "title": "Legal Contract Review: Please review this employment...",
    "messages": [
      {
        "role": "user",
        "content": "Please review this employment contract",
        "timestamp": "2025-12-29T10:30:00.000Z",
        "metadata": { "hasFile": true }
      },
      {
        "role": "assistant",
        "content": "I've completed the contract review...",
        "timestamp": "2025-12-29T10:30:45.000Z",
        "metadata": {
          "reviewParams": {...},
          "contractInfo": {...}
        }
      }
    ],
    "metadata": {
      "category": "legal_contract_review",
      "model": "gemini-2.5-flash",
      "collectedParams": {...}
    },
    "contracts_metadata": {
      "currentContractId": "contract_1234567890_xyz789",
      "contracts": [...]
    },
    "createdAt": "2025-12-29T10:29:00.000Z",
    "updatedAt": "2025-12-29T10:30:45.000Z"
  }
}
```

## 🔧 Request Parameters

### Review Types

- `general_review` - Comprehensive legal contract review (default)
- `clause_analysis` - Detailed clause-by-clause analysis
- `risk_assessment` - Risk identification and severity assessment
- `compliance_check` - Legal compliance and regulatory review
- `fairness_evaluation` - Fairness and balance assessment
- `terminology_check` - Legal terminology review
- `amendment_suggestions` - Suggested contract improvements
- `comparison` - Compare multiple contracts
- `summary` - Executive summary generation

### Review Depth

- `quick` - Quick overview of key clauses and red flags
- `standard` - Comprehensive review (default)
- `detailed` - Detailed clause-by-clause analysis
- `comprehensive` - Most thorough analysis with risk matrix

### Contract Types

- `employment` - Employment contracts
- `nda` - Non-disclosure agreements
- `service_agreement` - Service agreements
- `sales` - Sales contracts
- `lease` - Lease agreements
- `partnership` - Partnership agreements
- `licensing` - Licensing agreements
- `purchase` - Purchase agreements
- `vendor` - Vendor contracts
- `independent_contractor` - Independent contractor agreements
- `franchise` - Franchise agreements
- `general` - General contracts (default)

### Reviewable Aspects

- `obligations` - Party obligations
- `rights` - Rights and entitlements
- `liabilities` - Liability provisions
- `termination` - Termination clauses
- `payment_terms` - Payment and pricing terms
- `confidentiality` - Confidentiality provisions
- `intellectual_property` - IP rights and ownership
- `indemnification` - Indemnification clauses
- `dispute_resolution` - Dispute resolution mechanisms
- `force_majeure` - Force majeure provisions
- `governing_law` - Governing law and jurisdiction
- `warranties` - Warranties and representations
- `jurisdiction` - Jurisdictional provisions
- `notice_provisions` - Notice requirements

### Output Formats

- `text` - Plain text (default)
- `markdown` - Markdown formatted
- `pdf` - PDF-ready format
- `docx` - DOCX-ready format

## 💡 Usage Examples

### Example 1: Quick Review of NDA

```bash
curl -X POST http://localhost:80/api/legal-contract-review/assistant \
  -H "Content-Type: multipart/form-data" \
  -F "message=Please give me a quick review of this NDA" \
  -F "file=@nda_contract.pdf" \
  -F "outputFormat=text"
```

### Example 2: Detailed Risk Assessment

```bash
curl -X POST http://localhost:80/api/legal-contract-review/assistant \
  -H "Content-Type: multipart/form-data" \
  -F "message=I need a detailed risk assessment of this service agreement with focus on liabilities and termination clauses" \
  -F "file=@service_agreement.docx" \
  -F "outputFormat=markdown"
```

### Example 3: Review Pasted Contract Text

```bash
curl -X POST http://localhost:80/api/legal-contract-review/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "EMPLOYMENT AGREEMENT\n\nThis Employment Agreement is entered into...",
    "outputFormat": "text"
  }'
```

### Example 4: Continue Previous Conversation

```bash
curl -X POST http://localhost:80/api/legal-contract-review/assistant \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Can you also check the non-compete clause?",
    "conversationId": "contract_review_1234567890_abc123"
  }'
```

### Example 5: Direct Review with Explicit Parameters

```bash
curl -X POST http://localhost:80/api/legal-contract-review/review \
  -H "Content-Type: multipart/form-data" \
  -F "reviewType=compliance_check" \
  -F "reviewDepth=comprehensive" \
  -F "contractType=employment" \
  -F "aspects[]=obligations" \
  -F "aspects[]=termination" \
  -F "aspects[]=confidentiality" \
  -F "outputFormat=markdown" \
  -F "file=@employment_contract.pdf"
```

## 🔐 Authentication

- **Optional Authentication**: The assistant endpoint works for both authenticated users and guests
- **Rate Limiting**: 30 requests per 15 minutes (can be adjusted)
- **Subscription Limits**: Authenticated users are subject to their subscription plan limits

### Guest Usage

Guests can use the API without authentication by omitting auth headers. A temporary userId will be generated.

### Authenticated Usage

Include the authentication token in headers:

```bash
curl -X POST http://localhost:80/api/legal-contract-review/assistant \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: multipart/form-data" \
  -F "message=Review this contract" \
  -F "file=@contract.pdf"
```

## 📝 Response Structure

### Successful Review Response

All reviews include a legal disclaimer and comprehensive analysis structured as:

1. **Executive Summary** - Key findings overview
2. **Contract Overview** - Parties, purpose, key terms
3. **Critical Clauses Analysis** - Important provisions breakdown
4. **Risk Assessment** - Identified risks with severity levels
5. **Obligations and Liabilities** - What each party must do/risks
6. **Rights and Protections** - Entitlements and safeguards
7. **Termination and Dispute Resolution** - Exit strategies and conflict resolution
8. **Recommendations and Red Flags** - Actionable advice
9. **Overall Assessment** - Final evaluation
10. **Legal Disclaimer** - Professional advice reminder

## 🚨 Error Handling

### Common Errors

#### 400 Bad Request

```json
{
  "success": false,
  "message": "Message is required"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "You have reached your legal contract review limit for this month. Please upgrade your plan to continue."
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Conversation not found"
}
```

#### 413 Payload Too Large

```json
{
  "success": false,
  "message": "File size exceeds maximum limit of 10MB"
}
```

#### 500 Internal Server Error

```json
{
  "success": false,
  "message": "Failed to review contract: [error details]"
}
```

## 🎨 Best Practices

1. **Use Conversational Endpoint**: For most use cases, use the `/assistant` endpoint with natural language
2. **Provide Context**: Include relevant details about your concerns or focus areas
3. **Specify Contract Type**: Helps the AI apply industry-specific standards
4. **Use Conversations**: Maintain conversationId for follow-up questions
5. **Choose Appropriate Depth**: Use `quick` for overviews, `comprehensive` for critical contracts
6. **Request Specific Aspects**: Focus on relevant clauses to get targeted analysis
7. **Check Output Format**: Use markdown or PDF-ready formats for better presentation

## ⚖️ Legal Disclaimer

**IMPORTANT**: This API provides legal information and analysis for educational and informational purposes only. It does NOT constitute legal advice and should not be relied upon as a substitute for consultation with a qualified attorney. For specific legal matters, always consult with a licensed attorney in your jurisdiction.

## 🔄 Conversation Flow

1. **Initial Request**: User uploads contract or pastes text with review request
2. **AI Analysis**: System analyzes intent, extracts parameters, and performs review
3. **Response**: Comprehensive review with findings and recommendations
4. **Follow-up**: User can ask clarifying questions or request additional analysis
5. **Cached Context**: Previous contract and conversation are remembered

## 📊 File Support

### Supported Formats

- PDF (`.pdf`)
- Word Documents (`.docx`, `.doc`)
- Plain Text (`.txt`)

### File Limits

- Maximum file size: 10MB
- Text extraction with OCR support for scanned PDFs
- Automatic caching of extracted text for conversation continuity

## 🚀 Integration Example (JavaScript)

```javascript
const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');

async function reviewContract(filePath, message) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('message', message);
  form.append('outputFormat', 'markdown');

  const response = await axios.post(
    'http://localhost:80/api/legal-contract-review/assistant',
    form,
    {
      headers: {
        ...form.getHeaders(),
        Authorization: 'Bearer YOUR_TOKEN',
      },
    }
  );

  return response.data;
}

// Usage
const result = await reviewContract(
  './contracts/employment.pdf',
  'Analyze this employment contract for potential risks and unfair clauses'
);

console.log(result.data.response);
```

## 📞 Support

For issues, questions, or feature requests, please contact the development team.

---

**Version**: 1.0.0  
**Last Updated**: December 29, 2025  
**Model**: Gemini 2.5 Flash  
**Category**: Legal Services
