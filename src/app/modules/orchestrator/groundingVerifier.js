import { logger } from '../../../shared/logger.js';

/**
 * Citation Grounding Verifier
 *
 * Post-processes LLM responses to verify that inline citations [1], [2], etc.
 * actually correspond to content found in the referenced sources.
 *
 * Strategy:
 * 1. Extract all sentences that contain a citation marker [N]
 * 2. For each cited sentence, extract the claim text (sentence minus the marker)
 * 3. Fuzzy-match the claim against the source text from references[N-1]
 * 4. If a claim has < threshold overlap with its cited source, flag it
 *
 * This is extractive grounding — the same approach Perplexity uses.
 */

/**
 * Tokenize text into lowercase word-level n-grams for overlap scoring.
 */
function _tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2); // skip tiny words
}

/**
 * Compute Jaccard-like overlap between claim words and source words.
 * Returns a score 0.0 – 1.0
 */
function _overlapScore(claimWords, sourceWords) {
  if (claimWords.length === 0) return 1.0; // empty claim = nothing to verify
  const sourceSet = new Set(sourceWords);
  let matches = 0;
  for (const word of claimWords) {
    if (sourceSet.has(word)) matches++;
  }
  return matches / claimWords.length;
}

/**
 * Extract sentences containing citation markers from the response text.
 * Returns array of { citationIndex (1-based), sentence }
 */
function _extractCitedSentences(text) {
  // Split on sentence boundaries, keeping citation markers
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const cited = [];

  for (const sentence of sentences) {
    const markers = sentence.match(/\[(\d+)\]/g);
    if (markers) {
      for (const marker of markers) {
        const idx = parseInt(marker.replace(/[[\]]/g, ''), 10);
        const cleanSentence = sentence.replace(/\[\d+\]/g, '').trim();
        cited.push({ citationIndex: idx, sentence: cleanSentence });
      }
    }
  }
  return cited;
}

/**
 * Verify all citations in a response against the provided references.
 *
 * @param {string} responseText - The LLM's final response text
 * @param {Array<{title: string, url: string, snippet?: string, text?: string}>} references - Source references
 * @param {Object} options
 * @param {number} options.threshold - Minimum overlap score (0-1) to consider grounded. Default 0.15
 * @param {boolean} options.stripUngrounded - If true, append a warning for ungrounded citations
 * @returns {{ verifiedText: string, groundingReport: Object }}
 */
export function verifyCitations(responseText, references = [], options = {}) {
  const threshold = options.threshold ?? 0.15;

  if (!responseText || references.length === 0) {
    return { verifiedText: responseText, groundingReport: { total: 0, grounded: 0, ungrounded: 0, details: [] } };
  }

  const citedSentences = _extractCitedSentences(responseText);
  if (citedSentences.length === 0) {
    return { verifiedText: responseText, groundingReport: { total: 0, grounded: 0, ungrounded: 0, details: [] } };
  }

  // Pre-tokenize all reference texts
  const refTokens = references.map(r => {
    const fullText = [r.title, r.snippet, r.text, r.summary].filter(Boolean).join(' ');
    return _tokenize(fullText);
  });

  const details = [];
  let groundedCount = 0;
  let ungroundedCount = 0;

  for (const { citationIndex, sentence } of citedSentences) {
    const refIdx = citationIndex - 1; // 0-based
    if (refIdx < 0 || refIdx >= references.length) {
      // Citation references a source that doesn't exist
      details.push({ citation: citationIndex, sentence: sentence.slice(0, 100), score: 0, status: 'invalid_ref' });
      ungroundedCount++;
      continue;
    }

    const claimWords = _tokenize(sentence);
    const sourceWords = refTokens[refIdx];
    const score = _overlapScore(claimWords, sourceWords);

    if (score >= threshold) {
      groundedCount++;
      details.push({ citation: citationIndex, score: Math.round(score * 100) / 100, status: 'grounded' });
    } else {
      ungroundedCount++;
      details.push({
        citation: citationIndex,
        sentence: sentence.slice(0, 100),
        score: Math.round(score * 100) / 100,
        status: 'weak_grounding',
        source: references[refIdx]?.url,
      });
    }
  }

  // If there are ungrounded citations, append a subtle disclaimer
  let verifiedText = responseText;
  if (ungroundedCount > 0 && options.stripUngrounded) {
    verifiedText += `\n\n> ⚠️ ${ungroundedCount} citation(s) could not be fully verified against their sources. Claims marked with these citations should be independently verified.`;
  }

  const report = {
    total: citedSentences.length,
    grounded: groundedCount,
    ungrounded: ungroundedCount,
    groundingRate: citedSentences.length > 0 ? Math.round((groundedCount / citedSentences.length) * 100) : 100,
    details: details.filter(d => d.status !== 'grounded'), // only report problems
  };

  if (ungroundedCount > 0) {
    logger.warn(`[Grounding] ${ungroundedCount}/${citedSentences.length} citations weakly grounded. Rate: ${report.groundingRate}%`);
  }

  return { verifiedText, groundingReport: report };
}

export default { verifyCitations };
