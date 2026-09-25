/**
 * Aphura Sovereign Together.ai Code Execution Suite Service
 * Complete Implementation across both official documentation pages:
 * 
 * 1. Together Code Interpreter (TCI): https://docs.together.ai/docs/together-code-interpreter
 *    - Sandboxed Python execution at $0.03/session.
 *    - 60-minute session lifespan with package, variable, and memory retention.
 *    - 30 pre-installed scientific & ML libraries + runtime !pip install.
 *    - File injection support (name, encoding, content).
 *    - Output types: stdout, stderr, execute_result, display_data (PNG, text/plain), error.
 *    - MCP server: @togethercomputer/mcp-server-tci.
 *    - Agent skill: together-sandboxes / together-code-interpreter.
 * 
 * 2. Together Code Sandbox: https://docs.together.ai/docs/together-code-sandbox
 *    - CodeSandbox microVM infrastructure & Firecracker VMs (< 3s cloning from template snapshots).
 *    - Bootup types: FORK, RUNNING, RESUME, CLEAN.
 *    - 7 VM Tiers: Pico, Nano, Micro, Small, Medium, Large, XLarge ($0.01486/credit).
 *    - Plans: Build (10 VMs), Scale (250 VMs, $170/mo, 1100 free credits), Enterprise.
 *    - SDK: @codesandbox/sdk with server & browser session connection, .codesandbox/tasks.json.
 * 
 * License: MIT
 */

import {
  llmCodeInterpreter,
  llmListCodeSessions,
} from './llm.client.js';

// ── 1. Catalogs & Specifications ─────────────────────────────────────────────

export const TCI_SPEC = {
  name: 'Together Code Interpreter',
  alias: 'TCI',
  docs_url: 'https://docs.together.ai/docs/together-code-interpreter',
  supported_languages: ['python'],
  session_pricing: '$0.03/session',
  session_lifespan_minutes: 60,
  agent_skill: 'together-sandboxes',
  mcp_server: '@togethercomputer/mcp-server-tci',
  preinstalled_packages: [
    'aiohttp',
    'beautifulsoup4',
    'bokeh',
    'gensim',
    'imageio',
    'joblib',
    'librosa',
    'matplotlib',
    'nltk',
    'numpy',
    'opencv-python',
    'openpyxl',
    'pandas',
    'plotly',
    'pytest',
    'python-docx',
    'pytz',
    'requests',
    'scikit-image',
    'scikit-learn',
    'scipy',
    'seaborn',
    'soundfile',
    'spacy',
    'textblob',
    'tornado',
    'urllib3',
    'xarray',
    'xlrd',
    'sympy',
  ],
  output_types: ['stdout', 'stderr', 'execute_result', 'display_data', 'error'],
  use_cases: [
    'Reinforcement learning (RL) training with automated reward signals and test runs.',
    'Agentic workflows executing Python code iteratively within a secure sandbox.',
    'Data analysis and visualization generating matplotlib/plotly figures inline.',
  ],
};

export const SANDBOX_BOOTUP_TYPES = {
  FORK: 'The Sandbox was created from a template snapshot (continuation of dev server/state).',
  RUNNING: 'The Sandbox was already running upon resume.',
  RESUME: 'The Sandbox was resumed from hibernation.',
  CLEAN: 'The Sandbox booted from scratch (starts Firecracker VM, creates pitcher-host user, builds Docker from .devcontainer, mounts /project/sandbox).',
};

export const SANDBOX_VM_TIERS = {
  Pico: {
    credits_per_hour: 5,
    cost_per_hour: 0.0743,
    cpu_cores: 2,
    ram_gb: 1,
    best_for: 'Very simple code execution jobs',
  },
  Nano: {
    credits_per_hour: 10,
    cost_per_hour: 0.1486,
    cpu_cores: 2,
    ram_gb: 4,
    best_for: 'Recommended default for most simple workflows',
  },
  Micro: {
    credits_per_hour: 20,
    cost_per_hour: 0.2972,
    cpu_cores: 4,
    ram_gb: 8,
    best_for: 'Web apps, backend services, dev servers',
  },
  Small: {
    credits_per_hour: 40,
    cost_per_hour: 0.5944,
    cpu_cores: 8,
    ram_gb: 16,
    best_for: 'Full stack apps, multi-container workflows',
  },
  Medium: {
    credits_per_hour: 80,
    cost_per_hour: 1.1888,
    cpu_cores: 16,
    ram_gb: 32,
    best_for: 'Data pipelines, heavy compilations',
  },
  Large: {
    credits_per_hour: 160,
    cost_per_hour: 2.3776,
    cpu_cores: 32,
    ram_gb: 64,
    best_for: 'Large scale builds, distributed tests',
  },
  XLarge: {
    credits_per_hour: 320,
    cost_per_hour: 4.7552,
    cpu_cores: 64,
    ram_gb: 128,
    best_for: 'Massive workloads, high memory pipelines',
  },
};

