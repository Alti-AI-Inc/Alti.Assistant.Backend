/**
 * LangChain LCEL (LangChain Expression Language) Advanced Patterns
 * Covers: RunnableSequence, RunnableParallel, RunnableBranch, RunnablePassthrough,
 * RunnableWithMessageHistory, RunnableLambda, fallbacks, retries, batch, streaming
 */
import { ChatTogetherAI } from '@langchain/together-ai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { RunnableSequence, RunnableParallel, RunnablePassthrough, RunnableLambda, RunnableBranch } from '@langchain/core/runnables';
import { RunnableWithMessageHistory } from '@langchain/core/runnables';
import { ChatMessageHistory } from 'langchain/stores/message/in_memory';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { CommaSeparatedListOutputParser } from '@langchain/core/output_parsers';
import { StructuredOutputParser } from 'langchain/output_parsers';
import { z } from 'zod';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

function getLLM(temperature = 0.2) {
  return new ChatTogetherAI({
    apiKey: config.llm?.apiKey || process.env.TOGETHER_API_KEY,
    model: config.llm?.model || 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    temperature,
  });
}

export const LCELService = {

  // ─── 1. RUNNABLE SEQUENCE (Pipe Chains) ──────────────────────────────────
  async runSequence({ input, steps }) {
    const llm = getLLM(0.2);
    const parser = new StringOutputParser();

    // Build a multi-step LCEL pipeline
    const chain = RunnableSequence.from([
      ChatPromptTemplate.fromMessages([
        ['system', 'You are a helpful assistant. Process the input through multiple reasoning steps.'],
        ['human', '{input}'],
      ]),
      llm,
      parser,
    ]);

    const result = await chain.invoke({ input });
    return { input, output: result, framework: 'LCEL RunnableSequence' };
  },

  // ─── 2. RUNNABLE PARALLEL (Fan-Out) ──────────────────────────────────────
  async runParallel({ input }) {
    const llm = getLLM(0.3);
    const parser = new StringOutputParser();

    const parallelChain = RunnableParallel.from({
      summary: RunnableSequence.from([
        ChatPromptTemplate.fromMessages([['system', 'Summarize this in 2 sentences.'], ['human', '{input}']]),
        llm, parser,
      ]),
      keyPoints: RunnableSequence.from([
        ChatPromptTemplate.fromMessages([['system', 'Extract 5 key points as a bullet list.'], ['human', '{input}']]),
        llm, parser,
      ]),
      sentiment: RunnableSequence.from([
        ChatPromptTemplate.fromMessages([['system', 'Classify the sentiment as positive, negative, or neutral. Return only the classification.'], ['human', '{input}']]),
        llm, parser,
      ]),
      topics: RunnableSequence.from([
        ChatPromptTemplate.fromMessages([['system', 'List the top 3 topics mentioned, comma separated.'], ['human', '{input}']]),
        llm, parser,
      ]),
    });

    const result = await parallelChain.invoke({ input });
    return { input, ...result, framework: 'LCEL RunnableParallel' };
  },

  // ─── 3. RUNNABLE BRANCH (Conditional Routing) ───────────────────────────
  async runBranch({ input }) {
    const llm = getLLM(0.1);
    const parser = new StringOutputParser();
    const classifierChain = RunnableSequence.from([
      ChatPromptTemplate.fromMessages([
        ['system', 'Classify the input as: code, math, creative, or general. Return only the category.'],
        ['human', '{input}'],
      ]),
      llm, parser,
    ]);

    const category = (await classifierChain.invoke({ input })).trim().toLowerCase();

    const branches = {
      code: RunnableSequence.from([
        ChatPromptTemplate.fromMessages([['system', 'You are an elite software engineer.'], ['human', '{input}']]),
        llm, parser,
      ]),
      math: RunnableSequence.from([
        ChatPromptTemplate.fromMessages([['system', 'You are a mathematician. Show step-by-step work.'], ['human', '{input}']]),
        llm, parser,
      ]),
      creative: RunnableSequence.from([
        ChatPromptTemplate.fromMessages([['system', 'You are a creative writer.'], ['human', '{input}']]),
        llm, parser,
      ]),
    };

    const defaultChain = RunnableSequence.from([
      ChatPromptTemplate.fromMessages([['system', 'You are a helpful assistant.'], ['human', '{input}']]),
      llm, parser,
    ]);

    const selectedChain = branches[category] || defaultChain;
    const result = await selectedChain.invoke({ input });

    return { input, category, output: result, framework: 'LCEL RunnableBranch' };
  },

  // ─── 4. RUNNABLE WITH MESSAGE HISTORY ────────────────────────────────────
  async runWithHistory({ input, sessionId }) {
    const llm = getLLM(0.3);
    const parser = new StringOutputParser();

    // In-memory store (swap for MongoDB/Redis in production)
    const messageHistories = {};
    const getMessageHistory = (sid) => {
      if (!messageHistories[sid]) messageHistories[sid] = new ChatMessageHistory();
      return messageHistories[sid];
    };

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', 'You are a helpful assistant. Use conversation history for context.'],
      new MessagesPlaceholder('history'),
      ['human', '{input}'],
    ]);

    const chain = prompt.pipe(llm).pipe(parser);

    const chainWithHistory = new RunnableWithMessageHistory({
      runnable: chain,
      getMessageHistory,
      inputMessagesKey: 'input',
      historyMessagesKey: 'history',
    });

    const result = await chainWithHistory.invoke(
      { input },
      { configurable: { sessionId: sessionId || 'default' } }
    );

    return { input, sessionId, output: result, framework: 'LCEL RunnableWithMessageHistory' };
  },

  // ─── 5. BATCH PROCESSING ────────────────────────────────────────────────
  async runBatch({ inputs, concurrency = 5 }) {
    const llm = getLLM(0.2);
    const parser = new StringOutputParser();

    const chain = RunnableSequence.from([
      ChatPromptTemplate.fromMessages([['system', 'Answer concisely.'], ['human', '{input}']]),
      llm, parser,
    ]);

    const results = await chain.batch(
      inputs.map(input => ({ input })),
      {}, // config
      { maxConcurrency: concurrency }
    );

    return {
      batchSize: inputs.length,
      results: inputs.map((input, i) => ({ input, output: results[i] })),
      framework: 'LCEL Batch Processing',
    };
  },

  // ─── 6. STREAMING ───────────────────────────────────────────────────────
  async *streamChain({ input }) {
    const llm = getLLM(0.2);
    const parser = new StringOutputParser();

    const chain = RunnableSequence.from([
      ChatPromptTemplate.fromMessages([['system', 'You are a helpful assistant.'], ['human', '{input}']]),
      llm, parser,
    ]);

    const stream = await chain.stream({ input });
    for await (const chunk of stream) {
      yield chunk;
    }
  },

  // ─── 7. FALLBACK CHAINS ─────────────────────────────────────────────────
  async runWithFallback({ input }) {
    const primaryLLM = getLLM(0.2);
    const fallbackLLM = new ChatTogetherAI({
      apiKey: config.llm?.apiKey || process.env.TOGETHER_API_KEY,
      model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
      temperature: 0.2,
    });
    const parser = new StringOutputParser();

    const primaryChain = RunnableSequence.from([
      ChatPromptTemplate.fromMessages([['system', 'You are a helpful assistant.'], ['human', '{input}']]),
      primaryLLM, parser,
    ]);

    const fallbackChain = RunnableSequence.from([
      ChatPromptTemplate.fromMessages([['system', 'You are a helpful assistant.'], ['human', '{input}']]),
      fallbackLLM, parser,
    ]);

    const chainWithFallback = primaryChain.withFallbacks({ fallbacks: [fallbackChain] });
    const result = await chainWithFallback.invoke({ input });

    return { input, output: result, framework: 'LCEL Fallback Chain' };
  },

  // ─── 8. JSON OUTPUT PARSER ──────────────────────────────────────────────
  async parseJSON({ input, schema }) {
    const llm = getLLM(0.0);
    const parser = new JsonOutputParser();

    const chain = RunnableSequence.from([
      ChatPromptTemplate.fromMessages([
        ['system', 'Extract information and return valid JSON. No markdown, no explanation, just JSON.'],
        ['human', '{input}'],
      ]),
      llm, parser,
    ]);

    const result = await chain.invoke({ input });
    return { input, parsed: result, framework: 'LCEL JsonOutputParser' };
  },

  // ─── 9. CSV LIST OUTPUT PARSER ──────────────────────────────────────────
  async parseCSVList({ input }) {
    const llm = getLLM(0.0);
    const parser = new CommaSeparatedListOutputParser();

    const chain = RunnableSequence.from([
      ChatPromptTemplate.fromMessages([
        ['system', 'List items separated by commas. No numbering, no bullets, just comma-separated values.\n{format_instructions}'],
        ['human', '{input}'],
      ]),
      llm, parser,
    ]);

    const result = await chain.invoke({
      input,
      format_instructions: parser.getFormatInstructions(),
    });

    return { input, items: result, count: result.length, framework: 'LCEL CommaSeparatedListOutputParser' };
  },

  // ─── 10. ZOD STRUCTURED OUTPUT ──────────────────────────────────────────
  async parseZodStructured({ input, fields }) {
    const llm = getLLM(0.0);

    // Build dynamic Zod schema from field definitions
    const schemaObj = {};
    for (const field of (fields || [{ name: 'answer', type: 'string', desc: 'The answer' }])) {
      if (field.type === 'number') schemaObj[field.name] = z.number().describe(field.desc || field.name);
      else if (field.type === 'boolean') schemaObj[field.name] = z.boolean().describe(field.desc || field.name);
      else if (field.type === 'array') schemaObj[field.name] = z.array(z.string()).describe(field.desc || field.name);
      else schemaObj[field.name] = z.string().describe(field.desc || field.name);
    }

    const parser = StructuredOutputParser.fromZodSchema(z.object(schemaObj));
    const chain = RunnableSequence.from([
      ChatPromptTemplate.fromMessages([
        ['system', 'Extract information. {format_instructions}'],
        ['human', '{input}'],
      ]),
      llm, parser,
    ]);

    const result = await chain.invoke({
      input,
      format_instructions: parser.getFormatInstructions(),
    });

    return { input, parsed: result, framework: 'LCEL StructuredOutputParser (Zod)' };
  },

  // ─── 11. RUNNABLE LAMBDA (Custom Transform) ────────────────────────────
  async runLambdaTransform({ input, transformType = 'uppercase' }) {
    const llm = getLLM(0.2);
    const parser = new StringOutputParser();

    const transforms = {
      uppercase: (text) => text.toUpperCase(),
      wordcount: (text) => `Word count: ${text.split(/\s+/).length}\n\n${text}`,
      reverse: (text) => text.split('').reverse().join(''),
      extract_numbers: (text) => {
        const nums = text.match(/\d+/g);
        return `Numbers found: ${nums ? nums.join(', ') : 'none'}\n\n${text}`;
      },
    };

    const chain = RunnableSequence.from([
      ChatPromptTemplate.fromMessages([['system', 'You are a helpful assistant.'], ['human', '{input}']]),
      llm, parser,
      new RunnableLambda({ func: (text) => (transforms[transformType] || transforms.uppercase)(text) }),
    ]);

    const result = await chain.invoke({ input });
    return { input, transformType, output: result, framework: 'LCEL RunnableLambda' };
  },

  // ─── 12. PASSTHROUGH WITH RETRIEVAL ─────────────────────────────────────
  async runPassthroughRetrieval({ query, context }) {
    const llm = getLLM(0.1);
    const parser = new StringOutputParser();

    const chain = RunnableParallel.from({
      context: new RunnableLambda({ func: () => context }),
      query: new RunnablePassthrough(),
    }).pipe(
      ChatPromptTemplate.fromMessages([
        ['system', 'Answer based on context:\n{context}'],
        ['human', '{query}'],
      ])
    ).pipe(llm).pipe(parser);

    const result = await chain.invoke(query);
    return { query, output: result, framework: 'LCEL RunnablePassthrough + Retrieval' };
  },
};

export default LCELService;
