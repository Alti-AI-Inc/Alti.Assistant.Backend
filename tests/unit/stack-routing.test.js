import { describe, it, expect } from 'vitest';
import config from '../../config/index.js';
import { ChunkerService } from '../../src/app/modules/rag/chunker.service.js';
import { IntentClassifier } from '../../src/app/modules/orchestrator/classifier.js';

describe('Stack Configuration & Multi-Model Support', () => {
  it('should have all 3 Groq models configured correctly', () => {
    expect(config.groq.model).toBe('gpt-oss-120b');
    expect(config.groq.lightModel).toBe('gpt-oss-20b');
    expect(config.groq.sttModel).toBe('whisper-large-v3-turbo');
  });

  it('should have Cloudflare Workers AI credentials configured', () => {
    expect(config.cloudflare).toBeDefined();
    expect(process.env.CLOUDFLARE_ACCOUNT_ID).toBeDefined();
    expect(process.env.CLOUDFLARE_API_TOKEN).toBeDefined();
  });

  it('should ensure zero Google Cloud Platform configuration exists', () => {
    const configString = JSON.stringify(config);
    expect(configString).not.toContain('google_application_credentials');
    expect(configString).not.toContain('vertex');
    expect(configString).not.toContain('bigquery');
  });
});

describe('RAG Document Chunker Service', () => {
  it('should cleanly split text into overlapping chunks', () => {
    const sampleText = 'This is section one of our document. '.repeat(20);
    const result = ChunkerService.chunkDocument(sampleText, {
      chunkSize: 120,
      chunkOverlap: 20,
    });

    expect(result.chunks.length).toBeGreaterThan(1);
    expect(result.chunks[0].content).toBeDefined();
    expect(result.chunks[0].charCount).toBeLessThanOrEqual(140);
  });

  it('should calculate estimated token count accurately', () => {
    const text = 'Hello world! This is a test sentence.';
    const tokens = ChunkerService.estimateTokens(text);
    expect(tokens).toBe(Math.ceil(text.length / 4));
  });

  it('should normalize whitespace and linebreaks in cleanText', () => {
    const raw = 'Text   with    extra    spaces\r\nand\n\n\nnewlines   ';
    const cleaned = ChunkerService.cleanText(raw);
    expect(cleaned).not.toContain('\r\n');
    expect(cleaned).not.toContain('    ');
  });
});

describe('Smart Routing Intent Classifier', () => {
  it('should classify code requests via heuristic fallback', async () => {
    const result = await IntentClassifier.classify('write a python script to parse csv', {
      maxLatencyMs: 1, // trigger immediate heuristic fallback
    });

    expect(result.route).toBe('CODE');
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it('should classify search requests via heuristic fallback', async () => {
    const result = await IntentClassifier.classify('what is the current weather forecast', {
      maxLatencyMs: 1,
    });

    expect(result.route).toBe('WEATHER');
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it('should classify deep research requests via heuristic fallback', async () => {
    const result = await IntentClassifier.classify('conduct deep research into market trends', {
      maxLatencyMs: 1,
    });

    expect(result.route).toBe('RESEARCH');
  });

  it('should default ambiguous conversational queries to SEARCH for citation coverage', async () => {
    const result = await IntentClassifier.classify('hello how are you doing my friend', {
      maxLatencyMs: 1,
    });

    expect(result.route).toBe('SEARCH');
  });
});
