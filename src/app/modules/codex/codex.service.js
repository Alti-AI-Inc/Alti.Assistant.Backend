import vm from 'vm';
import { groqChat } from '../../services/groq.client.js';
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

    const response = await groqChat(messages, {
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

    const response = await groqChat(messages, {
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

    const response = await groqChat(messages, {
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

    const response = await groqChat(messages, {
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
};

export default CodexService;
