/**
 * Mask Personally Identifiable Information (PII) in a given text.
 * This is a critical safety and privacy measure.
 * @param {string} text The input text to sanitize.
 * @returns {string} The text with PII masked.
 */
export const maskPII = text => {
  if (!text || typeof text !== 'string') return text;

  let maskedText = text;

  // Mask email addresses
  maskedText = maskedText.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    '[EMAIL_REDACTED]',
  );

  // Mask phone numbers (various common formats)
  maskedText = maskedText.replace(
    /(\+\d{1,3}[- ]?)?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}/g,
    '[PHONE_REDACTED]',
  );

  // Mask Social Security Numbers (SSN)
  maskedText = maskedText.replace(
    /\b\d{3}-\d{2}-\d{4}\b/g,
    '[SSN_REDACTED]',
  );

  // Mask credit card numbers (basic check for 13-16 digits, with a simple Luhn check to reduce false positives)
  maskedText = maskedText.replace(/\b(?:\d[ -]*?){13,16}\b/g, match => {
    const s = match.replace(/\D/g, '');
    if (s.length < 13 || s.length > 16) {
      return match; // Not a typical CC length
    }
    let nCheck = 0;
    let bEven = false;
    for (let n = s.length - 1; n >= 0; n--) {
      const cDigit = s.charAt(n);
      let nDigit = parseInt(cDigit, 10);
      if (bEven && (nDigit *= 2) > 9) nDigit -= 9;
      nCheck += nDigit;
      bEven = !bEven;
    }
    return nCheck % 10 == 0 ? '[CREDIT_CARD_REDACTED]' : match;
  });

  return maskedText;
};

export const piiFilterService = {
  maskPII,
};
