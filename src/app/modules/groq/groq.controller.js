import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { GroqService } from './groq.service.js';

const chat = catchAsync(async (req, res) => {
  const { messages, model, temperature, max_tokens } = req.body;
  const result = await GroqService.chat(messages, { model, temperature, max_tokens });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Chat completion generated successfully.',
    data: result,
  });
});

const streamChat = async (req, res) => {
  const { messages, model, temperature, max_tokens } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await GroqService.stream(messages, { model, temperature, max_tokens });
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
};

const toolCall = catchAsync(async (req, res) => {
  const { messages, tools, model, temperature } = req.body;
  const result = await GroqService.toolCall(messages, tools, { model, temperature });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tool call response generated.',
    data: result,
  });
});

const transcribeAudio = catchAsync(async (req, res) => {
  if (!req.file) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: 'Audio file is required for transcription.',
    });
  }

  const { language, prompt } = req.body;
  const result = await GroqService.transcribeAudio(req.file.path, { language, prompt });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Audio transcribed successfully with Whisper Large V3 Turbo.',
    data: result,
  });
});

const translateAudio = catchAsync(async (req, res) => {
  if (!req.file) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: 'Audio file is required for translation.',
    });
  }

  const { prompt } = req.body;
  const result = await GroqService.translateAudio(req.file.path, { prompt });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Audio translated to English successfully with Whisper Large V3 Turbo.',
    data: result,
  });
});

const listModels = catchAsync(async (req, res) => {
  const result = await GroqService.listModels();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Groq models listed.',
    data: result,
  });
});

const lightChat = catchAsync(async (req, res) => {
  const { messages, temperature, max_tokens } = req.body;
  const result = await GroqService.lightChat(messages, { temperature, max_tokens });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Light chat completion (gpt-oss-20b) generated successfully.',
    data: result,
  });
});

const lightStream = async (req, res) => {
  const { messages, temperature, max_tokens } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await GroqService.lightStream(messages, { temperature, max_tokens });
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
};

// ── Get single model ─────────────────────────────────────────────────────────

const getModel = catchAsync(async (req, res) => {
  const result = await GroqService.getModel(req.params.modelId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Model retrieved.', data: result });
});

// ── Text-to-Speech (TTS) ────────────────────────────────────────────────────

const textToSpeech = catchAsync(async (req, res) => {
  const { input, voice, model, response_format, speed } = req.body;
  const audioResponse = await GroqService.textToSpeech(input, { voice, model, response_format, speed });

  // Stream the audio binary back to the client
  const format = response_format || 'wav';
  res.setHeader('Content-Type', `audio/${format}`);
  res.setHeader('Content-Disposition', `attachment; filename="speech.${format}"`);

  // groq-sdk returns a Response-like object with arrayBuffer()
  const buffer = Buffer.from(await audioResponse.arrayBuffer());
  res.end(buffer);
});

// ── Embeddings ───────────────────────────────────────────────────────────────

const createEmbedding = catchAsync(async (req, res) => {
  const { input, model, encoding_format } = req.body;
  const result = await GroqService.createEmbedding(input, { model, encoding_format });
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Embeddings generated.', data: result });
});

// ── Batches ──────────────────────────────────────────────────────────────────

const createBatch = catchAsync(async (req, res) => {
  const result = await GroqService.createBatch(req.body);
  sendResponse(res, { statusCode: httpStatus.CREATED, success: true, message: 'Batch created.', data: result });
});

const listBatches = catchAsync(async (req, res) => {
  const result = await GroqService.listBatches();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Batches listed.', data: result });
});

const getBatch = catchAsync(async (req, res) => {
  const result = await GroqService.getBatch(req.params.batchId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Batch retrieved.', data: result });
});

const cancelBatch = catchAsync(async (req, res) => {
  const result = await GroqService.cancelBatch(req.params.batchId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Batch cancelled.', data: result });
});

// ── Files ────────────────────────────────────────────────────────────────────

const uploadFile = catchAsync(async (req, res) => {
  if (!req.file) {
    return res.status(httpStatus.BAD_REQUEST).json({ success: false, message: 'File is required.' });
  }
  const result = await GroqService.uploadFile(req.file.path, req.body.purpose || 'batch');
  sendResponse(res, { statusCode: httpStatus.CREATED, success: true, message: 'File uploaded.', data: result });
});

const listFiles = catchAsync(async (req, res) => {
  const result = await GroqService.listFiles();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Files listed.', data: result });
});

const getFile = catchAsync(async (req, res) => {
  const result = await GroqService.getFile(req.params.fileId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'File retrieved.', data: result });
});

const deleteFile = catchAsync(async (req, res) => {
  const result = await GroqService.deleteFile(req.params.fileId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'File deleted.', data: result });
});

const getFileContent = catchAsync(async (req, res) => {
  const result = await GroqService.getFileContent(req.params.fileId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'File content retrieved.', data: result });
});

export const GroqController = {
  chat,
  streamChat,
  toolCall,
  transcribeAudio,
  translateAudio,
  listModels,
  getModel,
  lightChat,
  lightStream,
  textToSpeech,
  createEmbedding,
  createBatch,
  listBatches,
  getBatch,
  cancelBatch,
  uploadFile,
  listFiles,
  getFile,
  deleteFile,
  getFileContent,
};

export default GroqController;
