import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { BufferMemory } from 'langchain/memory';
import { ChatMessageHistory } from 'langchain/stores/message/in_memory';
import { OpenRouterSession } from './openRouter.model.js';
import { getSupportedModelNames } from './openRouter.utils.js';

const getModelDetailsService = async (req, res) => {
  const response = await fetch('https://openrouter.ai/api/v1/models');
  const json = await response.json();

  const modelDetails = json.data.map(m => ({
    id: m.id,
    name: m.name,
    description: m.description,
  }));

  return modelDetails;
};

const getSupportedModelNameService = async (req, res) => {
  const response = await fetch('https://openrouter.ai/api/v1/models');
  const json = await response.json();

  const modelName = json.data.map(m => m.id);

  return modelName;
};
// const runOpenRouterModel = async ({ sessionId, model, prompt }) => {
//   const completion = await openai.chat.completions.create({
//     model,
//     messages: [{ role: 'user', content: prompt }],
//   });

//   const reply = completion.choices[0].message.content;

//   await OpenRouterSession.create({ sessionId, model, prompt, response: reply });

//   return reply;
// };

const sessionMemoryStore = {};

export const runOpenRouterModel = async ({
  sessionId,
  userId,
  model,
  prompt,
}) => {
  // ✅ 1. Validate model using your utility
  const supportedModels = await getSupportedModelNames();

  if (!supportedModels.includes(model)) {
    throw new Error(`Model "${model}" is not supported by OpenRouter.`);
  }

  // ✅ 2. Setup session memory
  let memory = sessionMemoryStore[sessionId];
  if (!memory) {
    memory = new BufferMemory({
      returnMessages: true,
      memoryKey: 'history',
      chatHistory: new ChatMessageHistory(),
    });
    sessionMemoryStore[sessionId] = memory;
  }

  // ✅ 3. Add user message
  await memory.chatHistory.addMessage(new HumanMessage(prompt));

  // ✅ 4. Call OpenRouter model via LangChain
  const llm = new ChatOpenAI({
    configuration: {
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        // 'HTTP-Referer': 'http://localhost', // or your domain
      },
    },
    modelName: model,
  });

  const start = Date.now();
  const replyMsg = await llm.call(memory.chatHistory.messages);
  const reply = replyMsg.content;
  const duration = Date.now() - start;
  console.log(replyMsg);
  await memory.chatHistory.addMessage(new AIMessage(reply));

  // ✅ 5. Store in MongoDB
  const newEntry = {
    prompt,
    response: reply,
    model,
    total_time: duration,
  };

  let session = await OpenRouterSession.findOne({ sessionId, user: userId });

  if (session) {
    session.responses.push(newEntry);
    await session.save();
  } else {
    session = await OpenRouterSession.create({
      sessionId,
      user: userId,
      responses: [newEntry],
    });
  }

  // ✅ 6. Return output
  return {
    sessionId,
    prompt,
    reply,
    total_time: duration,
  };
};
const getSessionMessages = async sessionId => {
  return OpenRouterSession.find({ sessionId }).sort({ timestamp: 1 });
};

const deleteSession = async sessionId => {
  return OpenRouterSession.deleteMany({ sessionId });
};
export const OpenRouterService = {
  getModelDetailsService,
  getSupportedModelNameService,
  runOpenRouterModel,
  getSessionMessages,
  deleteSession,
};
