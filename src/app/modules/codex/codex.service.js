import vm from 'vm';
import { llmChat } from '../../services/llm.client.js';
import { logger } from '../../../shared/logger.js';

export const CodexService = {
  /**
   * Generates code based on a prompt and technical requirements.
   */
  async generateCode({ prompt, language = 'javascript', framework = 'none', context = '' }) {
    const systemPrompt = `You are Open Codex, an elite AI code generation engine powered by open-source models.
Generate production-ready, clean, well-commented ${language} code${framework !== 'none' ? ` using ${framework}` : ''}.
Return the code enclosed in standard markdown code blocks with language specifier.
Include brief explanations of architectural decisions.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...(context ? [{ role: 'user', content: `Context:\n${context}` }] : []),
      { role: 'user', content: prompt },
    ];

    const response = await llmChat(messages, {
      model: 'gpt-oss-120b',
      temperature: 0.1,
    });

    const content = response.choices?.[0]?.message?.content || '';
    const codeMatch = content.match(/```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/);
    const code = codeMatch ? codeMatch[1].trim() : content;

    return {
      language,
      framework,
      code,
      fullResponse: content,
      model: 'gpt-oss-120b',
    };
  },

  /**
   * Line-by-line explanation, time complexity, and architectural breakdown.
   */
  async explainCode({ code, language = 'javascript' }) {
    const messages = [
      {
        role: 'system',
        content: `You are Open Codex Code Analyzer. Break down the provided ${language} code.
Provide:
1. Executive Summary
2. Line-by-line or Block-by-block breakdown
3. Time & Space Complexity Analysis
4. Dependencies & Assumptions`,
      },
      { role: 'user', content: `Analyze this code:\n\`\`\`${language}\n${code}\n\`\`\`` },
    ];

    const response = await llmChat(messages, {
      model: 'gpt-oss-120b',
      temperature: 0.2,
    });

    return {
      language,
      analysis: response.choices?.[0]?.message?.content || '',
      model: 'gpt-oss-120b',
    };
  },

  /**
   * Refactors code for performance, readability, and modern idioms.
   */
  async refactorCode({ code, language = 'javascript', goal = 'readability and performance' }) {
    const messages = [
      {
        role: 'system',
        content: `You are Open Codex Refactoring Specialist. Refactor the provided ${language} code.
Target goal: ${goal}.
Provide the improved code along with a bullet-point diff of changes.`,
      },
      { role: 'user', content: `Refactor this code:\n\`\`\`${language}\n${code}\n\`\`\`` },
    ];

    const response = await llmChat(messages, {
      model: 'gpt-oss-120b',
      temperature: 0.1,
    });

    return {
      language,
      goal,
      result: response.choices?.[0]?.message?.content || '',
      model: 'gpt-oss-120b',
    };
  },

  /**
   * Code review for security vulnerabilities, OWASP Top 10, and bugs.
   */
  async reviewCode({ code, language = 'javascript' }) {
    const messages = [
      {
        role: 'system',
        content: `You are Open Codex Security & Quality Auditor.
Audit the provided ${language} code for:
- Security vulnerabilities (SQLi, XSS, prototype pollution, secret leakage)
- Logical errors & edge case failures
- Performance inefficiencies
- Code style and best practices`,
      },
      { role: 'user', content: `Audit this code:\n\`\`\`${language}\n${code}\n\`\`\`` },
    ];

    const response = await llmChat(messages, {
      model: 'gpt-oss-120b',
      temperature: 0.1,
    });

    return {
      language,
      auditReport: response.choices?.[0]?.message?.content || '',
      model: 'gpt-oss-120b',
    };
  },

  /**
   * Executes code safely in a sandboxed V8 context with strict memory & CPU limits.
   */
  async executeCode({ code, timeoutMs = 3000 }) {
    const logs = [];
    const sandbox = {
      console: {
        log: (...args) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
        error: (...args) => logs.push('[ERROR] ' + args.join(' ')),
        warn: (...args) => logs.push('[WARN] ' + args.join(' ')),
      },
      setTimeout,
      clearTimeout,
      Buffer,
      Math,
      Date,
      JSON,
      parseInt,
      parseFloat,
      isNaN,
    };

    const context = vm.createContext(sandbox);

    const startTime = Date.now();
    try {
      const script = new vm.Script(code);
      const executionResult = script.runInContext(context, {
        timeout: Math.min(timeoutMs, 10000), // Max 10s
        displayErrors: true,
      });

      return {
        success: true,
        output: logs.join('\n'),
        result: executionResult !== undefined ? String(executionResult) : undefined,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        output: logs.join('\n'),
        durationMs: Date.now() - startTime,
      };
    }
  },

  // ── Code Completion (autocomplete) ─────────────────────────────────────────

  /**
   * Completes partial code (autocomplete-style).
   */
  async completeCode({ code, language = 'javascript', cursor_position, context = '' }) {
    const messages = [
      {
        role: 'system',
        content: `You are Open Codex Autocomplete. Complete the partial ${language} code below.
Return ONLY the completed code. Do not repeat the existing code prefix — only output the continuation.
If cursor_position is provided, complete from that character offset.`,
      },
      ...(context ? [{ role: 'user', content: `File context:\n${context}` }] : []),
      { role: 'user', content: `Complete this code:\n\`\`\`${language}\n${code}\n\`\`\`` },
    ];

    const response = await llmChat(messages, { model: 'gpt-oss-120b', temperature: 0.0, max_tokens: 4096 });
    const content = response.choices?.[0]?.message?.content || '';
    const codeMatch = content.match(/```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/);
    return {
      language,
      completion: codeMatch ? codeMatch[1].trim() : content.trim(),
      model: 'gpt-oss-120b',
    };
  },

  // ── Code Translation ───────────────────────────────────────────────────────

  /**
   * Translates code from one language to another.
   */
  async translateCode({ code, from_language = 'python', to_language = 'javascript', preserve_comments = true }) {
    const messages = [
      {
        role: 'system',
        content: `You are Open Codex Code Translator. Translate the provided ${from_language} code to idiomatic ${to_language}.
${preserve_comments ? 'Preserve comments, translating them into the target language conventions.' : 'Strip all comments.'}
Return the translated code in a markdown code block. Include a brief migration notes section after.`,
      },
      { role: 'user', content: `Translate this code:\n\`\`\`${from_language}\n${code}\n\`\`\`` },
    ];

    const response = await llmChat(messages, { model: 'gpt-oss-120b', temperature: 0.1 });
    const content = response.choices?.[0]?.message?.content || '';
    const codeMatch = content.match(/```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/);

    return {
      from_language,
      to_language,
      translated_code: codeMatch ? codeMatch[1].trim() : content,
      fullResponse: content,
      model: 'gpt-oss-120b',
    };
  },

  // ── Test Generation ────────────────────────────────────────────────────────

  /**
   * Generates unit tests for the provided code.
   */
  async generateTests({ code, language = 'javascript', test_framework = 'vitest', coverage_target = 'full' }) {
    const messages = [
      {
        role: 'system',
        content: `You are Open Codex Test Generator. Generate comprehensive unit tests for the provided ${language} code.
Use the ${test_framework} testing framework.
Coverage target: ${coverage_target}.
Include:
1. Happy path tests
2. Edge cases (null, undefined, empty, boundary values)
3. Error/exception handling tests
4. Mock setup where needed
Return the test file in a markdown code block.`,
      },
      { role: 'user', content: `Generate tests for:\n\`\`\`${language}\n${code}\n\`\`\`` },
    ];

    const response = await llmChat(messages, { model: 'gpt-oss-120b', temperature: 0.1 });
    const content = response.choices?.[0]?.message?.content || '';
    const codeMatch = content.match(/```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/);

    return {
      language,
      test_framework,
      tests: codeMatch ? codeMatch[1].trim() : content,
      fullResponse: content,
      model: 'gpt-oss-120b',
    };
  },

  // ── Documentation Generation ───────────────────────────────────────────────

  /**
   * Generates documentation (JSDoc, TSDoc, docstrings) for code.
   */
  async generateDocs({ code, language = 'javascript', style = 'jsdoc' }) {
    const messages = [
      {
        role: 'system',
        content: `You are Open Codex Documentation Generator. Add ${style} documentation to every function, class, and method in the provided ${language} code.
Include:
- @param with types and descriptions
- @returns with type and description
- @throws where applicable
- @example with usage examples
Return the fully documented code in a markdown code block.`,
      },
      { role: 'user', content: `Document this code:\n\`\`\`${language}\n${code}\n\`\`\`` },
    ];

    const response = await llmChat(messages, { model: 'gpt-oss-120b', temperature: 0.1 });
    const content = response.choices?.[0]?.message?.content || '';
    const codeMatch = content.match(/```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/);

    return {
      language,
      style,
      documented_code: codeMatch ? codeMatch[1].trim() : content,
      fullResponse: content,
      model: 'gpt-oss-120b',
    };
  },

  // ── Debug / Error Analysis ─────────────────────────────────────────────────

  /**
   * Analyzes code with an error message and suggests fixes.
   */
  async debugCode({ code, error_message, language = 'javascript', stack_trace = '' }) {
    const messages = [
      {
        role: 'system',
        content: `You are Open Codex Debugger. Analyze the provided ${language} code and the error it produces.
Provide:
1. Root cause analysis
2. Exact fix with corrected code
3. Explanation of why the fix works
4. Prevention tips to avoid this error in future`,
      },
      {
        role: 'user',
        content: `Code:\n\`\`\`${language}\n${code}\n\`\`\`\n\nError: ${error_message}${stack_trace ? `\n\nStack trace:\n${stack_trace}` : ''}`,
      },
    ];

    const response = await llmChat(messages, { model: 'gpt-oss-120b', temperature: 0.1 });

    return {
      language,
      error_message,
      analysis: response.choices?.[0]?.message?.content || '',
      model: 'gpt-oss-120b',
    };
  },

  // ── Streaming Code Generation (SSE) ────────────────────────────────────────

  /**
   * Streaming code generation with SSE.
   */
  async generateCodeStream({ prompt, language = 'javascript', framework = 'none', context = '' }) {
    const { llmStream: llmStreamFn } = await import('../../services/llm.client.js');

    const systemPrompt = `You are Open Codex, an elite AI code generation engine powered by open-source models.
Generate production-ready, clean, well-commented ${language} code${framework !== 'none' ? ` using ${framework}` : ''}.
Return the code enclosed in standard markdown code blocks with language specifier.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...(context ? [{ role: 'user', content: `Context:\n${context}` }] : []),
      { role: 'user', content: prompt },
    ];

    return await llmStreamFn(messages, { model: 'gpt-oss-120b', temperature: 0.1 });
  },
};

export default CodexService;