export const SANDBOX_PLANS = {
  Build: {
    name: 'Build',
    price_monthly_usd: 0,
    concurrent_vms: 10,
    free_credits_monthly: 0,
  },
  Scale: {
    name: 'Scale',
    price_monthly_usd: 170,
    concurrent_vms: 250,
    free_credits_monthly: 1100,
  },
  Enterprise: {
    name: 'Enterprise',
    price_monthly_usd: 'Custom',
    concurrent_vms: 'Custom',
    free_credits_monthly: 'Custom / volume discount',
  },
};

export const SANDBOX_CREDIT_RATE_USD = 0.01486;

// ── 2. Documentation Getters ─────────────────────────────────────────────────

export function getCodeExecutionOverview() {
  return {
    success: true,
    title: 'Together AI Code Execution Suite Overview',
    docs_urls: {
      code_interpreter: 'https://docs.together.ai/docs/together-code-interpreter',
      code_sandbox: 'https://docs.together.ai/docs/together-code-sandbox',
    },
    products: {
      code_interpreter: {
        description: 'Serverless interactive Python execution environment with session state retention.',
        pricing: '$0.03 per session (60-minute lifespan)',
        runtime: 'Python (preloaded with 30 scientific packages)',
        ideal_for: 'AI agents, math/eval calculation, data plotting, RL feedback loops.',
      },
      code_sandbox: {
        description: 'Configurable microVM development environment powered by CodeSandbox & Firecracker.',
        pricing: '$0.01486 per VM credit (e.g., Nano at $0.1486/hr)',
        runtime: 'Full Linux microVM with Docker, Dev Containers, ports, dev servers, git persistence.',
        ideal_for: 'Web dev environments, running dev servers, previewing full applications in browser.',
      },
    },
    decision_matrix: [
      {
        need: 'Execute quick Python code snippets / calculate math',
        recommended: 'Together Code Interpreter (TCI)',
        cost_unit: '$0.03/session',
      },
      {
        need: 'Run full Vite/Next.js web app with live ports',
        recommended: 'Together Code Sandbox',
        cost_unit: '10 credits/hr ($0.1486/hr for Nano)',
      },
      {
        need: 'AI Agent code tool in LangChain / Cursor / Windsurf',
        recommended: 'TCI MCP Server (@togethercomputer/mcp-server-tci)',
        cost_unit: '$0.03/session',
      },
      {
        need: 'Multi-container Docker / DevContainer environment',
        recommended: 'Together Code Sandbox (CLEAN bootup)',
        cost_unit: 'Micro or Small VM tier',
      },
    ],
  };
}

