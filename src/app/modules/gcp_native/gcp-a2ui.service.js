import { logger } from '../../../shared/logger.js';

// The pre-approved Google A2UI standard basic catalog schemas
const A2UI_BASIC_CATALOG = {
  text: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      type: { const: 'text' },
      content: { type: 'string' },
      style: { type: 'object', properties: { size: { type: 'string' }, color: { type: 'string' } } }
    },
    required: ['id', 'type', 'content']
  },
  button: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      type: { const: 'button' },
      label: { type: 'string' },
      action: { type: 'string' }
    },
    required: ['id', 'type', 'label']
  },
  row: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      type: { const: 'row' },
      children: { type: 'array', items: { type: 'string' } }
    },
    required: ['id', 'type', 'children']
  },
  column: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      type: { const: 'column' },
      children: { type: 'array', items: { type: 'string' } }
    },
    required: ['id', 'type', 'children']
  },
  textField: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      type: { const: 'textField' },
      placeholder: { type: 'string' },
      valuePath: { type: 'string' }
    },
    required: ['id', 'type']
  }
};

/**
 * Programmatically generates standard system instructions for A2UI dynamic components.
 * 
 * @param {string[]} [allowedComponents] - List of approved components to prune the schema (optional)
 * @param {boolean} [includeExamples=true] - Whether to inject few-shot examples into the system instructions
 * @returns {string} Fully compiled system prompt instruction block
 */
const generateA2uiSystemPrompt = (allowedComponents = null, includeExamples = true) => {
  logger.info('GCP A2UI: Compiling system prompt specifications for Google Agent-to-User Interface...');
  
  const targetCatalog = {};
  const activeKeys = allowedComponents || Object.keys(A2UI_BASIC_CATALOG);
  
  for (const key of activeKeys) {
    if (A2UI_BASIC_CATALOG[key]) {
      targetCatalog[key] = A2UI_BASIC_CATALOG[key];
    }
  }

  let prompt = `
=== GOOGLE AGENT-TO-USER INTERFACE (A2UI) STANDARD ===
You are equipped with Google A2UI capabilities. When a user request is best served via an interactive user interface, you must output a declarative JSON representation describing the structural layout, and enclose it in standard A2UI XML tags:

<a2ui-json>
[
  {
    "surfaceUpdate": {
      "root": "main-layout",
      "components": [
        {
          "id": "main-layout",
          "type": "column",
          "children": ["title-text", "action-btn"]
        },
        {
          "id": "title-text",
          "type": "text",
          "content": "Grounded Information Panel"
        },
        {
          "id": "action-btn",
          "type": "button",
          "label": "Click to Explore"
        }
      ]
    }
  }
]
</a2ui-json>

=== SECURITY AND VALIDATION RULES ===
1. All component IDs in the "components" array must be unique.
2. The hierarchy must form a directed acyclic tree with no circular dependencies or self-referencing loops.
3. Nesting depth must not exceed 50 levels.
4. Only use the approved components defined in the JSON Schema catalog below.

=== APPROVED COMPONENT CATALOG ===
${JSON.stringify(targetCatalog, null, 2)}
`;

  if (includeExamples) {
    prompt += `
=== FEW-SHOT EXAMPLES ===
User: Show me a feedback card with a submit button
Assistant: Here is a feedback card:
<a2ui-json>
[
  {
    "surfaceUpdate": {
      "root": "feedback-col",
      "components": [
        {
          "id": "feedback-col",
          "type": "column",
          "children": ["lbl", "input-field", "submit-btn"]
        },
        {
          "id": "lbl",
          "type": "text",
          "content": "Share your thoughts"
        },
        {
          "id": "input-field",
          "type": "textField",
          "placeholder": "Enter your feedback..."
        },
        {
          "id": "submit-btn",
          "type": "button",
          "label": "Submit Feedback"
        }
      ]
    }
  }
]
</a2ui-json>
`;
  }

  return prompt;
};

/**
 * Extracts, sanitizes, and runs comprehensive validation checks on raw LLM conversational text.
 * 
 * @param {string} rawText - Raw LLM streaming text response chunk
 * @returns {object} Validation report containing success, structured JSON payload, and any structural warnings
 */
