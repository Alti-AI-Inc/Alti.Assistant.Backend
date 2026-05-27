import fs from 'fs';
import path from 'path';
import { logger } from '../../../shared/logger.js';
import { dockerWorkspaceService } from '../docker/dockerWorkspace.service.js';
import SwarmAudit from './swarmAudit.model.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';

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
/**
 * Seeds a suite of default, top-tier OpenClaw sandboxed skills in the user workspace.
 */
const _seedDefaultSkills = (userId, skillsDir) => {
  const defaultSkills = [
    {
      name: 'data_analyzer',
      md: '---\nname: data_analyzer\ndescription: Performs statistical analysis on workspace data files (CSV/JSON), generating beautiful markdown summaries of columns, counts, averages, and distributions.\nparameters:\n  filepath:\n    type: string\n    description: "Relative path to the CSV or JSON file in the workspace (e.g. data.csv)"\n    required: true\nscript: data_analyzer.py\n---\n',
      py: 'import sys\nimport os\nimport json\nimport csv\n\ndef main():\n    filepath = ""\n    for i, arg in enumerate(sys.argv):\n        if arg == "--filepath" and i + 1 < len(sys.argv):\n            filepath = sys.argv[i + 1]\n\n    if not filepath:\n        print("Error: No filepath provided.")\n        sys.exit(1)\n\n    if not os.path.exists(filepath):\n        print(f"Error: File not found at path: {filepath}")\n        sys.exit(1)\n\n    print(f"### Alti Sandboxed Data Analysis: `{filepath}`\\n")\n    \n    data = []\n    if filepath.endswith(\'.json\'):\n        try:\n            with open(filepath, \'r\') as f:\n                data = json.load(f)\n            if not isinstance(data, list):\n                data = [data]\n        except Exception as e:\n            print(f"Failed to parse JSON file: {str(e)}")\n            sys.exit(1)\n    else:\n        try:\n            with open(filepath, \'r\', encoding=\'utf-8\') as f:\n                reader = csv.DictReader(f)\n                data = list(reader)\n        except Exception as e:\n            print(f"Failed to parse CSV file: {str(e)}")\n            sys.exit(1)\n\n    if not data:\n        print("Dataset is empty.")\n        sys.exit(0)\n\n    row_count = len(data)\n    columns = list(data[0].keys())\n    print(f"* **Total Rows**: {row_count}")\n    print(f"* **Detected Attributes/Columns**: {\', \'.join(columns)}\\n")\n\n    print("| Attribute | Numeric Stats (Mean/Min/Max) | Sample Values |")\n    print("|---|---|---|")\n    \n    for col in columns:\n        vals = []\n        num_vals = []\n        for r in data:\n            v = r.get(col)\n            if v is not None:\n                vals.append(str(v))\n                try:\n                    num_vals.append(float(v))\n                except ValueError:\n                    pass\n        \n        sample = ", ".join(vals[:3])\n        if num_vals:\n            avg_val = sum(num_vals) / len(num_vals)\n            min_val = min(num_vals)\n            max_val = max(num_vals)\n            stats = f"Mean: {avg_val:.2f}, Range: [{min_val:.2f} to {max_val:.2f}]"\n        else:\n            stats = "Text / Categorical"\n            \n        print(f"| **{col}** | {stats} | {sample} |")\n\nif __name__ == "__main__":\n    main()\n'
    },
    {
      name: 'chart_generator',
      md: '---\nname: chart_generator\ndescription: Generates high-fidelity visual plots and data charts (bar charts, line plots, scatter plots) from data series and saves them to the workspace.\nparameters:\n  title:\n    type: string\n    description: "The chart title"\n    required: true\n  x_label:\n    type: string\n    description: "Label for the X axis"\n    required: true\n  y_label:\n    type: string\n    description: "Label for the Y axis"\n    required: true\n  x_data:\n    type: string\n    description: "Comma-separated list of X data elements (e.g. Q1,Q2,Q3,Q4)"\n    required: true\n  y_data:\n    type: string\n    description: "Comma-separated list of numeric Y data values (e.g. 150,220,180,310)"\n    required: true\nscript: chart_generator.py\n---\n',
      py: 'import sys\nimport os\nimport matplotlib\nmatplotlib.use(\'Agg\')\nimport matplotlib.pyplot as plt\n\ndef main():\n    title = "Chart"\n    x_label = "X"\n    y_label = "Y"\n    x_data = []\n    y_data = []\n\n    for i, arg in enumerate(sys.argv):\n        if arg == "--title" and i + 1 < len(sys.argv):\n            title = sys.argv[i + 1]\n        elif arg == "--x_label" and i + 1 < len(sys.argv):\n            x_label = sys.argv[i + 1]\n        elif arg == "--y_label" and i + 1 < len(sys.argv):\n            y_label = sys.argv[i + 1]\n        elif arg == "--x_data" and i + 1 < len(sys.argv):\n            x_data = sys.argv[i + 1].split(\',\')\n        elif arg == "--y_data" and i + 1 < len(sys.argv):\n            y_data = [float(x) for x in sys.argv[i + 1].split(\',\')]\n\n    if not x_data or not y_data:\n        print("Error: Missing required data series.")\n        sys.exit(1)\n\n    plt.figure(figsize=(8, 5))\n    plt.bar(x_data, y_data, color=\'#3b82f6\', edgecolor=\'#1d4ed8\')\n    plt.title(title, fontsize=14, fontweight=\'bold\', pad=15)\n    plt.xlabel(x_label, fontsize=11, labelpad=10)\n    plt.ylabel(y_label, fontsize=11, labelpad=10)\n    plt.grid(axis=\'y\', linestyle=\'--\', alpha=0.5)\n    plt.tight_layout()\n\n    output_path = "output_chart.png"\n    plt.savefig(output_path, dpi=150)\n    plt.close()\n\n    print(f"### [SUCCESS] Sandboxed Chart Generation Complete\\n")\n    print(f"* **Saved To**: `{output_path}`")\n    print(f"* **Dimensions**: 1200 x 750 pixels")\n    print(f"* **Data Points Plotted**: {len(x_data)}")\n\nif __name__ == "__main__":\n    main()\n'
    },
    {
      name: 'web_downloader',
      md: '---\nname: web_downloader\ndescription: Securely scrapes text, descriptions, and hyperlinks from a specified webpage URL inside the container network.\nparameters:\n  url:\n    type: string\n    description: "The webpage URL to download and clean (e.g. https://example.com)"\n    required: true\nscript: web_downloader.py\n---\n',
      py: 'import sys\nimport urllib.request\nimport re\n\ndef main():\n    url = ""\n    for i, arg in enumerate(sys.argv):\n        if arg == "--url" and i + 1 < len(sys.argv):\n            url = sys.argv[i + 1]\n\n    if not url:\n        print("Error: No URL provided.")\n        sys.exit(1)\n\n    print(f"### Web Downloader Scraping: `{url}`\\n")\n    try:\n        req = urllib.request.Request(\n            url, \n            headers={\'User-Agent\': \'Mozilla/5.0 (Windows NT 10.0; Win64; x64)\'}\n        )\n        with urllib.request.urlopen(req, timeout=10) as response:\n            html = response.read().decode(\'utf-8\')\n            \n        html = re.sub(r\'<script\\b[^<]*(?:(?!<\\/script>)<[^<]*)*<\\/script>\', \'\', html, flags=re.I)\n        html = re.sub(r\'<style\\b[^<]*(?:(?!<\\/style>)<[^<]*)*<\\/style>\', \'\', html, flags=re.I)\n        \n        text = re.sub(r\'<[^>]+>\', \' \', html)\n        lines = [line.strip() for line in text.splitlines()]\n        chunks = [phrase.strip() for line in lines for phrase in line.split("  ")]\n        clean_text = "\\n".join(chunk for chunk in chunks if chunk)\n        \n        excerpt = clean_text[:2000]\n        print(f"**Document Excerpt**:\\n\\n{excerpt}")\n        if len(clean_text) > 2000:\n            print("\\n*... [Output Truncated due to size constraints]*")\n    except Exception as e:\n        print(f"Error downloading webpage: {str(e)}")\n        sys.exit(1)\n\nif __name__ == "__main__":\n    main()\n'
    }
  ];

  for (const skill of defaultSkills) {
    const mdPath = path.join(skillsDir, `${skill.name}.md`);
    const pyPath = path.join(skillsDir, `${skill.name}.py`);

    if (!fs.existsSync(mdPath)) {
      fs.writeFileSync(mdPath, skill.md, 'utf8');
      logger.info(`[DynamicSkill Seed] Seeding default skill descriptor: ${skill.name}.md`);
    }
    if (!fs.existsSync(pyPath)) {
      fs.writeFileSync(pyPath, skill.py, 'utf8');
      logger.info(`[DynamicSkill Seed] Seeding default skill script: ${skill.name}.py`);
    }
  }
};