export function getCodeInterpreterDocs() {
  return {
    success: true,
    title: 'Together Code Interpreter (TCI) Reference',
    docs_url: 'https://docs.together.ai/docs/together-code-interpreter',
    pricing: TCI_SPEC.session_pricing,
    lifespan: `${TCI_SPEC.session_lifespan_minutes} minutes`,
    supported_languages: TCI_SPEC.supported_languages,
    agent_skill: TCI_SPEC.agent_skill,
    mcp_server: TCI_SPEC.mcp_server,
    preinstalled_packages: TCI_SPEC.preinstalled_packages,
    runtime_package_install: '!pip install <package>',
    endpoints: {
      execute: 'POST https://api.together.ai/tci/execute (alias: /v1/tci/execute)',
      sessions: 'GET https://api.together.ai/tci/sessions (alias: /v1/tci/sessions)',
    },
    output_types: TCI_SPEC.output_types,
    code_snippets: {
      python_v2: `from together import Together
client = Together()

response = client.code_interpreter.execute(
    code='print("Welcome to Together Code Interpreter!")',
    language="python",
)
print(f"Status: {response.data.status}")
for output in response.data.outputs:
    print(f"{output.type}: {output.data}")`,
      typescript: `import Together from 'together-ai';
const client = new Together();

const response = await client.codeInterpreter.execute({
  code: 'print("Welcome to Together Code Interpreter!")',
  language: 'python',
});

if (response.errors) {
  console.log('Errors:', response.errors);
} else {
  for (const output of response.data.outputs) {
    console.log(\`\${output.type}: \${output.data}\`);
  }
}`,
      curl_execute: `curl -X POST "https://api.together.ai/tci/execute" \\
  -H "Authorization: Bearer $TOGETHER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "language": "python",
    "code": "print(\\"Welcome to Together Code Interpreter!\\")"
  }'`,
      files_support: `const response = await client.codeInterpreter.execute({
  code: "!python myscript.py",
  language: "python",
  files: [
    {
      name: "myscript.py",
      encoding: "string",
      content: "import sys\\nprint(f'Hello from {sys.argv[0]}')",
    },
  ],
});`,
      session_reuse: `// Call 1
const res1 = await client.codeInterpreter.execute({ code: "x = 42", language: "python" });
const sessionId = res1.data.session_id;

// Call 2 (reuses packages & variables)
const res2 = await client.codeInterpreter.execute({
  code: "print(f'The value of x is {x}')",
  language: "python",
  session_id: sessionId,
});`,
    },
  };
}

export function getCodeSandboxDocs() {
  return {
    success: true,
    title: 'Together Code Sandbox Reference (CodeSandbox SDK)',
    docs_url: 'https://docs.together.ai/docs/together-code-sandbox',
    sdk_package: '@codesandbox/sdk',
    startup_time: '< 3 seconds (template snapshot cloning)',
    credit_cost_usd: SANDBOX_CREDIT_RATE_USD,
    bootup_types: SANDBOX_BOOTUP_TYPES,
    vm_tiers: SANDBOX_VM_TIERS,
    plans: SANDBOX_PLANS,
    tasks_schema: {
      file: '.codesandbox/tasks.json',
      example: {
        setupTasks: ['npm install'],
        tasks: {
          'dev-server': {
            name: 'Dev Server',
            command: 'npm run dev',
            runAtStart: true,
          },
        },
      },
    },
    code_snippets: {
      create_and_run: `import { CodeSandbox } from "@codesandbox/sdk";
const sdk = new CodeSandbox(process.env.CSB_API_KEY);

const sandbox = await sdk.sandboxes.create();
const session = await sandbox.connect();
const output = await session.commands.run("echo 'Hello World'");
console.log(output); // Hello World`,
      template_build_cli: `CSB_API_KEY=your-api-key npx @codesandbox/sdk build ./my-template --ports 5173 --vmTier Nano`,
      browser_session: `// Server:
app.post('/api/sandboxes', async (req, res) => {
  const sandbox = await sdk.sandboxes.create();
  const session = await sandbox.createBrowserSession({ id: req.session.username });
  res.json(session);
});

// Browser:
import { connectToSandbox } from '@codesandbox/sdk/browser';
const sandbox = await connectToSandbox({
  session: initialSessionFromServer,
  getSession: (id) => fetch(\`/api/sandboxes/\${id}\`).then(r => r.json()),
});
await sandbox.fs.writeTextFile('test.txt', 'Hello World');`,
    },
  };
}

// ── 3. Cost Estimator & Parameter Validation ─────────────────────────────────

/**
 * Estimates monthly bill for Together Code Sandbox based on official pricing formula
 */
