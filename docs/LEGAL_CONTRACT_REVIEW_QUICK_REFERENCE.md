# Legal Contract Review API - Quick Reference

## 🚀 Quick Start

### Basic Review (File Upload)

```bash
POST /api/legal-contract-review/assistant
Content-Type: multipart/form-data

message: "Review this contract"
file: contract.pdf
```

### Basic Review (Text Input)

```bash
POST /api/legal-contract-review/assistant
Content-Type: application/json

{
  "message": "EMPLOYMENT AGREEMENT... [paste full contract text]"
}
```

## 📋 Common Use Cases

### 1. General Contract Review

**Request**: "Please review this employment contract"
**What you get**: Comprehensive analysis of all key clauses, risks, obligations, and recommendations

### 2. Risk Assessment

**Request**: "What are the risks in this NDA?"
**What you get**: Risk matrix with severity levels, potential issues, and mitigation strategies

### 3. Clause Analysis

**Request**: "Analyze the termination and non-compete clauses"
**What you get**: Detailed breakdown of specific clauses with implications

### 4. Compliance Check

**Request**: "Does this comply with California employment laws?"
**What you get**: Legal compliance analysis with regulatory requirements

### 5. Fairness Evaluation

**Request**: "Is this contract fair to both parties?"
**What you get**: Balance assessment, one-sided provisions identification

### 6. Red Flags

**Request**: "What are the red flags in this contract?"
**What you get**: Critical issues, concerning clauses, deal-breakers

### 7. Amendment Suggestions

**Request**: "How can I improve this contract?"
**What you get**: Specific amendment recommendations for negotiation

### 8. Executive Summary

**Request**: "Summarize this contract for non-legal audience"
**What you get**: Clear, concise overview of key terms and obligations

## 🎯 Request Patterns

### Natural Language (Recommended)

```json
{
  "message": "I need a detailed risk assessment of this service agreement, focusing on liability and payment terms"
}
```

### Explicit Parameters (Direct Endpoint)

```json
{
  "reviewType": "risk_assessment",
  "reviewDepth": "detailed",
  "contractType": "service_agreement",
  "aspects": ["liabilities", "payment_terms"]
}
```

## 📊 Review Depth Guide

| Depth           | Use When                           | Time    | Detail Level    |
| --------------- | ---------------------------------- | ------- | --------------- |
| `quick`         | Initial screening, time-sensitive  | ~2 min  | Key points only |
| `standard`      | Most contracts, balanced review    | ~5 min  | Comprehensive   |
| `detailed`      | Important contracts, clause-level  | ~10 min | Very thorough   |
| `comprehensive` | Critical deals, full risk analysis | ~15 min | Exhaustive      |

## 📄 Contract Type Examples

| Type                | Examples                                   |
| ------------------- | ------------------------------------------ |
| `employment`        | Job offers, employment agreements          |
| `nda`               | Non-disclosure agreements, confidentiality |
| `service_agreement` | Consulting, freelance contracts            |
| `sales`             | Purchase orders, sales contracts           |
| `lease`             | Real estate, equipment leases              |
| `partnership`       | Business partnerships, JV agreements       |
| `licensing`         | Software licenses, IP licensing            |

## ⚡ Quick Tips

1. **Be Specific**: "Review termination clauses" is better than "review contract"
2. **Use Conversations**: Keep `conversationId` for follow-up questions
3. **Specify Concerns**: Mention what worries you (e.g., "concerned about liability")
4. **Choose Right Depth**: Don't use `comprehensive` for routine reviews
5. **Request Format**: Use `markdown` for better readability
6. **Upload vs Paste**: Upload for long contracts, paste for short clauses

## 🔄 Conversation Flow Examples

### Example 1: Progressive Deep Dive

```
1. "Review this NDA" → General overview
2. "What about the confidentiality obligations?" → Specific analysis
3. "Are these terms fair?" → Fairness evaluation
4. "Suggest improvements" → Amendment recommendations
```

### Example 2: Risk-Focused Review

```
1. "Identify all risks in this contract" → Risk assessment
2. "Which risks are most critical?" → Priority clarification
3. "How can I mitigate the high-risk items?" → Solutions
```

### Example 3: Negotiation Preparation

```
1. "Review this vendor contract" → General review
2. "Which clauses favor the vendor?" → Fairness check
3. "What should I negotiate?" → Amendment suggestions
4. "Draft alternative language for payment terms" → Specific help
```

## ⚠️ Important Notes

### Legal Disclaimer

- **NOT legal advice** - for informational purposes only
- Always consult a licensed attorney for specific legal matters
- AI analysis should supplement, not replace, professional legal review

### File Requirements

- **Formats**: PDF, DOCX, DOC, TXT
- **Max Size**: 10MB
- **Quality**: Clear, readable text (no handwritten contracts)

### Best Practices

- ✅ DO: Provide context about your role (employer/employee, buyer/seller)
- ✅ DO: Mention jurisdiction if relevant (e.g., "California employment law")
- ✅ DO: Ask follow-up questions for clarification
- ❌ DON'T: Share highly confidential information in guest mode
- ❌ DON'T: Rely solely on AI for critical legal decisions
- ❌ DON'T: Use for ongoing litigation or disputes

## 🎨 Output Format Guide

| Format     | Best For               | Features                  |
| ---------- | ---------------------- | ------------------------- |
| `text`     | Quick reading, emails  | Plain text, easy to copy  |
| `markdown` | Documentation, sharing | Formatted, headers, lists |
| `pdf`      | Official reports       | Professional presentation |
| `docx`     | Editing, collaboration | Editable document         |

## 📱 Integration Examples

### cURL

```bash
curl -X POST http://localhost:80/api/legal-contract-review/assistant \
  -F "message=Review this NDA for risks" \
  -F "file=@nda.pdf" \
  -F "outputFormat=markdown"
```

### JavaScript (Node.js)

```javascript
const FormData = require('form-data');
const fs = require('fs');

const form = new FormData();
form.append('message', 'Review this contract');
form.append('file', fs.createReadStream('contract.pdf'));

fetch('http://localhost:80/api/legal-contract-review/assistant', {
  method: 'POST',
  body: form,
})
  .then((res) => res.json())
  .then((data) => console.log(data.data.response));
```

### Python

```python
import requests

files = {'file': open('contract.pdf', 'rb')}
data = {'message': 'Review this contract'}

response = requests.post(
  'http://localhost:80/api/legal-contract-review/assistant',
  files=files,
  data=data
)

print(response.json()['data']['response'])
```

## 🆘 Troubleshooting

| Issue                    | Solution                                 |
| ------------------------ | ---------------------------------------- |
| "Unable to extract text" | Ensure PDF is not scanned/image-based    |
| "File too large"         | Compress or split contract into sections |
| "Needs contract"         | Upload file or paste contract text       |
| "Rate limit exceeded"    | Wait 15 minutes or upgrade plan          |
| "Token limit"            | Use shorter messages or split review     |

## 📞 Need Help?

- **Documentation**: `/docs/LEGAL_CONTRACT_REVIEW_API.md`
- **Postman Collection**: `/postman_collections/Legal_Contract_Review_API.postman_collection.json`
- **API Status**: Check server logs for detailed error messages

---

**Version**: 1.0.0  
**Last Updated**: December 29, 2025
