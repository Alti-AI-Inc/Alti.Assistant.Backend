import { Client } from 'langsmith';
import { traceable } from 'langsmith/traceable';
import { RunTree } from 'langsmith/run_trees';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

// ─── LangSmith Client ───────────────────────────────────────────────────────

function getClient() {
  return new Client({
    apiKey: config.langsmith?.apiKey || process.env.LANGSMITH_API_KEY,
    apiUrl: process.env.LANGSMITH_ENDPOINT || 'https://api.smith.langchain.com',
  });
}

const PROJECT_NAME = process.env.LANGSMITH_PROJECT || 'aphura-ai';

// ═══════════════════════════════════════════════════════════════════════════════
//  LANGSMITH FULL OBSERVABILITY SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export const LangSmithService = {

  // ─── 1. PROJECTS ─────────────────────────────────────────────────────────

  async listProjects() {
    const client = getClient();
    const projects = [];
    for await (const project of client.listProjects()) {
      projects.push({
        id: project.id,
        name: project.name,
        description: project.description,
        createdAt: project.created_at,
        runCount: project.run_count,
        feedbackStats: project.feedback_stats,
      });
    }
    return { projects, count: projects.length };
  },

  async getProjectStats({ projectName }) {
    const client = getClient();
    const project = await client.readProject({ projectName: projectName || PROJECT_NAME });
    return {
      id: project.id,
      name: project.name,
      runCount: project.run_count,
      latencyP50: project.latency_p50,
      latencyP99: project.latency_p99,
      errorRate: project.error_rate,
      totalTokens: project.total_tokens,
      totalCost: project.total_cost,
      feedbackStats: project.feedback_stats,
      lastRunStartTime: project.last_run_start_time,
    };
  },

  // ─── 2. TRACES / RUNS ───────────────────────────────────────────────────

  async listRuns({ projectName, limit = 20, filter, startTime, endTime }) {
    const client = getClient();
    const runs = [];
    const opts = {
      projectName: projectName || PROJECT_NAME,
      limit,
    };
    if (filter) opts.filter = filter;
    if (startTime) opts.startTime = new Date(startTime);
    if (endTime) opts.endTime = new Date(endTime);

    for await (const run of client.listRuns(opts)) {
      runs.push({
        id: run.id,
        name: run.name,
        runType: run.run_type,
        status: run.status,
        startTime: run.start_time,
        endTime: run.end_time,
        latency: run.latency,
        totalTokens: run.total_tokens,
        promptTokens: run.prompt_tokens,
        completionTokens: run.completion_tokens,
        totalCost: run.total_cost,
        error: run.error,
        feedbackStats: run.feedback_stats,
      });
      if (runs.length >= limit) break;
    }
    return { runs, count: runs.length };
  },

  async getRun({ runId }) {
    const client = getClient();
    const run = await client.readRun(runId);
    return {
      id: run.id,
      name: run.name,
      runType: run.run_type,
      status: run.status,
      inputs: run.inputs,
      outputs: run.outputs,
      error: run.error,
      startTime: run.start_time,
      endTime: run.end_time,
      latency: run.latency,
      totalTokens: run.total_tokens,
      totalCost: run.total_cost,
      parentRunId: run.parent_run_id,
      childRunIds: run.child_run_ids,
      tags: run.tags,
      extra: run.extra,
    };
  },

  async shareRun({ runId }) {
    const client = getClient();
    const sharedUrl = await client.shareRun(runId);
    return { runId, sharedUrl };
  },

  // ─── 3. DATASETS ────────────────────────────────────────────────────────

  async createDataset({ name, description, dataType = 'kv' }) {
    const client = getClient();
    const dataset = await client.createDataset(name, { description, dataType });
    return {
      id: dataset.id,
      name: dataset.name,
      description: dataset.description,
      createdAt: dataset.created_at,
    };
  },

  async listDatasets() {
    const client = getClient();
    const datasets = [];
    for await (const ds of client.listDatasets()) {
      datasets.push({
        id: ds.id,
        name: ds.name,
        description: ds.description,
        exampleCount: ds.example_count,
        createdAt: ds.created_at,
      });
    }
    return { datasets, count: datasets.length };
  },

  async getDataset({ datasetId, datasetName }) {
    const client = getClient();
    const ds = await client.readDataset({ datasetId, datasetName });
    return {
      id: ds.id,
      name: ds.name,
      description: ds.description,
      exampleCount: ds.example_count,
    };
  },

  async deleteDataset({ datasetId }) {
    const client = getClient();
    await client.deleteDataset({ datasetId });
    return { deleted: true, datasetId };
  },

  // ─── 4. EXAMPLES (Dataset Entries) ──────────────────────────────────────

  async addExamples({ datasetId, datasetName, examples }) {
    const client = getClient();
    const inputs = examples.map(e => e.input);
    const outputs = examples.map(e => e.output);

    const created = await client.createExamples({
      datasetId,
      datasetName,
      inputs,
      outputs,
    });
    return { created: examples.length, datasetId: datasetId || datasetName };
  },

  async listExamples({ datasetId, datasetName, limit = 50 }) {
    const client = getClient();
    const examples = [];
    for await (const ex of client.listExamples({ datasetId, datasetName })) {
      examples.push({
        id: ex.id,
        inputs: ex.inputs,
        outputs: ex.outputs,
        createdAt: ex.created_at,
      });
      if (examples.length >= limit) break;
    }
    return { examples, count: examples.length };
  },

  // ─── 5. FEEDBACK ────────────────────────────────────────────────────────

  async createFeedback({ runId, key, score, value, comment }) {
    const client = getClient();
    const feedback = await client.createFeedback(runId, key, {
      score,
      value,
      comment,
    });
    return {
      id: feedback.id,
      runId,
      key,
      score,
      value,
      comment,
    };
  },

  async listFeedback({ runId }) {
    const client = getClient();
    const feedbacks = [];
    for await (const fb of client.listFeedback({ runIds: [runId] })) {
      feedbacks.push({
        id: fb.id,
        key: fb.key,
        score: fb.score,
        value: fb.value,
        comment: fb.comment,
        createdAt: fb.created_at,
      });
    }
    return { feedbacks, count: feedbacks.length };
  },

  async createPresignedFeedbackToken({ runId, feedbackKey }) {
    const client = getClient();
    const token = await client.createPresignedFeedbackToken(runId, feedbackKey);
    return { runId, feedbackKey, token };
  },

  // ─── 6. ANNOTATION QUEUES ──────────────────────────────────────────────

  async createAnnotationQueue({ name, description }) {
    const client = getClient();
    const queue = await client.createAnnotationQueue({ name, description });
    return {
      id: queue.id,
      name: queue.name,
      description: queue.description,
    };
  },

  async listAnnotationQueues() {
    const client = getClient();
    const queues = [];
    for await (const q of client.listAnnotationQueues()) {
      queues.push({
        id: q.id,
        name: q.name,
        description: q.description,
        numPending: q.num_pending,
      });
    }
    return { queues, count: queues.length };
  },

  // ─── 7. PROMPT HUB ──────────────────────────────────────────────────────

  async pushPrompt({ promptName, prompt, description, tags }) {
    const client = getClient();
    const result = await client.pushPrompt(promptName, {
      object: prompt,
      description,
      tags,
    });
    return { promptName, pushed: true, result };
  },

  async pullPrompt({ promptName }) {
    const client = getClient();
    const prompt = await client.pullPrompt(promptName);
    return { promptName, prompt };
  },

  async listPrompts() {
    const client = getClient();
    const prompts = [];
    try {
      for await (const p of client.listPrompts()) {
        prompts.push({
          repoHandle: p.repo_handle,
          description: p.description,
          numLikes: p.num_likes,
          numDownloads: p.num_downloads,
          tags: p.tags,
          lastCommitHash: p.last_commit_hash,
          updatedAt: p.updated_at,
        });
      }
    } catch (e) {
      logger.warn(`[LangSmith] listPrompts partial: ${e.message}`);
    }
    return { prompts, count: prompts.length };
  },

  // ─── 8. EVALUATION ──────────────────────────────────────────────────────

  async runEvaluation({ datasetName, evaluatorFn, chainFn, projectName }) {
    // This is a programmatic evaluation — chainFn and evaluatorFn are defined server-side
    // In practice, we call evaluate() from langsmith/evaluation
    const client = getClient();
    const dataset = await client.readDataset({ datasetName });

    // Collect examples
    const examples = [];
    for await (const ex of client.listExamples({ datasetId: dataset.id })) {
      examples.push(ex);
    }

    return {
      datasetName,
      exampleCount: examples.length,
      message: 'Evaluation infrastructure ready. Configure evaluator functions in code.',
      framework: 'LangSmith Evaluation',
    };
  },

  // ─── 9. MONITORING DASHBOARD ─────────────────────────────────────────────

  async getMonitoringDashboard() {
    const client = getClient();

    const [projects, datasets] = await Promise.allSettled([
      (async () => {
        const p = [];
        for await (const proj of client.listProjects()) {
          p.push({
            name: proj.name,
            runCount: proj.run_count,
            latencyP50: proj.latency_p50,
            errorRate: proj.error_rate,
            totalCost: proj.total_cost,
          });
        }
        return p;
      })(),
      (async () => {
        const d = [];
        for await (const ds of client.listDatasets()) {
          d.push({ name: ds.name, exampleCount: ds.example_count });
        }
        return d;
      })(),
    ]);

    return {
      projects: projects.status === 'fulfilled' ? projects.value : [],
      datasets: datasets.status === 'fulfilled' ? datasets.value : [],
      timestamp: new Date().toISOString(),
      framework: 'LangSmith Monitoring Dashboard',
    };
  },

  // ─── 10. TRACEABLE WRAPPER ───────────────────────────────────────────────

  getTraceable() {
    return traceable;
  },

  // ─── 11. CREATE RUN TREE (Manual Tracing) ────────────────────────────────

  async createRunTree({ name, runType = 'chain', inputs }) {
    const rt = new RunTree({
      name,
      run_type: runType,
      inputs,
      project_name: PROJECT_NAME,
    });
    await rt.postRun();
    return {
      runId: rt.id,
      name,
      runType,
      status: 'posted',
    };
  },
};

export default LangSmithService;
