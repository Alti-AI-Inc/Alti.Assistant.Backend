import crypto from 'crypto';
import * as cheerio from 'cheerio';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { groqChat } from '../../services/groq.client.js';
import { logger } from '../../../shared/logger.js';
import { OpenClawAgent, OpenClawMemory, OpenClawTask } from './openclaw.model.js';

const SKILLS = [
  { id: 'gitcrawl', name: 'GitCrawl', description: 'Index and extract files from local Git repositories', category: 'developer_tools' },
  { id: 'webcrawl', name: 'WebCrawl', description: 'Local-first headless HTML parser and markdown extractor', category: 'research' },
  { id: 'repotriage', name: 'RepoTriage', description: 'Analyze code diffs or snippets for automated review', category: 'automation' },
];

export const OpenClawService = {
  /**
   * Spawns a persistent OpenClaw daemon agent with autonomous memory
   */
  async createAgent({ name, role = 'Autonomous Assistant', instructions = '', enabledSkills = [] }) {
    const agentId = `claw-${crypto.randomUUID().slice(0, 8)}`;
    
    const agent = await OpenClawAgent.create({
      agentId,
      name,
      role,
      instructions,
      enabledSkills: enabledSkills.length > 0 ? enabledSkills : SKILLS.map(s => s.id),
      status: 'active',
    });

    await OpenClawMemory.create({
      agentId,
      type: 'system',
      content: `Agent initialized with role: ${role}. Instructions: ${instructions}`,
    });

    logger.info(`[OpenClaw] Agent spawned to DB: ${agentId}`);
    return agent;
  },

  /**
   * Retrieves agent state and episodic memory
   */
  async getAgent(agentId) {
    const agent = await OpenClawAgent.findOne({ agentId });
    if (!agent) throw new Error(`OpenClaw agent not found: ${agentId}`);
    
    const memory = await OpenClawMemory.find({ agentId }).sort({ createdAt: 1 }).limit(50);
    return { ...agent.toObject(), memory };
  },

  /**
   * Interacts with persistent agent preserving conversational state and identity
   */
  async sendMessage(agentId, message, userId) {
    const agent = await OpenClawAgent.findOne({ agentId });
    if (!agent) throw new Error(`OpenClaw agent not found: ${agentId}`);

    // Persist user message
    await OpenClawMemory.create({
      agentId,
      type: 'user',
      userId,
      content: message,
    });

    const recentMemory = await OpenClawMemory.find({ agentId }).sort({ createdAt: -1 }).limit(10);
    const contextMessages = recentMemory.reverse().map(m => ({
      role: (m.type === 'user' || m.type === 'system') ? m.type : 'assistant',
      content: m.content,
    }));

    const systemPrompt = `You are ${agent.name}, an autonomous persistent AI agent running on OpenClaw.
Role: ${agent.role}
Available skills: ${agent.enabledSkills.join(', ')}
Maintain your persistent identity and utilize your memory.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...contextMessages,
    ];

    const response = await groqChat(messages, { model: 'gpt-oss-120b', temperature: 0.3 });
    const reply = response.choices?.[0]?.message?.content || 'Acknowledged.';

    // Store agent response
    await OpenClawMemory.create({
      agentId,
      type: 'agent',
      content: reply,
    });

    return { agentId, reply, timestamp: new Date().toISOString() };
  },

  async listSkills() {
    return SKILLS;
  },

  /**
   * Execute an OpenClaw skill actively (No mocks)
   */
  async executeSkill(skillId, params = {}) {
    const skill = SKILLS.find(s => s.id === skillId);
    if (!skill) throw new Error(`Skill not recognized: ${skillId}`);

    const taskId = `task-${crypto.randomUUID().slice(0, 8)}`;
    const task = await OpenClawTask.create({
      taskId,
      agentId: params.agentId || 'system',
      skillId,
      input: params,
      status: 'running',
    });

    try {
      let result;
      switch (skillId) {
        case 'webcrawl':
          result = await this.crawlUrl(params.url);
          break;
        case 'gitcrawl':
          result = await this.crawlRepo(params.repoPath || process.cwd());
          break;
        case 'repotriage':
          result = await this.triageCode(params.diff || params.codeSnippet);
          break;
        default:
          throw new Error('Skill implementation missing');
      }

      task.status = 'completed';
      task.result = result;
      await task.save();
      return result;
    } catch (err) {
      task.status = 'failed';
      task.errorMessage = err.message;
      await task.save();
      throw err;
    }
  },

  /**
   * Skill 1: WebCrawl
   */
  async crawlUrl(url) {
    if (!url) throw new Error('URL is required for crawling');
    const res = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'OpenClaw-Bot/1.0' } });
    const $ = cheerio.load(res.data);
    $('script, style, nav, footer, noscript').remove();
    const text = $('body').text().replace(/\\s+/g, ' ').trim().slice(0, 5000);
    return { url, title: $('title').text().trim(), contentPreview: text, contentLength: text.length };
  },

  /**
   * Skill 2: GitCrawl (Real file tree traversal)
   */
  async crawlRepo(repoPath) {
    try {
      if (!fs.existsSync(repoPath)) throw new Error('Path does not exist');
      const gitLog = execSync(`git -C "${repoPath}" log -3 --oneline`).toString().trim();
      const files = execSync(`git -C "${repoPath}" ls-tree -r main --name-only`).toString().trim().split('\\n').slice(0, 20);
      return { repoPath, latestCommits: gitLog.split('\\n'), sampleFiles: files, status: 'indexed' };
    } catch (err) {
      return { error: err.message, fallback: 'Could not run native git commands' };
    }
  },

  /**
   * Skill 3: RepoTriage (Real Groq LLM analysis)
   */
  async triageCode(codeText) {
    if (!codeText) throw new Error('Code snippet required');
    const response = await groqChat([
      { role: 'system', content: 'You are an elite code reviewer. Analyze this code for bugs, security, and style. Return JSON output.' },
      { role: 'user', content: codeText }
    ], { model: 'gpt-oss-20b', temperature: 0.1 });
    
    return { analysis: response.choices?.[0]?.message?.content || 'No analysis' };
  }
};

export default OpenClawService;
