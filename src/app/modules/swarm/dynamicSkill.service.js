import fs from 'fs';
import path from 'path';
import { logger } from '../../../shared/logger.js';
import { dockerWorkspaceService } from '../docker/dockerWorkspace.service.js';

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
 * Executes a custom skill securely inside the user's isolated Docker container sandbox.
 * @param {string} userId - User identifier
 * @param {Object} skill - Parsed skill details
 * @param {Object} args - Arguments passed by LLM toolCall
 * @returns {Promise<string>} Output returned by script execution
 */
const executeSkill = async (userId, skill, args = {}) => {
  const containerName = `alti_workspace_${userId}`;
  logger.info(`[DynamicSkill] Executing skill "${skill.name}" inside container "${containerName}"...`);
  
  const scriptPath = `/workspace/skills/${skill.script}`;
  
  // Format arguments as standard shell arguments
  const shellArgs = [];
  Object.entries(args).forEach(([k, v]) => {
    shellArgs.push(`--${k}`);
    shellArgs.push(String(v));
  });
  
  // Determine interpreter
  const ext = path.extname(skill.script);
  let interpreter = 'python3';
  if (ext === '.py') {
    interpreter = 'python3';
  } else if (ext === '.sh') {
    interpreter = 'bash';
  } else if (ext === '.js') {
    interpreter = 'node';
  }
  
  const commandArgs = [interpreter, scriptPath, ...shellArgs];
  
  try {
    const result = await dockerWorkspaceService.executeCommand(userId, commandArgs, { timeoutMs: 30000 });
    
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

export const dynamicSkillService = {
  parseSkillFrontmatter,
  scanUserSkills,
  compileGeminiTools,
  executeSkill
};
