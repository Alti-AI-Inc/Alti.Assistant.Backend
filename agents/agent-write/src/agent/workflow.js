/**
 * @fileoverview LangGraph workflow for the Write Agent — production implementation.
 *
 * 5-node pipeline calling Claude 4.5 Sonnet via Vertex AI at each stage:
 *
 *   START → analyzeWritingIntent → planDocumentStructure → generateDraft
 *         → reviewAndRefine → formatAndExport → END
 *
 * Each node calls WriteService.callClaude() with stage-specific prompts.
 * State channels carry data between nodes via LangGraph Annotation reducers.
 */

import { StateGraph, Annotation, END, START } from '@langchain/langgraph';
import { createLogger } from '../../../../shared/logging/index.js';
import { WriteService } from '../services/writeService.js';

const { logger } = createLogger('write-workflow');

// ── Shared service instance for all nodes ────────────────────────────────────
const writeService = new WriteService();

// ── System prompt (injected into every Claude call) ──────────────────────────
const SYSTEM_PROMPT = `You are an expert professional writer and document creator. You produce polished,
well-structured documents tailored to the audience and purpose.

Capabilities:
- Business documents (proposals, reports, memos, executive summaries)
- Creative writing (articles, blog posts, marketing copy, storytelling)
- Technical writing (documentation, guides, specifications, white papers)
- Academic writing (research summaries, literature reviews, abstracts)
- Communication (emails, presentations, speeches, press releases)

Rules:
- Always structure documents with clear headings and sections
- Use appropriate tone for the audience
- Include relevant details and examples
- Ensure logical flow and coherent arguments
- Use markdown formatting for structure`;

// ── State Schema ─────────────────────────────────────────────────────────────
const WriteState = Annotation.Root({
  // Inputs
  prompt:         Annotation({ reducer: (_, v) => v, default: () => '' }),
  documentType:   Annotation({ reducer: (_, v) => v, default: () => 'general' }),
  tone:           Annotation({ reducer: (_, v) => v, default: () => 'professional' }),
  audience:       Annotation({ reducer: (_, v) => v, default: () => 'general' }),
  maxLength:      Annotation({ reducer: (_, v) => v, default: () => 0 }),
  userContext:    Annotation({ reducer: (_, v) => v, default: () => '{}' }),

  // Intermediate outputs
  outline:        Annotation({ reducer: (_, v) => v, default: () => '' }),
  draft:          Annotation({ reducer: (_, v) => v, default: () => '' }),
  review:         Annotation({ reducer: (_, v) => v, default: () => '' }),
  finalDocument:  Annotation({ reducer: (_, v) => v, default: () => '' }),

  // Token tracking
  usage:          Annotation({ reducer: (prev, v) => ({
    input_tokens: (prev?.input_tokens || 0) + (v?.input_tokens || 0),
    output_tokens: (prev?.output_tokens || 0) + (v?.output_tokens || 0),
  }), default: () => ({ input_tokens: 0, output_tokens: 0 }) }),
});

// ── Node 1: Analyze Writing Intent ───────────────────────────────────────────
// Determines document type, tone, audience, and constraints from the prompt.
async function analyzeWritingIntent(state) {
  logger.info('Node 1: Analyzing writing intent', { prompt: state.prompt?.slice(0, 100) });

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Analyze the following writing request and determine:
1. **Document Type**: What kind of document is being requested? (e.g., email, report, proposal, blog post, memo, white paper, press release, article, essay, speech, documentation, etc.)
2. **Tone**: What tone should be used? (e.g., formal, professional, conversational, technical, persuasive, empathetic, authoritative, etc.)
3. **Audience**: Who is the target audience? (e.g., executives, developers, general public, customers, investors, team members, etc.)
4. **Key Requirements**: What specific requirements or constraints are mentioned?
5. **Estimated Length**: How long should the document be? (short: <500 words, medium: 500-1500 words, long: 1500+ words)

Respond in this exact format:
DOCUMENT_TYPE: <type>
TONE: <tone>
AUDIENCE: <audience>
KEY_REQUIREMENTS: <comma-separated list>
ESTIMATED_LENGTH: <short|medium|long>
SUMMARY: <one-sentence summary of what needs to be written>

Writing request:
"""
${state.prompt}
"""` },
  ];

  const { text, usage } = await writeService.callClaude(messages, { maxTokens: 1024, temperature: 0.1 });

  // Parse the structured response
  const parsed = {};
  const lines = text.split('\n');
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      parsed[match[1].toLowerCase()] = match[2].trim();
    }
  }

  const documentType = parsed.document_type || state.documentType || 'general';
  const tone = parsed.tone || state.tone || 'professional';
  const audience = parsed.audience || state.audience || 'general';

  logger.info('Writing intent analyzed', { documentType, tone, audience });

  return {
    documentType,
    tone,
    audience,
    usage,
  };
}

// ── Node 2: Plan Document Structure ──────────────────────────────────────────
// Generates a detailed outline based on the analysed intent.
async function planDocumentStructure(state) {
  logger.info('Node 2: Planning document structure', {
    documentType: state.documentType,
    tone: state.tone,
  });

  const lengthGuidance = state.maxLength > 0
    ? `The document should be approximately ${state.maxLength} words.`
    : '';

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Create a detailed outline for the following document.

**Document Type**: ${state.documentType}
**Tone**: ${state.tone}
**Audience**: ${state.audience}
${lengthGuidance}

**Writing Request**:
"""
${state.prompt}
"""

Create a comprehensive outline with:
- Clear section headings (using markdown ## format)
- 2-4 bullet points under each section describing what to cover
- Logical flow from introduction to conclusion
- Any special sections relevant to the document type (e.g., Executive Summary for reports, Call to Action for marketing)

Output ONLY the outline in markdown format. Do not include any preamble or explanation.` },
  ];

  const { text, usage } = await writeService.callClaude(messages, { maxTokens: 2048, temperature: 0.3 });

  logger.info('Document outline generated', { outlineLength: text.length });

  return { outline: text, usage };
}