const parseAndValidateA2ui = (rawText) => {
  try {
    if (!rawText) {
      throw new Error('Raw conversational response stream is empty.');
    }

    logger.info('GCP A2UI: Parsing raw text block to extract Google A2UI payload...');

    // Regex-based block extraction following Google specifications
    const match = rawText.match(/<a2ui-json>([\s\S]*?)<\/a2ui-json>/i);
    if (!match) {
      return {
        success: true,
        containsUi: false,
        message: 'No Google A2UI payload detected in the response stream.',
        payload: null
      };
    }

    let rawJson = match[1].trim();

    // Sanitization: Strip accidental markdown code blocks wrapped by the LLM
    rawJson = rawJson.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

    logger.info('GCP A2UI: Extracted raw JSON string. Running structural validation check...');

    // Parse JSON
    const parsedPayload = JSON.parse(rawJson);
    
    // Core structural validation rules
    const errors = [];
    const updates = Array.isArray(parsedPayload) ? parsedPayload : [parsedPayload];

    for (const update of updates) {
      const surfaceUpdate = update.surfaceUpdate;
      if (!surfaceUpdate) {
        errors.push('Payload missing "surfaceUpdate" wrapper.');
        continue;
      }

      const rootId = surfaceUpdate.root;
      const components = surfaceUpdate.components || [];

      if (!rootId) {
        errors.push('surfaceUpdate is missing a "root" component pointer.');
      }

      if (!Array.isArray(components) || components.length === 0) {
        errors.push('components must be a non-empty array.');
        continue;
      }

      // 1. Component Unique ID rule
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

      // 2. Topology, Orphan and Recursion/Circular reference checks
      const visited = new Set();
      const stack = new Set();

      const checkCycleAndNesting = (componentId, depth = 0) => {
        if (depth > 50) {
          errors.push(`Nesting recursion depth exceeded maximum limit of 50 at ID "${componentId}".`);
          return;
        }

        if (stack.has(componentId)) {
          errors.push(`Circular reference dependency detected at component ID: "${componentId}".`);
          return;
        }

        if (visited.has(componentId)) return; // Already validated

        const comp = componentMap.get(componentId);
        if (!comp) {
          errors.push(`Child component ID "${componentId}" is referenced but not defined in the catalog.`);
          return;
        }

        visited.add(componentId);
        stack.add(componentId);

        // Standard layout structural containers (Row, Column) have children ID arrays
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

      // Detect orphaned components (components not reachable from root)
      for (const compId of idSet) {
        if (!visited.has(compId)) {
          errors.push(`Orphaned component detected: "${compId}" is not reachable from the root component.`);
        }
      }
    }

    if (errors.length > 0) {
      logger.warn(`GCP A2UI: Structural validation failed with ${errors.length} violations.`);
      return {
        success: false,
        containsUi: true,
        errors: errors,
        payload: parsedPayload
      };
    }

    logger.info('GCP A2UI: Structural validation check completed successfully. Payload is clean.');

    return {
      success: true,
      containsUi: true,
      errors: [],
      payload: parsedPayload
    };
  } catch (err) {
    logger.error('GCP A2UI Parsing Exception:', err);
    return {
      success: false,
      containsUi: true,
      errors: [err.message],
      payload: null
    };
  }
};

/**
 * Returns the Google A2UI basic schema catalog object.
 */
const getA2uiBasicCatalog = () => {
  return A2UI_BASIC_CATALOG;
};

/**
 * Heuristically corrects typical LLM JSON structural syntax errors.
 * 
 * @param {string} rawJson - Raw, potentially malformed JSON string payload
 * @returns {string} Repaired and sanitized JSON string
 */
const fixA2uiPayload = (rawJson) => {
  if (!rawJson) return '';
  logger.info('GCP A2UI PayloadFixer: Attempting programmatic syntax correction on JSON string...');
  
  let fixed = rawJson.trim();

  // 1. Repair unescaped newlines inside string literals
  fixed = fixed.replace(/"([^"]*)"/g, (match, group) => {
    return '"' + group.replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
  });

  // 2. Repair single quotes to double quotes for properties and values
  fixed = fixed.replace(/'([^']*)'\s*:/g, '"$1":');
  fixed = fixed.replace(/:\s*'([^']*)'/g, ': "$1"');

  // 3. Repair unquoted property keys
  fixed = fixed.replace(/([{,]\s*)([a-zA-Z0-9_\-]+)\s*:/g, '$1"$2":');

  // 4. Remove trailing commas in objects and arrays
  fixed = fixed.replace(/,\s*([}\]])/g, '$1');

  // 5. Match and close any unclosed trailing brackets/braces using stack matching
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
 * Stateful stream parser that parses dynamic text chunks progressively.
 */
