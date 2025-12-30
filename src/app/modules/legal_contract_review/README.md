# Legal Contract Review Module

AI-powered legal contract review system with intelligent conversation handling, risk assessment, and comprehensive analysis capabilities.

## Overview

This module provides a conversational AI assistant for reviewing legal contracts. Users can upload contract files or paste contract text and receive detailed analysis including risk assessment, clause evaluation, compliance checking, and actionable recommendations.

## Key Features

✅ **Multiple Review Types**: General review, risk assessment, clause analysis, compliance check, fairness evaluation, terminology review, amendment suggestions  
✅ **Flexible Input**: Upload files (PDF, DOCX, DOC, TXT) or paste contract text  
✅ **Conversational Interface**: Natural language requests with context-aware responses  
✅ **Intelligent Analysis**: AI-powered intent detection and parameter extraction  
✅ **Cached Context**: Remembers contracts and conversation history  
✅ **Multiple Output Formats**: Text, Markdown, PDF-ready, DOCX-ready  
✅ **Guest Support**: Works with or without authentication  
✅ **Risk Assessment**: Identifies risks with severity levels  
✅ **Contract Types**: Specialized analysis for employment, NDA, service agreements, etc.

## Module Structure

```
legal_contract_review/
├── legal_contract_review.constant.js      # Configuration, prompts, intents
├── legal_contract_review.validation.js    # Request validation schemas
├── legal_contract_review.service.js       # Core business logic
├── legal_contract_review.controller.js    # HTTP request handlers
├── legal_contract_review.route.js         # API endpoints
├── middlewares/
│   └── uploadLegalContractReview.js       # File upload handling
└── services/
    └── legalContractAnalyzer.js           # Intent analysis service
```

## API Endpoints

### 1. Conversational Assistant (Main Endpoint)
`POST /api/legal-contract-review/assistant`

Natural language interface for contract review.

**Features**:
- Supports file upload or text input
- Maintains conversation context
- Intelligent intent detection
- Works for authenticated and guest users

### 2. Direct Review
`POST /api/legal-contract-review/review`

Programmatic endpoint with explicit parameters.

**Features**:
- Direct parameter specification
- No conversation required
- Suitable for API integrations

### 3. Get Conversation History
`GET /api/legal-contract-review/conversation/:conversationId`

Retrieve complete conversation with metadata.

## Usage Examples

### Quick Review
```bash
POST /api/legal-contract-review/assistant
{
  "message": "Review this employment contract for red flags",
  "file": <contract.pdf>
}
```

### Risk Assessment
```bash
POST /api/legal-contract-review/assistant
{
  "message": "Perform a detailed risk assessment of this NDA with focus on confidentiality and liabilities",
  "file": <nda.pdf>,
  "outputFormat": "markdown"
}
```

### Continue Conversation
```bash
POST /api/legal-contract-review/assistant
{
  "message": "What about the termination clause?",
  "conversationId": "contract_review_1234567890_abc123"
}
```

## Configuration

### Environment Variables
Ensure these are set in your `env.yaml`:
- `GEMINI_API_KEY` - Google Gemini API key for AI analysis
- GCS credentials (if using cloud storage)

### Constants
All configurations are in `legal_contract_review.constant.js`:
- Model: `gemini-2.5-flash`
- Temperature: `0.5` (lower for precise legal analysis)
- Max file size: `10MB`
- Supported formats: PDF, DOCX, DOC, TXT

## Review Types

| Type | Description | Use Case |
|------|-------------|----------|
| `general_review` | Comprehensive analysis | Initial contract review |
| `clause_analysis` | Clause-by-clause breakdown | Detailed clause examination |
| `risk_assessment` | Risk identification & severity | Due diligence, risk management |
| `compliance_check` | Legal compliance review | Regulatory requirements |
| `fairness_evaluation` | Balance & fairness assessment | Negotiation preparation |
| `terminology_check` | Legal terminology review | Clarity improvement |
| `amendment_suggestions` | Improvement recommendations | Contract negotiation |
| `summary` | Executive summary | Quick overview |

