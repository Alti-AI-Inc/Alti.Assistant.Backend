import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { LlmService } from './llm.service.js';

const chat = catchAsync(async (req, res) => {
  const { messages, model, temperature, max_tokens } = req.body;
  const result = await LlmService.chat(messages, { model, temperature, max_tokens });
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
    const stream = await LlmService.stream(messages, { model, temperature, max_tokens });
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
  const result = await LlmService.toolCall(messages, tools, { model, temperature });
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
  const result = await LlmService.transcribeAudio(req.file.path, { language, prompt });
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
  const result = await LlmService.translateAudio(req.file.path, { prompt });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Audio translated to English successfully with Whisper Large V3 Turbo.',
    data: result,
  });
});

const listModels = catchAsync(async (req, res) => {
  const result = await LlmService.listModels();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Llm models listed.',
    data: result,
  });
});

const lightChat = catchAsync(async (req, res) => {
  const { messages, temperature, max_tokens } = req.body;
  const result = await LlmService.lightChat(messages, { temperature, max_tokens });
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
    const stream = await LlmService.lightStream(messages, { temperature, max_tokens });
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
  const result = await LlmService.getModel(req.params.modelId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Model retrieved.', data: result });
});

// ── Text-to-Speech (TTS) ────────────────────────────────────────────────────

const textToSpeech = catchAsync(async (req, res) => {
  const { input, voice, model, response_format, speed } = req.body;
  const audioResponse = await LlmService.textToSpeech(input, { voice, model, response_format, speed });

  // Stream the audio binary back to the client
  const format = response_format || 'wav';
  res.setHeader('Content-Type', `audio/${format}`);
  res.setHeader('Content-Disposition', `attachment; filename="speech.${format}"`);

  // llm-sdk returns a Response-like object with arrayBuffer()
  const buffer = Buffer.from(await audioResponse.arrayBuffer());
  res.end(buffer);
});

// ── Embeddings ───────────────────────────────────────────────────────────────

const createEmbedding = catchAsync(async (req, res) => {
  const { input, model, encoding_format } = req.body;
  const result = await LlmService.createEmbedding(input, { model, encoding_format });
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Embeddings generated.', data: result });
});

// ── Batches ──────────────────────────────────────────────────────────────────

const createBatch = catchAsync(async (req, res) => {
  const result = await LlmService.createBatch(req.body);
  sendResponse(res, { statusCode: httpStatus.CREATED, success: true, message: 'Batch created.', data: result });
});

const listBatches = catchAsync(async (req, res) => {
  const result = await LlmService.listBatches();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Batches listed.', data: result });
});

const getBatch = catchAsync(async (req, res) => {
  const result = await LlmService.getBatch(req.params.batchId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Batch retrieved.', data: result });
});

const cancelBatch = catchAsync(async (req, res) => {
  const result = await LlmService.cancelBatch(req.params.batchId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Batch cancelled.', data: result });
});

// ── Files ────────────────────────────────────────────────────────────────────

const uploadFile = catchAsync(async (req, res) => {
  if (!req.file) {
    return res.status(httpStatus.BAD_REQUEST).json({ success: false, message: 'File is required.' });
  }
  const result = await LlmService.uploadFile(req.file.path, req.body.purpose || 'batch');
  sendResponse(res, { statusCode: httpStatus.CREATED, success: true, message: 'File uploaded.', data: result });
});

const listFiles = catchAsync(async (req, res) => {
  const result = await LlmService.listFiles();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Files listed.', data: result });
});

const getFile = catchAsync(async (req, res) => {
  const result = await LlmService.getFile(req.params.fileId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'File retrieved.', data: result });
});

const deleteFile = catchAsync(async (req, res) => {
  const result = await LlmService.deleteFile(req.params.fileId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'File deleted.', data: result });
});

const getFileContent = catchAsync(async (req, res) => {
  const result = await LlmService.getFileContent(req.params.fileId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'File content retrieved.', data: result });
});

export const LlmController = {
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

export default LlmController;
