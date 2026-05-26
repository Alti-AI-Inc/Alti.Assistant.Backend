import fs from 'fs';
import path from 'path';
import { logger } from '../../../shared/logger.js';
import { dockerWorkspaceService } from '../docker/dockerWorkspace.service.js';

// --- GOOGLE CLOUD STORAGE PERSISTENCE SYNC LAYER ---
let gcsBucket = null;
const initGcs = async () => {
  if (process.env.GCS_BUCKET_NAME) {
    try {
      const { Storage } = await import('@google-cloud/storage');
      const storage = new Storage();
      gcsBucket = storage.bucket(process.env.GCS_BUCKET_NAME);
      logger.info(`[GCS Sync] Connected to Google Cloud Storage bucket: ${process.env.GCS_BUCKET_NAME}`);
    } catch (err) {
      logger.warn(`[GCS Sync Warning] Failed to initialize Google Cloud Storage bucket client: ${err.message}. Dynamic skills will sync locally-only.`);
    }
  }
};
// Trigger lazy initialization of GCS connection
initGcs().catch(err => logger.error(`[GCS Sync Error] Lazy initialization failed: ${err.message}`));

/**
 * Sanitizes argument keys and rejects unsafe shell metacharacters in values.
 * @param {string} key - Argument parameter name
 * @param {string} value - Argument value
 * @returns {Object} Original key and safe escaped string value
 */