// ── Node 3: Generate Draft ───────────────────────────────────────────────────
// Produces the full draft following the outline section by section.
async function generateDraft(state) {
  logger.info('Node 3: Generating draft', {
    outlineLength: state.outline?.length,
    documentType: state.documentType,
  });

  const lengthGuidance = state.maxLength > 0
    ? `Target length: approximately ${state.maxLength} words.`
    : 'Write a comprehensive document of appropriate length for the type and topic.';

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Write a complete ${state.documentType} based on the following outline and requirements.

**Document Type**: ${state.documentType}
**Tone**: ${state.tone}
**Audience**: ${state.audience}
**Length**: ${lengthGuidance}

**Outline**:
${state.outline}

**Original Request**:
"""
${state.prompt}
"""

Instructions:
- Follow the outline structure exactly
- Write in the specified tone throughout
- Tailor content for the target audience
- Use markdown formatting (headings, bold, lists, etc.)
- Include specific details, examples, and supporting points
- Ensure smooth transitions between sections
- Make the content engaging and purposeful

Write the COMPLETE document now. Output ONLY the document content in markdown.` },
  ];

  const { text, usage } = await writeService.callClaude(messages, {
    maxTokens: 8192,
    temperature: 0.4,
  });

  logger.info('Draft generated', { draftLength: text.length });

  return { draft: text, usage };
}

// ── Node 4: Review & Refine ─────────────────────────────────────────────────
// Self-reviews the draft and produces an improved version.
async function reviewAndRefine(state) {
  logger.info('Node 4: Reviewing and refining draft', { draftLength: state.draft?.length });

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Review and improve the following ${state.documentType} draft.

**Document Type**: ${state.documentType}
**Tone**: ${state.tone}
**Audience**: ${state.audience}

**Original Request**:
"""
${state.prompt}
"""

**Draft to Review**:
${state.draft}

Review the draft for:
1. **Completeness**: Does it fully address the original request?
2. **Clarity**: Is the writing clear, concise, and easy to follow?
3. **Tone consistency**: Does the tone match throughout?
4. **Structure**: Is the logical flow effective? Are transitions smooth?
5. **Grammar & style**: Fix any errors, improve word choice
6. **Audience fit**: Is the content appropriate for the target audience?
7. **Impact**: Does the opening grab attention? Does the conclusion leave an impression?

Output the IMPROVED version of the full document in markdown. Apply all refinements directly — do not list the changes separately. If the draft is already excellent, output it with only minor polish.` },
  ];

  const { text, usage } = await writeService.callClaude(messages, {
    maxTokens: 8192,
    temperature: 0.2,
  });

  const review = `Reviewed and refined: ${state.documentType} document for ${state.audience} audience in ${state.tone} tone.`;

  logger.info('Draft reviewed and refined', {
    originalLength: state.draft?.length,
    refinedLength: text.length,
  });

  return { draft: text, review, usage };
}

// ── Node 5: Format & Export ──────────────────────────────────────────────────
// Applies final formatting and produces the deliverable document.
async function formatAndExport(state) {
  logger.info('Node 5: Formatting final document', { documentType: state.documentType });

  // For most document types, the refined draft IS the final document.
  // Apply light post-processing for consistency.
  let finalDocument = state.draft;

  // Ensure the document starts with a top-level heading if it doesn't have one
  if (!finalDocument.trim().startsWith('#')) {
    // Extract a title from the first line or generate one
    const firstLine = finalDocument.trim().split('\n')[0];
    const title = firstLine.replace(/^[*_#\s]+/, '').replace(/[*_]+$/, '').trim();
    if (title && title.length < 200) {
      finalDocument = `# ${title}\n\n${finalDocument.trim().split('\n').slice(1).join('\n').trim()}`;
    }
  }

  // Normalize excessive blank lines
  finalDocument = finalDocument.replace(/\n{4,}/g, '\n\n\n');

  // Ensure trailing newline
  if (!finalDocument.endsWith('\n')) {
    finalDocument += '\n';
  }

  logger.info('Final document formatted', {
    finalLength: finalDocument.length,
    documentType: state.documentType,
  });

  return { finalDocument };
}

// ── Graph Assembly ───────────────────────────────────────────────────────────
const workflow = new StateGraph(WriteState)
  .addNode('analyzeWritingIntent',  analyzeWritingIntent)
  .addNode('planDocumentStructure', planDocumentStructure)
  .addNode('generateDraft',         generateDraft)
  .addNode('reviewAndRefine',       reviewAndRefine)
  .addNode('formatAndExport',       formatAndExport)

  // Sequential pipeline edges
  .addEdge(START,                    'analyzeWritingIntent')
  .addEdge('analyzeWritingIntent',   'planDocumentStructure')
  .addEdge('planDocumentStructure',  'generateDraft')
  .addEdge('generateDraft',         'reviewAndRefine')
  .addEdge('reviewAndRefine',       'formatAndExport')
  .addEdge('formatAndExport',       END);

// Compile the graph into a runnable
export const writeGraph = workflow.compile();

export async function runWorkflow(input) {
  logger.info('Starting write workflow');
  return await writeGraph.invoke(input);
}

export default writeGraph;
