import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

const SAVE_CUSTOM_SKILL_TOOL = {
  name: 'save_custom_skill',
  description: 'Saves a dynamically generated custom OpenClaw skill descriptor (markdown) and script file to the user workspace.',
  parameters: {
    type: 'OBJECT',
    properties: {
      name: {
        type: 'STRING',
        description: 'The unique alphanumeric identifier for the skill (e.g. system_backup_tool)'
      },
      description: {
        type: 'STRING',
        description: 'Detailed explanation of what the skill does and what it returns'
      },
      parameters: {
        type: 'OBJECT',
        description: 'Schema parameter configurations.'
      },
      scriptName: {
        type: 'STRING',
        description: 'Filename with path extension (e.g. backup.py, run.js, test.sh)'
      },
      scriptContent: {
        type: 'STRING',
        description: 'Full source code content of the executable script file'
      }
    },
    required: ['name', 'description', 'scriptName', 'scriptContent']
  }
};

const defaultSkills = [
  {
    name: 'data_analyzer',
    description: 'Performs statistical analysis on workspace data files (CSV/JSON), generating beautiful markdown summaries.',
    parameters: {
      filepath: {
        type: 'string',
        description: 'Relative path to the CSV or JSON file in the workspace',
        required: true
      }
    }
  }
];

const properties = {};
const required = [];

Object.entries(defaultSkills[0].parameters).forEach(([name, param]) => {
  properties[name] = {
    type: (param.type || 'string').toUpperCase(),
    description: param.description || ''
  };
  if (param.required) {
    required.push(name);
  }
});

const userTools = [{
  name: defaultSkills[0].name,
  description: defaultSkills[0].description,
  parameters: {
    type: 'OBJECT',
    properties,
    required
  }
}];

const activeTools = [SAVE_CUSTOM_SKILL_TOOL, ...userTools];

async function run() {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.5-flash',
      tools: [{ functionDeclarations: activeTools }]
    });
    const result = await model.generateContent('Hello, can you analyze a file for me?');
    console.log('Response:', result.response.text());
  } catch (error) {
    console.error('Error querying Gemini with tools:', error);
  }
}

run();
