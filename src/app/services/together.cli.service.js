import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════
//  Together AI CLI Service
//  Wraps every `together` CLI command for programmatic use from backend
//  CLI ref: https://docs.together.ai/reference/cli/getting-started
// ═══════════════════════════════════════════════════════════════════════

const API_KEY = process.env.TOGETHER_API_KEY || '';

function buildCmd(args) {
  const keyFlag = API_KEY ? `--api-key ${API_KEY}` : '';
  return `together ${keyFlag} ${args}`;
}

async function run(args) {
  const cmd = buildCmd(args);
  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: 120_000 });
    return { success: true, output: stdout.trim(), stderr: stderr?.trim() || null };
  } catch (error) {
    return { success: false, error: error.message, stderr: error.stderr?.trim() || null };
  }
}

// ─── MODELS ─────────────────────────────────────────────────────────

export async function cliListModels() {
  return run('models list');
}

export async function cliUploadModel(source, options = {}) {
  let cmd = `models upload ${source}`;
  if (options.name) cmd += ` --name "${options.name}"`;
  if (options.hfToken) cmd += ` --hf-token "${options.hfToken}"`;
  return run(cmd);
}

// ─── FILES ──────────────────────────────────────────────────────────

export async function cliUploadFile(filePath, options = {}) {
  let cmd = `files upload "${filePath}"`;
  if (options.purpose) cmd += ` --purpose ${options.purpose}`;
  return run(cmd);
}

export async function cliListFiles() {
  return run('files list');
}

export async function cliRetrieveFile(fileId) {
  return run(`files retrieve ${fileId}`);
}

export async function cliRetrieveFileContent(fileId, outputPath) {
  return run(`files retrieve-content ${fileId} --output "${outputPath}"`);
}

export async function cliDeleteFile(fileId) {
  return run(`files delete ${fileId}`);
}

export async function cliCheckFile(filePath) {
  return run(`files check "${filePath}"`);
}

// ─── FINE-TUNING ────────────────────────────────────────────────────

export async function cliCreateFineTune(options = {}) {
  let cmd = 'fine-tuning create';
  if (options.trainingFile) cmd += ` --training-file ${options.trainingFile}`;
  if (options.model) cmd += ` --model ${options.model}`;
  if (options.epochs) cmd += ` --n-epochs ${options.epochs}`;
  if (options.learningRate) cmd += ` --learning-rate ${options.learningRate}`;
  if (options.batchSize) cmd += ` --batch-size ${options.batchSize}`;
  if (options.suffix) cmd += ` --suffix "${options.suffix}"`;
  if (options.lora) cmd += ' --lora';
  if (options.loraR) cmd += ` --lora-r ${options.loraR}`;
  if (options.loraAlpha) cmd += ` --lora-alpha ${options.loraAlpha}`;
  if (options.loraDropout) cmd += ` --lora-dropout ${options.loraDropout}`;
  if (options.wandbApiKey) cmd += ` --wandb-api-key "${options.wandbApiKey}"`;
  return run(cmd);
}

export async function cliListFineTunes() {
  return run('fine-tuning list');
}

export async function cliRetrieveFineTune(jobId) {
  return run(`fine-tuning retrieve ${jobId}`);
}

export async function cliCancelFineTune(jobId) {
  return run(`fine-tuning cancel ${jobId}`);
}

export async function cliDeleteFineTune(jobId) {
  return run(`fine-tuning delete ${jobId}`);
}

export async function cliDownloadFineTune(jobId, options = {}) {
  let cmd = `fine-tuning download ${jobId}`;
  if (options.output) cmd += ` --output "${options.output}"`;
  if (options.checkpoint) cmd += ` --checkpoint ${options.checkpoint}`;
  return run(cmd);
}

export async function cliListCheckpoints(jobId) {
  return run(`fine-tuning list-checkpoints ${jobId}`);
}

export async function cliListFineTuneEvents(jobId) {
  return run(`fine-tuning list-events ${jobId}`);
}

// ─── ENDPOINTS (DEDICATED INFERENCE) ────────────────────────────────

export async function cliCreateEndpoint(options = {}) {
  let cmd = 'endpoints create';
  if (options.model) cmd += ` --model ${options.model}`;
  if (options.name) cmd += ` --name "${options.name}"`;
  if (options.hardware) cmd += ` --hardware ${options.hardware}`;
  if (options.minReplicas) cmd += ` --min-replicas ${options.minReplicas}`;
  if (options.maxReplicas) cmd += ` --max-replicas ${options.maxReplicas}`;
  return run(cmd);
}

export async function cliListEndpoints() {
  return run('endpoints list');
}

export async function cliRetrieveEndpoint(endpointId) {
  return run(`endpoints retrieve ${endpointId}`);
}

export async function cliStartEndpoint(endpointId) {
  return run(`endpoints start ${endpointId}`);
}

export async function cliStopEndpoint(endpointId) {
  return run(`endpoints stop ${endpointId}`);
}

export async function cliDeleteEndpoint(endpointId) {
  return run(`endpoints delete ${endpointId}`);
}

export async function cliUpdateEndpoint(endpointId, options = {}) {
  let cmd = `endpoints update ${endpointId}`;
  if (options.minReplicas !== undefined) cmd += ` --min-replicas ${options.minReplicas}`;
  if (options.maxReplicas !== undefined) cmd += ` --max-replicas ${options.maxReplicas}`;
  return run(cmd);
}

export async function cliListHardware(options = {}) {
  let cmd = 'endpoints hardware';
  if (options.model) cmd += ` --model ${options.model}`;
  return run(cmd);
}

export async function cliListAvailabilityZones() {
  return run('endpoints availability-zones');
}

// ─── EVALS ──────────────────────────────────────────────────────────

export async function cliCreateEval(options = {}) {
  let cmd = 'evals create';
  if (options.model) cmd += ` --model ${options.model}`;
  if (options.evalDataFile) cmd += ` --eval-data-file ${options.evalDataFile}`;
  if (options.type) cmd += ` --type ${options.type}`;
  return run(cmd);
}

export async function cliListEvals() {
  return run('evals list');
}

export async function cliRetrieveEval(evalId) {
  return run(`evals retrieve ${evalId}`);
}

export async function cliEvalStatus(evalId) {
  return run(`evals status ${evalId}`);
}

// ─── UTILITY ────────────────────────────────────────────────────────

export async function cliVersion() {
  return run('--version');
}

export async function cliWhoami() {
  // No built-in whoami in CLI, but we can use SDK's whoami via the API
  // or just return the version/key info
  return run('--version');
}

export default {
  // Models
  cliListModels,
  cliUploadModel,
  // Files
  cliUploadFile,
  cliListFiles,
  cliRetrieveFile,
  cliRetrieveFileContent,
  cliDeleteFile,
  cliCheckFile,
  // Fine-tuning
  cliCreateFineTune,
  cliListFineTunes,
  cliRetrieveFineTune,
  cliCancelFineTune,
  cliDeleteFineTune,
  cliDownloadFineTune,
  cliListCheckpoints,
  cliListFineTuneEvents,
  // Endpoints
  cliCreateEndpoint,
  cliListEndpoints,
  cliRetrieveEndpoint,
  cliStartEndpoint,
  cliStopEndpoint,
  cliDeleteEndpoint,
  cliUpdateEndpoint,
  cliListHardware,
  cliListAvailabilityZones,
  // Evals
  cliCreateEval,
  cliListEvals,
  cliRetrieveEval,
  cliEvalStatus,
  // Utility
  cliVersion,
};