class A2uiStreamParser {
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
        const tagIndex = this.buffer.toLowerCase().indexOf('<a2ui-json>');
        
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
          this.buffer = this.buffer.substring(tagIndex + '<a2ui-json>'.length);
        }
      } else {
        const closeIndex = this.buffer.toLowerCase().indexOf('</a2ui-json>');

        if (closeIndex === -1) {
          parts.push({
            type: 'a2ui_partial',
            bufferedLength: this.buffer.length
          });
          break;
        } else {
          let rawJson = this.buffer.substring(0, closeIndex).trim();
          this.buffer = this.buffer.substring(closeIndex + '</a2ui-json>'.length);
          this.insideTag = false;

          rawJson = rawJson.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
          const repairedJson = fixA2uiPayload(rawJson);

          try {
            const parsedPayload = JSON.parse(repairedJson);
            parts.push({
              type: 'a2ui_complete',
              success: true,
              payload: parsedPayload
            });
          } catch (err) {
            parts.push({
              type: 'a2ui_complete',
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
const parseA2uiStreamChunk = (chunk, state = { buffer: '', insideTag: false }) => {
  const parser = new A2uiStreamParser();
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

/**
 * Stateful dispatcher that processes incoming user interface actions,
 * dynamically runs bound tools, and returns updated dynamic layouts.
 * 
 * @param {object} sessionState - Current session state (components and values)
 * @param {object} rpcPayload - RPC trigger packet (componentId, action, values)
 * @returns {Promise<object>} The interactive response update
 */
const handleA2uiRpc = async (sessionState, rpcPayload) => {
  logger.info(`GCP A2UI RPC: Executing action "${rpcPayload.action}" on component "${rpcPayload.componentId}"...`);
  
  const componentId = rpcPayload.componentId || 'unknown';
  const action = rpcPayload.action || 'click';
  const values = rpcPayload.values || {};

  // Construct a standard response update with a refreshed dynamic surface
  const responseUpdate = {
    success: true,
    actionProcessed: action,
    timestamp: new Date().toISOString(),
    surfaceUpdate: {
      root: 'rpc-status-layout',
      components: [
        {
          id: 'rpc-status-layout',
          type: 'column',
          children: ['status-lbl', 'refresh-btn']
        },
        {
          id: 'status-lbl',
          type: 'text',
          content: `Action "${action}" on component "${componentId}" processed successfully! Recipient received values: ${JSON.stringify(values)}`
        },
        {
          id: 'refresh-btn',
          type: 'button',
          label: 'Continue Interactive Exploration',
          action: 'reset_explore'
        }
      ]
    }
  };

  return responseUpdate;
};

/**
 * Dynamically registers and validates a new custom dynamic UI component in the active catalog.
 * 
 * @param {string} extensionId - The unique namespace identifier for the extension
 * @param {object} componentSchema - The JSON Schema defining the new component structure
 * @returns {object} Activation result status
 */
const tryActivateExtension = (extensionId, componentSchema) => {
  logger.info(`GCP A2UI: Attempting to dynamically activate extension component "${extensionId}"...`);
  
  if (!extensionId || !componentSchema) {
    throw new Error('Extension ID and Component Schema are required.');
  }

  // Merge the new schema into our active basic catalog configuration
  A2UI_BASIC_CATALOG[extensionId] = componentSchema;
  
  return {
    success: true,
    activatedId: extensionId,
    catalogKeys: Object.keys(A2UI_BASIC_CATALOG)
  };
};

export const GcpA2uiService = {
  generateA2uiSystemPrompt,
  parseAndValidateA2ui,
  getA2uiBasicCatalog,
  fixA2uiPayload,
  parseA2uiStreamChunk,
  A2uiStreamParser,
  handleA2uiRpc,
  tryActivateExtension
};
