import { createIndexFromFile, askQuery } from '../src/app/modules/llamaindex/llamaindex.indexer.js';
import { exportSessionPDF } from '../src/app/modules/llamaindex/llamaindex.controller.js';
import fsPromises from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'path';
import dotenv from 'dotenv';
import { Writable } from 'node:stream';

dotenv.config();

// Stub Response Object extending Writable stream to capture PDF output stream for testing
class MockResponse extends Writable {
  constructor() {
    super();
    this.headers = {};
    this.body = [];
    this.headersSent = false;
  }
  setHeader(name, value) {
    this.headers[name] = value;
  }
  _write(chunk, encoding, callback) {
    this.body.push(chunk);
    callback();
  }
  end(chunk) {
    if (chunk) this.body.push(chunk);
    super.end();
    this.headersSent = true;
    this.emitDone();
  }
  status(code) {
    this.statusCode = code;
    return this;
  }
  json(data) {
    this.jsonData = data;
    this.emitDone();
  }
  onDone(cb) {
    this.doneCallback = cb;
  }
  emitDone() {
    if (this.doneCallback) this.doneCallback();
  }
}

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('No GEMINI_API_KEY found, skipping live suggested questions & PDF export test');
    return;
  }

  const tempDocPath = path.resolve('temp_test_phase3.txt');
  const userId = 'test_user_phase3_rag';
  const outPdfPath = path.resolve('scratch/test_session_analysis.pdf');

  try {
    console.log('1. Creating a temporary test document...');
    const testContent = `
Alti is an enterprise productivity AI workflow startup headquartered in San Francisco.
The company was founded in January 2024 by ex-Google researchers Shohidul Jaman and team.
In the fiscal year 2025, Alti achieved an annual recurring revenue (ARR) of $12.4 million.
Jane Doe is the CEO of Alti, directing enterprise AI product strategy.
`;
    await fsPromises.writeFile(tempDocPath, testContent, 'utf-8');
    console.log(`Temporary document written to ${tempDocPath}`);

    console.log('\n2. Indexing temporary document (Will generate document summary profile)...');
    await createIndexFromFile(tempDocPath, 'alti_annual_report_2025.txt', userId);
    console.log('Indexing completed successfully!');

    console.log('\n3. Querying local document context (Expected: AI Suggested Questions returned)...');
    const query = 'What is Alti\'s revenue and who is leading the company?';
    console.log(`Query: "${query}"`);
    const response = await askQuery(query, userId);
    
    console.log('\nLocal RAG Answer:\n', response.content);
    console.log('\nCitations:\n', JSON.stringify(response.sources, null, 2));
    console.log('\nAI Suggested Questions (Phase 3):\n', response.suggestedQuestions);

    if (!response.suggestedQuestions || response.suggestedQuestions.length !== 3) {
      throw new Error('Suggested questions were not generated correctly (expected exactly 3).');
    }

    console.log('\n4. Compiling and exporting conversation session PDF...');
    const req = {
      user: { userId }
    };
    const res = new MockResponse();

    const pdfPromise = new Promise((resolve, reject) => {
      res.onDone(() => {
        if (res.statusCode && res.statusCode !== 200) {
          reject(new Error(`PDF generation returned status ${res.statusCode}: ${JSON.stringify(res.jsonData)}`));
        } else {
          resolve(Buffer.concat(res.body));
        }
      });
    });

    await exportSessionPDF(req, res);
    const pdfBuffer = await pdfPromise;

    console.log(`PDF compiled successfully! Captured ${pdfBuffer.length} bytes.`);
    
    // Save to disk to inspect the file
    await fsPromises.writeFile(outPdfPath, pdfBuffer);
    console.log(`Saved PDF report to ${outPdfPath}`);

    if (pdfBuffer.length === 0) {
      throw new Error('Generated PDF buffer is empty.');
    }

    console.log('\n✅ AI Suggested Questions & Premium PDF session export verified successfully!');

  } catch (err) {
    console.error('❌ Phase 3 test failed:', err);
  } finally {
    // Cleanup temporary files
    try {
      if (existsSync(tempDocPath)) {
        await fsPromises.unlink(tempDocPath);
        console.log('Cleaned up temporary document');
      }
      
      const persistDir = path.resolve(`storage/ragsystem/${userId}`);
      if (existsSync(persistDir)) {
        await fsPromises.rm(persistDir, { recursive: true, force: true });
        console.log(`Cleaned up temporary storage context directory: ${persistDir}`);
      }

      if (existsSync(outPdfPath)) {
        await fsPromises.unlink(outPdfPath);
        console.log('Cleaned up generated test PDF from disk');
      }
    } catch (cleanupErr) {
      console.error('Cleanup warning:', cleanupErr.message);
    }
  }
}

run().catch(console.error);
