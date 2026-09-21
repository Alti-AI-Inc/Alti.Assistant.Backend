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

export const GroqController = {
  chat,
  streamChat,
  toolCall,
  transcribeAudio,
  translateAudio,
  listModels,
  lightChat,
  lightStream,
};

export default GroqController;