export function estimateSandboxCost(params = {}) {
  const {
    vmTier = 'Nano',
    hoursPerDay = 3,
    days = 30,
    concurrentVms = 80,
    plan = 'Scale',
  } = params;

  const tier = SANDBOX_VM_TIERS[vmTier] || SANDBOX_VM_TIERS.Nano;
  const selectedPlan = SANDBOX_PLANS[plan] || SANDBOX_PLANS.Scale;

  const totalRuntimeHours = concurrentVms * hoursPerDay * days;
  const totalVmCredits = totalRuntimeHours * tier.credits_per_hour;

  const freeCredits = typeof selectedPlan.free_credits_monthly === 'number' ? selectedPlan.free_credits_monthly : 0;
  const billableCredits = Math.max(0, totalVmCredits - freeCredits);
  const creditsCostUsd = parseFloat((billableCredits * SANDBOX_CREDIT_RATE_USD).toFixed(2));

  const basePriceUsd = typeof selectedPlan.price_monthly_usd === 'number' ? selectedPlan.price_monthly_usd : 0;
  const totalEstimatedMonthlyBillUsd = parseFloat((basePriceUsd + creditsCostUsd).toFixed(2));

  return {
    vm_tier: vmTier,
    tier_specs: tier,
    plan: selectedPlan.name,
    concurrent_vms: concurrentVms,
    hours_per_day: hoursPerDay,
    days: days,
    total_runtime_hours: totalRuntimeHours,
    total_vm_credits: totalVmCredits,
    plan_included_credits: freeCredits,
    billable_credits: billableCredits,
    credit_rate_usd: SANDBOX_CREDIT_RATE_USD,
    credits_cost_usd: creditsCostUsd,
    plan_base_price_usd: basePriceUsd,
    total_estimated_monthly_bill_usd: totalEstimatedMonthlyBillUsd,
    formula: `(${concurrentVms} VMs * ${hoursPerDay} hrs/day * ${days} days * ${tier.credits_per_hour} credits/hr - ${freeCredits} included) * $${SANDBOX_CREDIT_RATE_USD}/credit + $${basePriceUsd} base plan`,
  };
}

/**
 * Validates Together Code Interpreter execution request
 */
export function validateTciParams(payload = {}) {
  const errors = [];
  const warnings = [];

  const { code, language = 'python', session_id, files } = payload;

  if (!code || typeof code !== 'string') {
    errors.push('Missing or invalid required parameter: "code" must be a non-empty string.');
  }

  if (language && language.toLowerCase() !== 'python') {
    errors.push(`Unsupported language '${language}'. Together Code Interpreter currently only supports 'python'.`);
  }

  if (session_id && typeof session_id !== 'string') {
    errors.push('Optional parameter "session_id" must be a string.');
  }

  if (files) {
    if (!Array.isArray(files)) {
      errors.push('Optional parameter "files" must be an array of file objects.');
    } else {
      files.forEach((f, idx) => {
        if (!f.name || typeof f.name !== 'string') {
          errors.push(`files[${idx}]: missing required "name" string.`);
        }
        if (f.content === undefined || f.content === null) {
          errors.push(`files[${idx}]: missing required "content".`);
        }
        if (f.encoding && !['string', 'base64', 'utf-8'].includes(f.encoding)) {
          warnings.push(`files[${idx}]: unexpected encoding '${f.encoding}', recommended: 'string' or 'base64'.`);
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    language: 'python',
    has_session: Boolean(session_id),
    file_count: Array.isArray(files) ? files.length : 0,
  };
}

/**
 * Validates Together Code Sandbox creation parameters
 */
export function validateSandboxParams(payload = {}) {
  const errors = [];
  const warnings = [];

  const { vmTier = 'Nano', source = 'template', id, ports = [] } = payload;

  const validTiers = Object.keys(SANDBOX_VM_TIERS);
  if (vmTier && !validTiers.includes(vmTier)) {
    errors.push(`Invalid vmTier '${vmTier}'. Valid tiers: ${validTiers.join(', ')}.`);
  }

  if (source && !['template', 'scratch', 'devcontainer'].includes(source)) {
    warnings.push(`Uncommon source '${source}'. Standard sources: template, scratch.`);
  }

  if (ports && !Array.isArray(ports)) {
    errors.push('Optional "ports" must be an array of numbers.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    vmTier,
    source,
    id: id || null,
  };
}

// ── 4. Execution Dispatchers ─────────────────────────────────────────────────

export async function executeCodeInterpreter(payload = {}) {
  const validation = validateTciParams(payload);
  if (!validation.valid) {
    const error = new Error(`Validation failed: ${validation.errors.join('; ')}`);
    error.statusCode = 400;
    error.errors = validation.errors;
    throw error;
  }
  return llmCodeInterpreter(payload);
}

export async function listCodeInterpreterSessions() {
  return llmListCodeSessions();
}

export default {
  TCI_SPEC,
  SANDBOX_BOOTUP_TYPES,
  SANDBOX_VM_TIERS,
  SANDBOX_PLANS,
  SANDBOX_CREDIT_RATE_USD,
  getCodeExecutionOverview,
  getCodeInterpreterDocs,
  getCodeSandboxDocs,
  estimateSandboxCost,
  validateTciParams,
  validateSandboxParams,
  executeCodeInterpreter,
  listCodeInterpreterSessions,
};