const sanitizeShellArgument = (key, value) => {
  const safeKeyRegex = /^[a-zA-Z0-9_-]+$/;
  if (!safeKeyRegex.test(key)) {
    throw new Error(`Security Exception: Argument key "${key}" contains unsafe characters. Only alphanumeric, dashes, and underscores are permitted.`);
  }

  const strVal = String(value);
  // Banned shell breakout metacharacters
  const unsafeCharactersRegex = /[;|$`><]/;
  if (unsafeCharactersRegex.test(strVal)) {
    throw new Error(`Security Exception: Argument value for "${key}" contains unsafe shell characters (";", "&", "|", "$", "\`", ">", "<"). Only clean literal values are permitted.`);
  }

  return { key, value: strVal };
};

/**
 * Dynamically downloads missing skill files from Google Cloud Storage to the local folder.
 */
const syncSkillsFromGcs = async (userId, localSkillsDir) => {
  if (!gcsBucket) return;
  try {
    const prefix = `users/${userId}/workspace/skills/`;
    const [files] = await gcsBucket.getFiles({ prefix });
    
    for (const file of files) {
      const relativePath = file.name.substring(prefix.length);
      if (!relativePath) continue;
      
      const localPath = path.join(localSkillsDir, relativePath);
      if (!fs.existsSync(localPath)) {
        logger.info(`[GCS Sync] Downloading missing skill file from GCS: ${file.name} -> ${localPath}`);
        await file.download({ destination: localPath });
      }
    }
  } catch (err) {
    logger.warn(`[GCS Sync Warning] Dynamic skill synchronization from GCS failed: ${err.message}`);
  }
};

/**
 * Parses OpenClaw-compliant Markdown Skill files containing YAML-like frontmatter.
 * @param {string} content - Markdown file content
 * @returns {Object|null} Parsed metadata, or null if invalid
 */
const parseSkillFrontmatter = (content) => {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---/;
  const match = content.match(frontmatterRegex);
  if (!match) return null;
  
  const yamlText = match[1];
  const lines = yamlText.split('\n');
  const metadata = {
    name: '',
    description: '',
    parameters: {},
    script: ''
  };
  
  let currentKey = null;
  let inParameters = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    // Check parameters block
    if (trimmed.startsWith('parameters:')) {
      inParameters = true;
      continue;
    }
    
    if (inParameters) {
      // Check parameter key definition (e.g. "  repo:")
      const paramMatch = line.match(/^ {2}(\w+):/);
      if (paramMatch) {
        currentKey = paramMatch[1];
        metadata.parameters[currentKey] = { type: 'string', description: '', required: false };
        continue;
      }
      
      // Check parameter attributes (e.g. "    type: string")
      const attrMatch = line.match(/^ {4}(\w+):\s*(.*)/);
      if (attrMatch && currentKey) {
        const key = attrMatch[1];
        let val = attrMatch[2].trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        if (val === 'true') val = true;
        if (val === 'false') val = false;
        
        metadata.parameters[currentKey][key] = val;
      }
      
      // Exit parameters block if we hit another root key
      if (line.match(/^\w+:/)) {
        inParameters = false;
      }
    }
    
    if (!inParameters) {
      const kvMatch = line.match(/^(\w+):\s*(.*)/);
      if (kvMatch) {
        let val = kvMatch[2].trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        metadata[kvMatch[1]] = val;
      }
    }
  }
  
  return metadata.name && metadata.script ? metadata : null;
};

/**
 * Scans the user's host volume workspace 'skills/' folder for custom OpenClaw Markdown skills.
 * @param {string} userId - User identifier
 * @returns {Array<Object>} List of parsed skills
 */
const scanUserSkills = (userId) => {
  if (!userId) return [];
  const skillsDir = path.resolve(`storage/users/${userId}/workspace/skills`);
  
  if (!fs.existsSync(skillsDir)) {
    try {
      fs.mkdirSync(skillsDir, { recursive: true });
    } catch (err) {
      logger.warn(`[DynamicSkill] Could not create skills directory for user ${userId}: ${err.message}`);
      return [];
    }
  }

  // Trigger background cloud sync from GCS silently without blocking scanning latency
  if (gcsBucket) {
    syncSkillsFromGcs(userId, skillsDir).catch(err => {
      logger.warn(`[GCS Sync Error] Async synchronization failed: ${err.message}`);
    });
  }
  
  const files = fs.readdirSync(skillsDir);
  const skills = [];
  
  for (const file of files) {
    if (path.extname(file) === '.md') {
      const filePath = path.join(skillsDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const parsed = parseSkillFrontmatter(content);
        if (parsed) {
          skills.push(parsed);
          logger.info(`[DynamicSkill] Discovered custom skill "${parsed.name}" for user ${userId}.`);
        }
      } catch (err) {
        logger.error(`[DynamicSkill] Failed to parse skill file ${file}:`, err);
      }
    }
  }
  
  return skills;
};

/**
 * Compiles parsed skill schemas into standard Google Gemini Function Declarations.
 * @param {Array<Object>} skills - List of parsed skills
 * @returns {Array<Object>} Gemini function declarations list
 */
const compileGeminiTools = (skills) => {
  if (!skills || skills.length === 0) return [];
  
  return skills.map((skill) => {
    const properties = {};
    const required = [];
    
    Object.entries(skill.parameters).forEach(([name, param]) => {
      properties[name] = {
        type: (param.type || 'string').toUpperCase(),
        description: param.description || ''
      };
      if (param.required) {
        required.push(name);
      }
    });
    
    return {
      name: skill.name,
      description: skill.description || `Custom skill tool ${skill.name}`,
      parameters: {
        type: 'OBJECT',
        properties,
        required
      }
    };
  });
};

/**
 * Ensures that the persistent virtual environment (/workspace/.venv) is initialized inside the user container.
 * @param {string} userId - User identifier
 * @returns {Promise<boolean>} True if initialized, false otherwise
 */
const ensureVenvInitialized = async (userId) => {
  const containerName = `alti_workspace_${userId}`;
  try {
    const checkResult = await dockerWorkspaceService.executeCommand(userId, ['test', '-f', '/workspace/.venv/bin/python']);
    if (checkResult.code === 0) {
      return true; // Already exists
    }
    
    logger.info(`[DynamicSkill] Initializing persistent virtual environment (/workspace/.venv) via uv inside ${containerName}...`);
    const initResult = await dockerWorkspaceService.executeCommand(userId, ['uv', 'venv', '/workspace/.venv']);
    if (initResult.code !== 0) {
      logger.error(`[DynamicSkill Error] Failed to initialize venv via uv: ${initResult.stderr}`);
      return false;
    }
    
    logger.info(`[SUCCESS] Initialized persistent virtual environment (/workspace/.venv) inside ${containerName}.`);
    return true;
  } catch (err) {
    logger.error(`[DynamicSkill Error] Exception in ensureVenvInitialized:`, err);
    return false;
  }
};

/**
 * Executes a custom skill securely inside the user's isolated Docker container sandbox.
 * @param {string} userId - User identifier
 * @param {Object} skill - Parsed skill details
 * @param {Object} args - Arguments passed by LLM toolCall
 * @returns {Promise<string>} Output returned by script execution
 */
const executeSkill = async (userId, skill, args = {}) => {
  const containerName = `alti_workspace_${userId}`;
  logger.info(`[DynamicSkill] Executing skill "${skill.name}" inside container "${containerName}"...`);
  
  // Format arguments as standard shell arguments with strict security sanitization
  const shellArgs = [];
  try {
    Object.entries(args).forEach(([k, v]) => {
      const sanitized = sanitizeShellArgument(k, v);
      shellArgs.push(`--${sanitized.key}`);
      shellArgs.push(sanitized.value);
    });
  } catch (secError) {
    logger.error(`[Security Threat Blocked] ${secError.message}`);
    return `Security Violation: ${secError.message}`;
  }

  const workspace = await dockerWorkspaceService.getOrCreateWorkspace(userId);
  let commandArgs;

  if (workspace.mode === 'local-fallback') {
    // Local fallback path resolution on the host machine
    const hostSkillsDir = path.resolve(`storage/users/${userId}/workspace/skills`);
    const scriptPath = path.join(hostSkillsDir, skill.script);
    
    const ext = path.extname(skill.script);
    let interpreter = 'python';
    if (ext === '.py') {
      interpreter = process.platform === 'win32' ? 'python' : 'python3';
    } else if (ext === '.sh') {
      interpreter = process.platform === 'win32' ? 'powershell' : 'bash';
    } else if (ext === '.js') {
      interpreter = 'node';
    }
    
    commandArgs = [interpreter, scriptPath, ...shellArgs];
  } else {
    // Isolated secure Docker Sandbox container path
    const scriptPath = `/workspace/skills/${skill.script}`;
    const ext = path.extname(skill.script);
    
    let interpreter = 'python3';
    if (ext === '.py') {
      const venvOk = await ensureVenvInitialized(userId);
      interpreter = venvOk ? '/workspace/.venv/bin/python' : 'python3';
    } else if (ext === '.sh') {
      interpreter = 'bash';
    } else if (ext === '.js') {
      interpreter = 'node';
    }
    
    commandArgs = [interpreter, scriptPath, ...shellArgs];
  }
  
  let result;
  let retryCount = 0;
  const maxRetries = 3;
  let installationCount = 0;
  const maxInstalls = 3;
  const failedInstalls = new Set();

  try {
    while (retryCount <= maxRetries) {
      result = await dockerWorkspaceService.executeCommand(userId, commandArgs, { timeoutMs: 30000 });
      
      if (result.code === 0) {
        break; // Successful execution!
      }

      const stderrText = result.stderr || '';
      // Check if it is a missing python module error
      const isMissingModule = stderrText.includes('ModuleNotFoundError:') || stderrText.includes('ImportError: No module named') || stderrText.includes('ImportError: no module named');
      
      if (isMissingModule && workspace.mode !== 'local-fallback') {
        // Parse module name
        const match = stderrText.match(/(?:ModuleNotFoundError: No module named '|ImportError: [nN]o module named ')([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
          const packageName = match[1];
          
          if (failedInstalls.has(packageName)) {
            logger.warn(`[DynamicSkill Self-Healing] Package "${packageName}" previously failed installation in this run. Bailing.`);
            break;
          }

          if (installationCount >= maxInstalls) {
            logger.warn(`[DynamicSkill Self-Healing] Maximum installation ceiling of ${maxInstalls} packages reached for this call. Bailing.`);
            break;
          }

          logger.warn(`[DynamicSkill Self-Healing] Intercepted missing python dependency "${packageName}" inside ${containerName}. Attempting auto-installation...`);
          
          installationCount++;
          const installResult = await dockerWorkspaceService.executeCommand(userId, ['uv', 'pip', 'install', '--python', '/workspace/.venv/bin/python', packageName]);
          
          if (installResult.code === 0) {
            logger.info(`[DynamicSkill Self-Healing] Successfully installed package "${packageName}" for user ${userId}. Retrying script execution...`);
            retryCount++;
            continue; // Re-run the loop to retry execution
          } else {
            logger.error(`[DynamicSkill Self-Healing Error] Failed to install package "${packageName}": ${installResult.stderr}`);
            failedInstalls.add(packageName);
            break; // Stop and output the failed package stderr
          }
        }
      }
      
      break; // Exit loop if not a healing-eligible import error
    }
    
    if (result.code !== 0) {
      logger.error(`[DynamicSkill Error] Skill "${skill.name}" failed with exit code ${result.code}`);
      return `Error executing skill: ${result.stderr || 'Subprocess crash.'}`;
    }
    
    return result.stdout.trim() || 'Skill executed successfully with no output.';
  } catch (err) {
    logger.error(`[DynamicSkill Exec Error] Failed to execute skill "${skill.name}":`, err);
    return `Execution Error: ${err.message}`;
  }
};

/**
 * Saves a dynamically generated OpenClaw skill to the user's workspace.
 * @param {string} userId - User identifier
 * @param {Object} skillData - Skill metadata and script content
 * @returns {boolean} Success status
 */
const saveGeneratedSkill = (userId, skillData) => {
  if (!userId || !skillData.name || !skillData.scriptName || !skillData.scriptContent) {
    throw new Error('Invalid skill data: name, scriptName, and scriptContent are required.');
  }

  const skillsDir = path.resolve(`storage/users/${userId}/workspace/skills`);
  if (!fs.existsSync(skillsDir)) {
    fs.mkdirSync(skillsDir, { recursive: true });
  }

  // 1. Format parameter block
  let parametersYaml = '';
  if (skillData.parameters && Object.keys(skillData.parameters).length > 0) {
    parametersYaml = 'parameters:\n';
    Object.entries(skillData.parameters).forEach(([paramName, paramInfo]) => {
      parametersYaml += `  ${paramName}:\n`;
      parametersYaml += `    type: ${paramInfo.type || 'string'}\n`;
      parametersYaml += `    description: "${paramInfo.description || ''}"\n`;
      parametersYaml += `    required: ${paramInfo.required ? 'true' : 'false'}\n`;
    });
  }

  // 2. Generate Markdown file content
  const markdownContent = `---
name: ${skillData.name}
description: ${skillData.description || `Dynamic skill ${skillData.name}`}
${parametersYaml}script: ${skillData.scriptName}
---
`;

  // 3. Write markdown and script files
  const mdPath = path.join(skillsDir, `${skillData.name}.md`);
  const scriptPath = path.join(skillsDir, skillData.scriptName);

  fs.writeFileSync(mdPath, markdownContent, 'utf8');
  fs.writeFileSync(scriptPath, skillData.scriptContent, 'utf8');
  
  logger.info(`[DynamicSkill] Successfully saved dynamic skill "${skillData.name}" for user ${userId}.`);

  // --- CLOUD SYNCHRONIZATION BACKUP ---
  if (gcsBucket) {
    gcsBucket.upload(mdPath, { destination: `users/${userId}/workspace/skills/${skillData.name}.md` })
      .then(() => logger.info(`[GCS Sync] Successfully backed up MD descriptor to GCS cloud: ${skillData.name}.md`))
      .catch(err => logger.error(`[GCS Sync Error] Failed to upload MD to GCS: ${err.message}`));

    gcsBucket.upload(scriptPath, { destination: `users/${userId}/workspace/skills/${skillData.scriptName}` })
      .then(() => logger.info(`[GCS Sync] Successfully backed up script to GCS cloud: ${skillData.scriptName}`))
      .catch(err => logger.error(`[GCS Sync Error] Failed to upload script to GCS: ${err.message}`));
  }

  return true;
};

export const dynamicSkillService = {
  parseSkillFrontmatter,
  scanUserSkills,
  compileGeminiTools,
  executeSkill,
  saveGeneratedSkill
};
