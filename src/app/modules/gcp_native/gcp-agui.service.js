import { logger } from '../../../shared/logger.js';

// The pre-approved Google AGUI standard graphical layout schemas
const AGUI_BASIC_CATALOG = {
  metricCard: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      type: { const: 'metricCard' },
      title: { type: 'string' },
      value: { type: 'string' },
      trend: { type: 'string' }, // e.g. "+12%"
      color: { type: 'string' } // e.g. "success", "danger"
    },
    required: ['id', 'type', 'title', 'value']
  },
  chart: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      type: { const: 'chart' },
      chartType: { type: 'string', enum: ['line', 'bar', 'pie', 'radar'] },
      series: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            data: { type: 'array', items: { type: 'number' } }
          },
          required: ['name', 'data']
        }
      },
      labels: { type: 'array', items: { type: 'string' } }
    },
    required: ['id', 'type', 'chartType', 'series']
  },
  dashboardGrid: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      type: { const: 'dashboardGrid' },
      cols: { type: 'number', minimum: 1, maximum: 12 },
      children: { type: 'array', items: { type: 'string' } }
    },
    required: ['id', 'type', 'children']
  },
  timelinePanel: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      type: { const: 'timelinePanel' },
      events: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            time: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' }
          },
          required: ['time', 'title']
        }
      }
    },
    required: ['id', 'type', 'events']
  }
};

/**
 * Programmatically generates standard system instructions for AGUI visual elements.
 */
const generateAguiSystemPrompt = (allowedComponents = null, includeExamples = true) => {
  logger.info('GCP AGUI: Compiling system prompt specifications for Google Agent Graphical User Interface...');
  
  const targetCatalog = {};
  const activeKeys = allowedComponents || Object.keys(AGUI_BASIC_CATALOG);
  
  for (const key of activeKeys) {
    if (AGUI_BASIC_CATALOG[key]) {
      targetCatalog[key] = AGUI_BASIC_CATALOG[key];
    }
  }

  let prompt = `
=== GOOGLE AGENT GRAPHICAL USER INTERFACE (AGUI) STANDARD ===
You are equipped with Google AGUI graphical canvas rendering. When a user requires rich data layouts, metrics dashboard grids, charts, or event timelines, you must output a declarative JSON representation and enclose it in standard AGUI XML tags:

<agui-json>
[
  {
    "canvasUpdate": {
      "root": "dashboard-layout",
      "components": [
        {
          "id": "dashboard-layout",
          "type": "dashboardGrid",
          "cols": 4,
          "children": ["cpu-card", "traffic-chart"]
        },
        {
          "id": "cpu-card",
          "type": "metricCard",
          "title": "CPU Usage",
          "value": "88.4%",
          "trend": "+4.2%",
          "color": "danger"
        },
        {
          "id": "traffic-chart",
          "type": "chart",
          "chartType": "line",
          "series": [
            { "name": "Incoming Requests", "data": [120, 150, 180, 220, 240] }
          ],
          "labels": ["10 AM", "11 AM", "12 PM", "1 PM", "2 PM"]
        }
      ]
    }
  }
]
</agui-json>

=== SECURITY AND VALIDATION RULES ===
1. All component IDs in the "components" array must be unique.
2. The layout graph must form a directed acyclic tree with no loops.
3. Nesting depth must not exceed 50 levels.
4. Use ONLY approved elements defined in the JSON Schema catalog below.

=== APPROVED GRAPHICAL CATALOG ===
${JSON.stringify(targetCatalog, null, 2)}
`;

  return prompt;
};

/**
 * Extracts, sanitizes, and runs comprehensive validation checks on raw AGUI text.
 */
const parseAndValidateAgui = (rawText) => {
  try {
    if (!rawText) {
      throw new Error('Raw conversational response stream is empty.');
    }

    logger.info('GCP AGUI: Parsing raw text block to extract Google AGUI payload...');

    const match = rawText.match(/<agui-json>([\s\S]*?)<\/agui-json>/i);
    if (!match) {
      return {
        success: true,
        containsUi: false,
        message: 'No Google AGUI payload detected in the response stream.',
        payload: null
      };
    }

    let rawJson = match[1].trim();
    rawJson = rawJson.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

    logger.info('GCP AGUI: Extracted raw JSON string. Running structural validation...');

    const parsedPayload = JSON.parse(rawJson);
    const errors = [];
    const updates = Array.isArray(parsedPayload) ? parsedPayload : [parsedPayload];

    for (const update of updates) {
      const canvasUpdate = update.canvasUpdate;
      if (!canvasUpdate) {
        errors.push('Payload missing "canvasUpdate" wrapper.');
        continue;
      }

      const rootId = canvasUpdate.root;
      const components = canvasUpdate.components || [];

      if (!rootId) {
        errors.push('canvasUpdate is missing a "root" component pointer.');
      }

      if (!Array.isArray(components) || components.length === 0) {
        errors.push('components must be a non-empty array.');
        continue;
      }

      const idSet = new Set();
      const componentMap = new Map();

      for (const comp of components) {
        if (!comp.id) {
          errors.push('Component is missing an "id" field.');
          continue;
        }

        if (idSet.has(comp.id)) {
          errors.push(`Duplicate component ID detected: "${comp.id}".`);
        }
        idSet.add(comp.id);
        componentMap.set(comp.id, comp);
      }

      const visited = new Set();
      const stack = new Set();

      const checkCycleAndNesting = (componentId, depth = 0) => {
        if (depth > 50) {
          errors.push(`Nesting depth exceeded limit of 50 at ID "${componentId}".`);
          return;
        }

        if (stack.has(componentId)) {
          errors.push(`Circular reference dependency detected at component ID: "${componentId}".`);
          return;
        }

        if (visited.has(componentId)) return;

        const comp = componentMap.get(componentId);
        if (!comp) {
          errors.push(`Child component ID "${componentId}" is referenced but not defined.`);
          return;
        }

        visited.add(componentId);
        stack.add(componentId);

        if (comp.children && Array.isArray(comp.children)) {
          for (const childId of comp.children) {
            checkCycleAndNesting(childId, depth + 1);
          }
        }

        stack.delete(componentId);
      };

      if (rootId && componentMap.has(rootId)) {
        checkCycleAndNesting(rootId);
      } else if (rootId) {
        errors.push(`Declared root component ID "${rootId}" is missing from the components array.`);
      }

      for (const compId of idSet) {
        if (!visited.has(compId)) {
          errors.push(`Orphaned component detected: "${compId}" is not reachable from the root component.`);
        }
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        containsUi: true,
        errors: errors,
        payload: parsedPayload
      };
    }

    return {
      success: true,
      containsUi: true,
      errors: [],
      payload: parsedPayload
    };
  } catch (err) {
    logger.error('GCP AGUI Parsing Exception:', err);
    return {
      success: false,
      containsUi: true,
      errors: [err.message],
      payload: null
    };
  }
};

