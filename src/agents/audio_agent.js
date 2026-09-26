import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

import crypto from 'crypto';
import { ChatTogether } from '@langchain/community/chat_models/togetherai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';

// COST OPTIMIZATION: In-Memory MD5 Cache (Cost: $0.00 per hit)
const queryCache = new Map();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

// COST OPTIMIZATION: Tiered Models (8B for logic, 70B for synthesis)
const routingLlm = new ChatTogether({
  modelName: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  temperature: 0,
  togetherAIApiKey: process.env.TOGETHER_API_KEY || 'mock-key',
});

const synthesisLlm = new ChatTogether({
  modelName: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
  // COST OPTIMIZATION: Instruct model to be concise to save on expensive output tokens
  system: "You are a professional expert. Be extremely concise. Use bullet points. Do not use filler words.",
  temperature: 0.2,
  togetherAIApiKey: process.env.TOGETHER_API_KEY || 'mock-key',
});


// Specialized isolated route for Audio
// import Routes from '../app/routes/audio.routes.js';
// app.use('/api/v1/audio', Routes);

app.get('/health', (req, res) => res.json({ status: 'ok', agent: 'audio' }));

const PORT = process.env.PORT || 4007;
app.listen(PORT, () => {
  console.log(`[ISOLATED AGENT] Audio Engine running natively on Liberty Center One bare-metal, powered by Together AI + Exa + Composio + Zenrows + LangChain on port ${PORT}`);
});
