/* eslint-disable no-case-declarations */

import PdfParse from "pdf-parse";
import mammoth from "mammoth";
import { parse } from "csv-parse/browser/esm";
import { summarizerApp } from "./summarizer/workflow.js";
// In-memory store for conversati

export const summarizeContent = async (req, res) => {
  console.log('Received request for summarizer assistant', req);
    
    const { message, conversationId } = req.body;
    if (!conversationId || !message) {
      return res
        .status(400)
        .json({ error: 'A URL and conversationId are required.' });
    }

    // This endpoint will always stream.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      // The only input needed is the URL.
      let user_input = message;
      let userMessageForHistory = ``;
      let contentToSummarize = '';
      if (req.file) {
        console.log(
          `Processing uploaded file: ${req.file.originalname} (MIME type: ${req.file.mimetype})`
        );
        userMessageForHistory = `Summarize the uploaded file: ${req.file.originalname}`;

        // --- NEW: File Parsing Logic ---
        switch (req.file.mimetype) {
          case 'application/pdf':
            const pdfData = await PdfParse(req.file.buffer);
            contentToSummarize = pdfData.text;
            break;
          case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': // .docx
            const docxResult = await mammoth.extractRawText({
              buffer: req.file.buffer,
            });
            contentToSummarize = docxResult.value;
            break;
          case 'text/csv':
            // For CSV, we'll stringify the records to make them readable for the AI.
            const records = parse(req.file.buffer, {
              columns: true,
              skip_empty_lines: true,
            });
            contentToSummarize = JSON.stringify(records, null, 2);
            break;
          case 'text/plain':
            contentToSummarize = req.file.buffer.toString('utf-8');
            break;
          default:
            throw new Error(`Unsupported file type: ${req.file.mimetype}`);
        }
        user_input = contentToSummarize;
        console.log(`Parsed content from file: ${user_input.substring(0, 100)}...`);
      }
      const inputs = {
        user_input: user_input,
        history: [
          { role: 'user', content: `Summarize this URL: ${user_input}` },
        ],
      };
      const result = await summarizerApp.invoke(inputs, {
        configurable: { thread_id: conversationId },
      });

      const stream = result.summary;
      let fullResponse = '';

      // Handle cases where the service returns a string (e.g., an error message)
      if (typeof stream === 'string') {
        res.write(`data: ${JSON.stringify({ chunk: stream })}\n\n`);
      } else {
        // Handle the actual stream
        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            const chunk = event.delta.text;
            fullResponse += chunk;
            res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
          }
        }
        // Save the final summary to memory
        await summarizerApp.invoke(
          { history: [{ role: 'assistant', content: fullResponse }] },
          { configurable: { thread_id: conversationId } }
        );
      }
    } catch (error) {
      console.error('Summarizer Assistant Error:', error);
      res.write(
        `data: ${JSON.stringify({ error: 'An internal error occurred.' })}\n\n`
      );
    } finally {
      res.end();
    }
}