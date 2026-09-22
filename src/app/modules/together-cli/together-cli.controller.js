import * as cli from '../../services/together.cli.service.js';

// ═══════════════════════════════════════════════════════════════════════
//  Together CLI Controller
//  REST endpoints for every Together CLI command
// ═══════════════════════════════════════════════════════════════════════

// ─── MODELS ─────────────────────────────────────────────────────────

export const listModels = async (req, res) => {
  const result = await cli.cliListModels();
  res.json(result);
};

export const uploadModel = async (req, res) => {
  const { source, name, hfToken } = req.body;
  if (!source) return res.status(400).json({ error: 'source is required' });
  const result = await cli.cliUploadModel(source, { name, hfToken });
  res.json(result);
};

// ─── FILES ──────────────────────────────────────────────────────────

export const uploadFile = async (req, res) => {
  const { filePath, purpose } = req.body;
  if (!filePath) return res.status(400).json({ error: 'filePath is required' });
  const result = await cli.cliUploadFile(filePath, { purpose });
  res.json(result);
};

export const listFiles = async (req, res) => {
  const result = await cli.cliListFiles();
  res.json(result);
};

export const retrieveFile = async (req, res) => {
  const result = await cli.cliRetrieveFile(req.params.id);
  res.json(result);
};

export const retrieveFileContent = async (req, res) => {
  const { outputPath } = req.body;
  const result = await cli.cliRetrieveFileContent(req.params.id, outputPath || '/tmp/together-file-download');
  res.json(result);
};

export const deleteFile = async (req, res) => {
  const result = await cli.cliDeleteFile(req.params.id);
  res.json(result);
};

export const checkFile = async (req, res) => {
  const { filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'filePath is required' });
  const result = await cli.cliCheckFile(filePath);
  res.json(result);
};

// ─── FINE-TUNING ────────────────────────────────────────────────────

export const createFineTune = async (req, res) => {
  const result = await cli.cliCreateFineTune(req.body);
  res.json(result);
};

export const listFineTunes = async (req, res) => {
  const result = await cli.cliListFineTunes();
  res.json(result);
};

export const retrieveFineTune = async (req, res) => {
  const result = await cli.cliRetrieveFineTune(req.params.id);
  res.json(result);
};

export const cancelFineTune = async (req, res) => {
  const result = await cli.cliCancelFineTune(req.params.id);
  res.json(result);
};

export const deleteFineTune = async (req, res) => {
  const result = await cli.cliDeleteFineTune(req.params.id);
  res.json(result);
};

export const downloadFineTune = async (req, res) => {
  const result = await cli.cliDownloadFineTune(req.params.id, req.body);
  res.json(result);
};

export const listCheckpoints = async (req, res) => {
  const result = await cli.cliListCheckpoints(req.params.id);
  res.json(result);
};

export const listFineTuneEvents = async (req, res) => {
  const result = await cli.cliListFineTuneEvents(req.params.id);
  res.json(result);
};

// ─── ENDPOINTS ──────────────────────────────────────────────────────

export const createEndpoint = async (req, res) => {
  const result = await cli.cliCreateEndpoint(req.body);
  res.json(result);
};

export const listEndpoints = async (req, res) => {
  const result = await cli.cliListEndpoints();
  res.json(result);
};

export const retrieveEndpoint = async (req, res) => {
  const result = await cli.cliRetrieveEndpoint(req.params.id);
  res.json(result);
};

export const startEndpoint = async (req, res) => {
  const result = await cli.cliStartEndpoint(req.params.id);
  res.json(result);
};

export const stopEndpoint = async (req, res) => {
  const result = await cli.cliStopEndpoint(req.params.id);
  res.json(result);
};

export const deleteEndpoint = async (req, res) => {
  const result = await cli.cliDeleteEndpoint(req.params.id);
  res.json(result);
};

export const updateEndpoint = async (req, res) => {
  const result = await cli.cliUpdateEndpoint(req.params.id, req.body);
  res.json(result);
};

export const listHardware = async (req, res) => {
  const { model } = req.query;
  const result = await cli.cliListHardware({ model });
  res.json(result);
};

export const listAvailabilityZones = async (req, res) => {
  const result = await cli.cliListAvailabilityZones();
  res.json(result);
};

// ─── EVALS ──────────────────────────────────────────────────────────

export const createEval = async (req, res) => {
  const result = await cli.cliCreateEval(req.body);
  res.json(result);
};

export const listEvals = async (req, res) => {
  const result = await cli.cliListEvals();
  res.json(result);
};

export const retrieveEval = async (req, res) => {
  const result = await cli.cliRetrieveEval(req.params.id);
  res.json(result);
};

export const evalStatus = async (req, res) => {
  const result = await cli.cliEvalStatus(req.params.id);
  res.json(result);
};

// ─── UTILITY ────────────────────────────────────────────────────────

export const version = async (req, res) => {
  const result = await cli.cliVersion();
  res.json(result);
};