/**
 * Heuristically corrects typical LLM JSON graphical structural syntax errors.
 */
const fixAguiPayload = (rawJson) => {
  if (!rawJson) return '';
  logger.info('GCP AGUI PayloadFixer: Attempting programmatic syntax correction on JSON string...');
  
  let fixed = rawJson.trim();

  // Repair unescaped newlines inside string literals
  fixed = fixed.replace(/"([^"]*)"/g, (match, group) => {
    return '"' + group.replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
  });

  // Repair single quotes to double quotes for properties and values
  fixed = fixed.replace(/'([^']*)'\s*:/g, '"$1":');
  fixed = fixed.replace(/:\s*'([^']*)'/g, ': "$1"');

  // Repair unquoted property keys
  fixed = fixed.replace(/([{,]\s*)([a-zA-Z0-9_\-]+)\s*:/g, '$1"$2":');

  // Remove trailing commas
  fixed = fixed.replace(/,\s*([}\]])/g, '$1');

  // Match and close brackets/braces using stack matching
  const stack = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < fixed.length; i++) {
    const char = fixed[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{' || char === '[') {
        stack.push(char === '{' ? '}' : ']');
      } else if (char === '}' || char === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === char) {
          stack.pop();
        }
      }
    }
  }

  while (stack.length > 0) {
    const closeChar = stack.pop();
    fixed += closeChar;
  }

  return fixed;
};

/**
 * Stateful stream parser that parses dynamic graphical text chunks progressively.
 */
class AguiStreamParser {
  constructor(catalog = null) {
    this.buffer = '';
    this.insideTag = false;
    this.catalog = catalog;
  }

  processChunk(chunk) {
    if (!chunk) return [];
    
    this.buffer += chunk;
    const parts = [];

    while (this.buffer.length > 0) {
      if (!this.insideTag) {
        const tagIndex = this.buffer.toLowerCase().indexOf('<agui-json>');
        
        if (tagIndex === -1) {
          parts.push({
            type: 'text',
            content: this.buffer
          });
          this.buffer = '';
          break;
        } else {
          if (tagIndex > 0) {
            parts.push({
              type: 'text',
              content: this.buffer.substring(0, tagIndex)
            });
          }
          this.insideTag = true;
          this.buffer = this.buffer.substring(tagIndex + '<agui-json>'.length);
        }
      } else {
        const closeIndex = this.buffer.toLowerCase().indexOf('</agui-json>');

        if (closeIndex === -1) {
          parts.push({
            type: 'agui_partial',
            bufferedLength: this.buffer.length
          });
          break;
        } else {
          let rawJson = this.buffer.substring(0, closeIndex).trim();
          this.buffer = this.buffer.substring(closeIndex + '</agui-json>'.length);
          this.insideTag = false;

          rawJson = rawJson.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
          const repairedJson = fixAguiPayload(rawJson);

          try {
            const parsedPayload = JSON.parse(repairedJson);
            parts.push({
              type: 'agui_complete',
              success: true,
              payload: parsedPayload
            });
          } catch (err) {
            parts.push({
              type: 'agui_complete',
              success: false,
              error: err.message,
              rawPayload: rawJson
            });
          }
        }
      }
    }

    return parts;
  }
}

/**
 * Stateless wrapper parsing a single stream chunk, returning response parts and a new state map.
 */
const parseAguiStreamChunk = (chunk, state = { buffer: '', insideTag: false }) => {
  const parser = new AguiStreamParser();
  parser.buffer = state.buffer || '';
  parser.insideTag = state.insideTag || false;

  const parts = parser.processChunk(chunk);

  return {
    parts,
    newState: {
      buffer: parser.buffer,
      insideTag: parser.insideTag
    }
  };
};

export const GcpAguiService = {
  generateAguiSystemPrompt,
  parseAndValidateAgui,
  fixAguiPayload,
  parseAguiStreamChunk,
  AguiStreamParser
};
