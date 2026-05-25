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

export const GcpA2uiService = {
  generateA2uiSystemPrompt,
  parseAndValidateA2ui,
  getA2uiBasicCatalog
};
