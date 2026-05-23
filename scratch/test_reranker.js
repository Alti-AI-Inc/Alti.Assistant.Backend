import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseLLM } from 'llamaindex';
import dotenv from 'dotenv';
dotenv.config();

class GoogleLLM extends BaseLLM {
  constructor(apiKey, modelName = 'gemini-3.5-flash') {
    super();
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
    this.model = this.client.getGenerativeModel({ model: this.modelName });
  }

  get metadata() {
    return {
      model: this.modelName,
      temperature: 0.1,
      topP: 1,
      maxTokens: undefined,
      contextWindow: 1000000,
      structuredOutput: true
    };
  }

  async chat(params) {
    const { messages } = params;
    const contents = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));
    const result = await this.model.generateContent({ contents });
    return {
      message: { content: result?.response?.text() || '', role: 'assistant' }
    };
  }
}

const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
  console.log('Skipping API execution - no key');
} else {
  const llm = new GoogleLLM(geminiApiKey);

  const query = 'What is Alti\'s revenue?';
  const nodes = [
    { text: 'Alti was founded in 2024. It is headquartered in San Francisco.', id: 0 },
    { text: 'In fiscal year 2025, Alti achieved a record annual revenue of $12.4 million.', id: 1 },
    { text: 'Alti\'s customer satisfaction score (CSAT) is currently 94.2%.', id: 2 },
    { text: 'The company sells AI productivity software and workflow automation agents.', id: 3 },
  ];

  const nodesStr = nodes.map((n, i) => `[Block ${i}]: ${n.text}`).join('\n\n');
  const rerankPrompt = `You are a premium AI retrieval auditor. Given a search query and a list of text blocks, select the indexes of the blocks that contain the most direct, relevant information to answer the query.
Order them by relevance, with the most relevant first.
Return ONLY a valid JSON array of numbers representing the matching block indexes, e.g. [1, 3] and nothing else. Do not write any markdown code blocks or explanations.

Search Query: ${query}

Text Blocks:
${nodesStr}

Relevant Block Indexes:`;

  console.log('Sending reranking prompt to Gemini...');
  const result = await llm.chat({
    messages: [{ role: 'user', content: rerankPrompt }]
  });
  console.log('Raw Reranking output:', result.message.content.trim());
}
