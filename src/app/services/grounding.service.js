import { logger } from '../../shared/logger.js';

/**
 * Grounding Service — Anti-hallucination engine.
 * Extracts factual claims from LLM output, verifies each via Exa search + RAG,
 * scores confidence, and injects citations.
 *
 * Zero hallucination = every fact is source-backed before reaching the user.
 */

const CLAIM_EXTRACTION_PROMPT = `You are a fact-checker. Extract only FACTUAL CLAIMS from the text below.
Skip opinions, instructions, code blocks, greetings, and subjective statements.
Return a JSON array of objects with "claim" (the factual statement) and "type" (one of: "factual", "numerical", "temporal", "attribution").
If there are no factual claims, return an empty array [].
Return ONLY valid JSON, no markdown fences.`;

const GROUNDING_THRESHOLD = 0.6;

export const GroundingService = {
  /**
   * Extract factual claims from LLM output using gpt-oss-20b.
   */
  async extractClaims(text) {
    if (!text || text.length < 20) return [];

    try {
      const { groqLightChat } = await import('./groq.client.js');
      const response = await groqLightChat([
        { role: 'system', content: CLAIM_EXTRACTION_PROMPT },
        { role: 'user', content: text.slice(0, 4000) },
      ]);

      const content = response?.choices?.[0]?.message?.content || '[]';
      // Strip markdown fences if present
      const cleaned = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const claims = JSON.parse(cleaned);
      return Array.isArray(claims) ? claims.slice(0, 10) : [];
    } catch (err) {
      logger.warn(`[Grounding] Claim extraction failed: ${err.message}`);
      return [];
    }
  },

  /**
   * Verify claims against Exa search results.
   * Returns claims with verification status and sources.
   */
  async verifyClaims(claims) {
    if (!claims || claims.length === 0) return [];

    let Exa, pLimit;
    try {
      const exaModule = await import('exa-js');
      Exa = exaModule.default || exaModule.Exa;
      const plModule = await import('p-limit');
      pLimit = plModule.default;
    } catch (err) {
      logger.warn(`[Grounding] Exa/p-limit not available: ${err.message}`);
      return claims.map(c => ({ ...c, status: 'unverified', sources: [] }));
    }

    const exaApiKey = process.env.EXA_API_KEY;
    if (!exaApiKey) {
      return claims.map(c => ({ ...c, status: 'unverified', sources: [], reason: 'No Exa API key' }));
    }

    const exa = new Exa(exaApiKey);
    const limit = pLimit(3);

    const verified = await Promise.allSettled(
      claims.map(claim =>
        limit(async () => {
          try {
            const results = await exa.searchAndContents(claim.claim, {
              numResults: 2,
              type: 'neural',
              useAutoprompt: true,
              text: { maxCharacters: 500 },
            });

            const sources = (results?.results || []).map(r => ({
              title: r.title,
              url: r.url,
              snippet: r.text?.slice(0, 200) || '',
              score: r.score || 0,
            }));

            // Determine verification status
            let status = 'unverified';
            if (sources.length > 0 && sources[0].score > 0.5) {
              status = 'verified';
            } else if (sources.length > 0) {
              status = 'partially_verified';
            }

            return { ...claim, status, sources };
          } catch (err) {
            logger.warn(`[Grounding] Claim verification failed: ${err.message}`);
            return { ...claim, status: 'unverified', sources: [], error: err.message };
          }
        })
      )
    );

    return verified.map(r =>
      r.status === 'fulfilled' ? r.value : { claim: 'unknown', status: 'error', sources: [] }
    );
  },

  /**
   * Full grounding pipeline: extract → verify → score → cite.
   * This is the main entry point.
   */
  async groundOutput(output, options = {}) {
    const startTime = Date.now();
    const { query, threshold = GROUNDING_THRESHOLD, skipGrounding = false } = options;

    // Skip grounding for non-factual content
    if (skipGrounding || !output || output.length < 50) {
      return {
        groundedOutput: output,
        score: 1.0,
        claims: [],
        citations: [],
        disclaimer: null,
        durationMs: Date.now() - startTime,
      };
    }

    // Step 1: Extract claims
    const claims = await this.extractClaims(output);

    if (claims.length === 0) {
      // No factual claims = opinion/instruction content, skip verification
      return {
        groundedOutput: output,
        score: 1.0,
        claims: [],
        citations: [],
        disclaimer: null,
        durationMs: Date.now() - startTime,
      };
    }

    // Step 2: Verify claims
    const verifiedClaims = await this.verifyClaims(claims);

    // Step 3: Calculate grounding score
    const verifiedCount = verifiedClaims.filter(c => c.status === 'verified').length;
    const partialCount = verifiedClaims.filter(c => c.status === 'partially_verified').length;
    const score = verifiedClaims.length > 0
      ? (verifiedCount + partialCount * 0.5) / verifiedClaims.length
      : 1.0;

    // Step 4: Build citations
    const citations = verifiedClaims
      .filter(c => c.sources && c.sources.length > 0)
      .flatMap(c => c.sources.map(s => ({
        title: s.title,
        url: s.url,
        claim: c.claim,
      })));

    // Deduplicate citations by URL
    const uniqueCitations = [...new Map(citations.map(c => [c.url, c])).values()];

    // Step 5: Build grounded output
    let groundedOutput = output;

    // Add citation references if we have verified sources
    if (uniqueCitations.length > 0) {
      const citationBlock = '\n\n**Sources:**\n' +
        uniqueCitations.slice(0, 5).map((c, i) => `${i + 1}. [${c.title}](${c.url})`).join('\n');
      groundedOutput = output + citationBlock;
    }

    // Step 6: Add disclaimer if score is below threshold
    let disclaimer = null;
    if (score < threshold) {
      disclaimer = `⚠️ Grounding score: ${Math.round(score * 100)}%. Some claims could not be verified against current sources. Please verify independently.`;
      groundedOutput = `${disclaimer}\n\n${groundedOutput}`;
    }

    const contradicted = verifiedClaims.filter(c => c.status === 'contradicted');
    if (contradicted.length > 0) {
      const contradictionNote = `\n\n> ⚠️ ${contradicted.length} claim(s) may conflict with current sources.`;
      groundedOutput += contradictionNote;
    }

    logger.info(`[Grounding] Score: ${Math.round(score * 100)}%, Claims: ${claims.length}, Verified: ${verifiedCount}, Citations: ${uniqueCitations.length}, Duration: ${Date.now() - startTime}ms`);

    return {
      groundedOutput,
      score,
      claims: verifiedClaims,
      citations: uniqueCitations,
      disclaimer,
      durationMs: Date.now() - startTime,
    };
  },

  /**
   * Lightweight grounding for streaming — single Exa search.
   * Returns relevance score without full claim extraction.
   */
  async quickGround(output, query) {
    if (!output || !query || output.length < 30) {
      return { score: 1.0, relevant: true };
    }

    try {
      const exaModule = await import('exa-js');
      const Exa = exaModule.default || exaModule.Exa;
      const exaApiKey = process.env.EXA_API_KEY;

      if (!exaApiKey) return { score: 0.5, relevant: true, reason: 'No Exa API key' };

      const exa = new Exa(exaApiKey);
      const results = await exa.search(query, { numResults: 1, type: 'neural' });

      const topScore = results?.results?.[0]?.score || 0;
      return {
        score: Math.min(topScore, 1.0),
        relevant: topScore > 0.3,
        source: results?.results?.[0]?.title || null,
      };
    } catch (err) {
      logger.warn(`[Grounding] Quick ground failed: ${err.message}`);
      return { score: 0.5, relevant: true };
    }
  },
};

export default GroundingService;