## Contract Types

Specialized analysis for:
- Employment contracts
- NDAs (Non-Disclosure Agreements)
- Service agreements
- Sales contracts
- Lease agreements
- Partnership agreements
- Licensing agreements
- Purchase agreements
- Vendor contracts
- Independent contractor agreements
- Franchise agreements

## Technical Details

### Dependencies
- `@google/generative-ai` - AI analysis
- `mongoose` - Database operations
- `multer` - File upload handling
- `zod` - Request validation
- File processor service (shared with document_review)

### Integration Points
- **Conversation Service**: Manages conversation state and history
- **File Processor**: Handles file upload, text extraction, and GCS storage
- **Subscription Service**: Checks usage limits for authenticated users

### AI Analysis
Uses Gemini 2.5 Flash with specialized prompts for:
- Intent detection and parameter extraction
- Contract review and analysis
- Risk assessment with severity classification
- Clause interpretation and explanation
- Amendment suggestions

### Caching Strategy
- Extracted contract text is cached in conversation metadata
- Avoids re-processing files on follow-up questions
- Maximum cached text: 1MB (configurable)
- Larger texts are truncated with warning

## Response Structure

All successful reviews include:
1. Executive Summary
2. Contract Overview
3. Critical Clauses Analysis
4. Risk Assessment
5. Obligations and Liabilities
6. Rights and Protections
7. Termination and Dispute Resolution
8. Recommendations and Red Flags
9. Overall Assessment
10. Legal Disclaimer

## Error Handling

The module handles:
- Invalid file formats
- File size limits
- Text extraction failures
- Subscription limits
- Conversation not found
- API failures with graceful fallbacks

## Testing

### Postman Collection
Import: `postman_collections/Legal_Contract_Review_API.postman_collection.json`

Includes test cases for:
- All review types
- File upload and text input
- Conversation continuity
- Error scenarios

### Manual Testing
```bash
# Test with file
curl -X POST http://localhost:80/api/legal-contract-review/assistant \
  -F "message=Review this contract" \
  -F "file=@test_contract.pdf"

# Test with text
curl -X POST http://localhost:80/api/legal-contract-review/assistant \
  -H "Content-Type: application/json" \
  -d '{"message": "EMPLOYMENT AGREEMENT\n\nThis Agreement..."}'
```

## Documentation

- **Full API Documentation**: `docs/LEGAL_CONTRACT_REVIEW_API.md`
- **Quick Reference**: `docs/LEGAL_CONTRACT_REVIEW_QUICK_REFERENCE.md`
- **Postman Collection**: `postman_collections/Legal_Contract_Review_API.postman_collection.json`

## Security & Privacy

- Optional authentication (works for guests and users)
- Subscription-based usage limits for authenticated users
- Rate limiting: 30 requests per 15 minutes
- Files stored securely in GCS or local storage
- Extracted text cached with size limits

## Legal Disclaimer

⚠️ **IMPORTANT**: This module provides legal information and analysis for educational purposes only. It does NOT constitute legal advice. Users should always consult with a licensed attorney for specific legal matters.

## Future Enhancements

Potential improvements:
- [ ] Side-by-side contract comparison
- [ ] Contract version diff analysis
- [ ] Clause library and templates
- [ ] Export to PDF/DOCX with formatting
- [ ] Multi-language contract support
- [ ] Industry-specific compliance rules
- [ ] Redlining and suggested edits
- [ ] Contract risk scoring system

## Support

For issues or questions:
- Check error logs for detailed messages
- Review documentation in `/docs`
- Test with Postman collection
- Contact development team

## Version History

- **v1.0.0** (2025-12-29) - Initial release
  - Conversational contract review
  - Multiple review types
  - File upload and text input
  - Risk assessment
  - Conversation continuity
  - Full documentation

---

**Module**: legal_contract_review  
**Version**: 1.0.0  
**Last Updated**: December 29, 2025  
**Model**: Gemini 2.5 Flash  
**Status**: Production Ready ✅