/**
 * Nous Hermes-style Cognitive Code Correction Reflection.
 * Analyzes a runtime exception, rewrites the source code to resolve the crash, and consolidates the clean corrected script.
 */
const _autoHealScriptCode = async (userId, skillName, scriptName, originalCode, stderrText) => {
  logger.warn(`[DynamicSkill Code-Healer] Triggered script self-healing code reflection for "${skillName}" (User: ${userId})...`);
  
  const promptText = `You are a world-class cognitive software engineer.
An isolated script has crashed in a sandboxed runtime environment. Your job is to analyze the exception, identify the logical or syntax error, and output the CORRECTED, high-fidelity script.

CRITICAL REQUIREMENT:
1. You MUST return ONLY the raw corrected script code.
2. Do NOT wrap your output in markdown code blocks (\`\`\`python or \`\`\`js).
3. Do NOT include any explanations, preambles, or text other than the clean corrected source code.

ORIGINAL CODE:
\`\`\`
${originalCode}
\`\`\`

RUNTIME EXCEPTION/STDERR:
\`\`\`
${stderrText}
\`\`\`

Return the complete, corrected clean source code now:`;

  let healedCode = '';

  try {
    const genAI = new GoogleGenerativeAI(config.gemini_secret_key);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        temperature: 0.1,
      },
    });

    const result = await model.generateContent(promptText);
    healedCode = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch (err) {
    logger.warn(`[DynamicSkill Code-Healer Warning] Gemini self-healing failed: ${err.message}. Trying Groq SOTA fallback...`);
    
    if (process.env.GROQ_API_KEY || config.groq_secret_key) {
      try {
        const groqApiKey = process.env.GROQ_API_KEY || config.groq_secret_key;
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqApiKey}`
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: promptText }],
            temperature: 0.1
          })
        });
        
        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`Groq HTTP ${response.status}: ${errBody}`);
        }
        
        const data = await response.json();
        healedCode = data.choices?.[0]?.message?.content || '';
        logger.info(`[DynamicSkill Code-Healer] Successfully healed script using Groq SOTA fallback.`);
      } catch (groqErr) {
        logger.error(`[DynamicSkill Code-Healer Error] Groq SOTA fallback also failed: ${groqErr.message}`);
        throw new Error(`Self-healing failed on all LLM backends. Primary (Gemini): ${err.message}. Fallback (Groq): ${groqErr.message}`);
      }
    } else {
      throw err;
    }
  }

  // Safety clean markdown blocks if returned by accident
  healedCode = healedCode.replace(/^```[a-zA-Z0-9_-]*\r?\n/, '');
  healedCode = healedCode.replace(/\r?\n```$/, '');
  healedCode = healedCode.trim();
  
  if (!healedCode) {
    throw new Error('Self-healing model returned an empty code block.');
  }
  
  return healedCode;
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

  // Pre-seed default OpenClaw skills
  try {
    _seedDefaultSkills(userId, skillsDir);
  } catch (seedErr) {
    logger.error(`[DynamicSkill Seed Error] Failed to seed default skills: ${seedErr.message}`);
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
    
    // Asynchronously log the security block to MongoDB
    SwarmAudit.create({
      userId,
      toolName: skill.name,
      status: 'security-blocked',
      errorMessage: secError.message
    }).catch(dbErr => logger.error(`[SwarmAudit Error] Failed to write security block audit: ${dbErr.message}`));

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
  const auditAttempts = [];

  try {
    while (retryCount <= maxRetries) {
      const runStart = Date.now();
      result = await dockerWorkspaceService.executeCommand(userId, commandArgs, { timeoutMs: 30000 });
      const runDuration = Date.now() - runStart;

      auditAttempts.push({
        attempt: retryCount + 1,
        timestamp: new Date(),
        durationMs: runDuration,
        stdout: result.stdout || '',
        stderr: result.stderr || ''
      });
      
      if (result.code === 0) {
        break; // Successful execution!
      }

      const stderrText = result.stderr || '';
      // Check if it is a missing python module error
      const isMissingModule = stderrText.includes('ModuleNotFoundError:') || stderrText.includes('ImportError: No module named') || stderrText.includes('ImportError: no module named');
      
      // Check if it is a missing Node.js npm package error
      const isMissingNodeModule = stderrText.includes("Cannot find module '");

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
          const installStart = Date.now();
          const installResult = await dockerWorkspaceService.executeCommand(userId, ['uv', 'pip', 'install', '--python', '/workspace/.venv/bin/python', packageName]);
          const installDuration = Date.now() - installStart;

          auditAttempts.push({
            attempt: retryCount + 1,
            timestamp: new Date(),
            missingPackage: packageName,
            installSuccess: installResult.code === 0,
            durationMs: installDuration,
            stdout: installResult.stdout || '',
            stderr: installResult.stderr || ''
          });
          
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
      } else if (isMissingNodeModule && workspace.mode !== 'local-fallback') {
        const match = stderrText.match(/Cannot find module '([^']+)'/);
        if (match && match[1]) {
          const packageName = match[1];
          const builtins = ['fs', 'path', 'crypto', 'os', 'child_process', 'util', 'stream', 'http', 'https', 'fs/promises'];

          if (!builtins.includes(packageName)) {
            if (failedInstalls.has(packageName)) {
              logger.warn(`[DynamicSkill Node Self-Healing] Package "${packageName}" previously failed installation in this run. Bailing.`);
              break;
            }

            if (installationCount >= maxInstalls) {
              logger.warn(`[DynamicSkill Node Self-Healing] Maximum installation ceiling of ${maxInstalls} packages reached for this call. Bailing.`);
              break;
            }

            logger.warn(`[DynamicSkill Node Self-Healing] Intercepted missing node dependency "${packageName}" inside ${containerName}. Attempting npm installation...`);
            
            installationCount++;
            const installStart = Date.now();
            const installResult = await dockerWorkspaceService.executeCommand(userId, ['npm', 'install', '--prefix', '/workspace', '--no-audit', '--no-fund', packageName]);
            const installDuration = Date.now() - installStart;

            auditAttempts.push({
              attempt: retryCount + 1,
              timestamp: new Date(),
              missingPackage: packageName,
              installSuccess: installResult.code === 0,
              durationMs: installDuration,
              stdout: installResult.stdout || '',
              stderr: installResult.stderr || ''
            });

            if (installResult.code === 0) {
              logger.info(`[DynamicSkill Node Self-Healing] Successfully installed package "${packageName}" for user ${userId}. Retrying script execution...`);
              retryCount++;
              continue;
            } else {
              logger.error(`[DynamicSkill Node Self-Healing Error] Failed to install package "${packageName}": ${installResult.stderr}`);
              failedInstalls.add(packageName);
              break;
            }
          }
        }
      } else {
        // Code-level exception (e.g. syntax, logic, division by zero) self-healing loop!
        if (retryCount >= maxRetries) {
          logger.warn(`[DynamicSkill Code-Healer] Retry ceiling reached for script code self-healing. Bailing.`);
          break;
        }

        const hostSkillsDir = path.resolve(`storage/users/${userId}/workspace/skills`);
        const scriptPathOnHost = path.join(hostSkillsDir, skill.script);
        
        if (fs.existsSync(scriptPathOnHost)) {
          const originalCode = fs.readFileSync(scriptPathOnHost, 'utf8');
          try {
            logger.warn(`[DynamicSkill Code-Healer] Intercepted runtime exception inside "${skill.name}". Invoking SOTA code self-healing...`);
            const healedCode = await _autoHealScriptCode(userId, skill.name, skill.script, originalCode, stderrText);
            
            // Save healed code locally
            fs.writeFileSync(scriptPathOnHost, healedCode, 'utf8');
            logger.info(`[DynamicSkill Code-Healer] Successfully saved repaired code for script "${skill.script}".`);

            // Backup healed code to GCS bucket if active
            if (gcsBucket) {
              const destinationPath = `users/${userId}/workspace/skills/${skill.script}`;
              gcsBucket.upload(scriptPathOnHost, { destination: destinationPath })
                .then(() => logger.info(`[GCS Sync] Uploaded self-healed script to GCS: ${skill.script}`))
                .catch(err => logger.error(`[GCS Sync Error] Failed to upload healed script to GCS: ${err.message}`));
            }

            retryCount++;
            continue; // Re-run loop with repaired script!
          } catch (healError) {
            logger.error(`[DynamicSkill Code-Healer Error] Self-healing failed: ${healError.message}`);
            break;
          }
        } else {
          logger.error(`[DynamicSkill Code-Healer] Script file not found on host to self-heal: ${scriptPathOnHost}`);
          break;
        }
      }
      
      break; // Exit loop if not a healing-eligible import error
    }
    
    const isResourceAbort = result.stderr && result.stderr.includes('Execution Aborted: Sandbox memory limit');
    const finalStatus = result.code === 0 ? 'success' : (isResourceAbort ? 'resource-aborted' : 'failed');

    // Asynchronously persist execution audit to MongoDB
    SwarmAudit.create({
      userId,
      toolName: skill.name,
      status: finalStatus,
      attempts: auditAttempts,
      finalResult: finalStatus === 'success' ? (result.stdout || '').substring(0, 5000) : undefined,
      errorMessage: finalStatus !== 'success' ? (result.stderr || 'Subprocess crash.') : undefined
    }).catch(dbErr => logger.error(`[SwarmAudit Error] Failed to write skill execution audit: ${dbErr.message}`));

    if (result.code !== 0) {
      logger.error(`[DynamicSkill Error] Skill "${skill.name}" failed with exit code ${result.code}`);
      return `Error executing skill: ${result.stderr || 'Subprocess crash.'}`;
    }
    
    return result.stdout.trim() || 'Skill executed successfully with no output.';
  } catch (err) {
    logger.error(`[DynamicSkill Exec Error] Failed to execute skill "${skill.name}":`, err);

    SwarmAudit.create({
      userId,
      toolName: skill.name,
      status: 'failed',
      attempts: auditAttempts,
      errorMessage: err.message
    }).catch(dbErr => logger.error(`[SwarmAudit Error] Failed to write crash audit: ${dbErr.message}`));

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
