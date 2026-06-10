import { logger } from '../../../shared/logger.js';

/**
 * @typedef {object} AuthContext
 * @property {string} userId - The ID of the user performing the action.
 * @property {string} workspaceId - The ID of the workspace (tenant) the user belongs to.
 * @property {'super_admin' | 'admin' | 'manager' | 'user'} role - The role of the user.
 */

/**
 * @typedef {object} A2uiComponentSchema
 * @property {string} type - The type of the component (e.g., 'object').
 * @property {object} properties - An object defining the properties of the component.
 * @property {string[]} required - An array of strings listing the required properties for the component.
 */

/**
 * @typedef {object} A2uiBaseCatalog
 * @property {A2uiComponentSchema} text - Schema for a text component.
 * @property {A2uiComponentSchema} button - Schema for a button component.
 * @property {A2uiComponentSchema} row - Schema for a row layout component.
 * @property {A2uiComponentSchema} column - Schema for a column layout component.
 * @property {A2uiComponentSchema} textField - Schema for a text input field component.
 */

/**
 * The pre-approved Google A2UI standard base catalog schemas.
 * This constant defines the structure for a set of fundamental A2UI components.
 * It serves as the foundation, which can be extended on a per-workspace basis.
 * @type {A2uiBaseCatalog}
 */
const A2UI_BASE_CATALOG = {
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

// MULTI-TENANCY BUG FIX: The original implementation used a single global catalog, causing a critical
// multi-tenancy vulnerability where one workspace's extensions would leak to all others.
// This is replaced with a workspace-scoped cache. In a production environment, this should be a
// persistent, distributed cache (e.g., Redis) or a database table to handle multiple server instances.
const workspaceExtensionCatalogs = new Map();

/**
 * Retrieves the full component catalog for a specific workspace, merging the base catalog
 * with any workspace-specific extensions.
 * @param {string} [workspaceId] - The ID of the workspace.
 * @returns {object} The complete A2UI component catalog for the workspace.
 * @private
 */
const getWorkspaceCatalog = (workspaceId) => {
  // Create a deep copy of the base catalog to prevent mutation of the original constant.
  const baseCatalog = JSON.parse(JSON.stringify(A2UI_BASE_CATALOG));
  if (!workspaceId) {
    return baseCatalog;
  }
  const extensions = workspaceExtensionCatalogs.get(workspaceId) || {};
  return { ...baseCatalog, ...extensions };
};


/**
 * Programmatically generates standard system instructions for A2UI dynamic components.
 * This prompt guides a Large Language Model (LLM) to output declarative JSON for
 * interactive user interfaces, adhering to Google's A2UI specifications.
 *
 * @param {AuthContext} authContext - The authentication context of the user, containing workspaceId to load correct extensions.
 * @param {string[]} [allowedComponents] - An optional list of component keys (e.g., ['text', 'button'])
 *                                         to prune the schema and only include approved components in the prompt.
 *                                         If null or empty, all components from the workspace's catalog are included.
 * @param {boolean} [includeExamples=true] - Whether to inject few-shot examples into the system instructions
 *                                           to further guide the LLM's output format.
 * @returns {string} A fully compiled system prompt instruction block, ready to be sent to an LLM.
 */
const generateA2uiSystemPrompt = (authContext, allowedComponents = null, includeExamples = true) => {
  logger.info(`GCP A2UI: Compiling system prompt for workspace "${authContext?.workspaceId}"...`);

  // INTEGRATION FIX: The prompt now uses the workspace-specific catalog, ensuring that any
  // custom components activated by an admin for this tenant are included.
  const fullCatalog = getWorkspaceCatalog(authContext?.workspaceId);
  const targetCatalog = {};
  const activeKeys = allowedComponents || Object.keys(fullCatalog);

  for (const key of activeKeys) {
    if (fullCatalog[key]) {
      targetCatalog[key] = fullCatalog[key];
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
 * @typedef {object} A2uiValidationReport
 * @property {boolean} success - True if the A2UI payload was successfully parsed and passed all structural validations.
 * @property {boolean} containsUi - True if the raw text contained A2UI tags, regardless of validation success.
 * @property {string} [message] - A descriptive message, typically used when `containsUi` is false.
 * @property {string[]} [errors] - An array of error messages if validation failed (`success` is false).
 * @property {object|null} payload - The parsed JSON object representing the A2UI structure, or null if parsing failed or no UI was found.
 */

/**
 * Runs structural validation on a parsed A2UI JSON object against a given component catalog.
 * @param {object} parsedPayload - The parsed A2UI JSON object.
 * @param {object} catalog - The component catalog to validate against.
 * @returns {{success: boolean, errors: string[]}} A validation result.
 * @private
 */
const validateA2uiPayload = (parsedPayload, catalog) => {
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

            // BUG FIX: Added validation to ensure the component's type is defined in the approved catalog.
            if (!comp.type) {
                errors.push(`Component with ID "${comp.id}" is missing a "type" field.`);
            } else if (!catalog[comp.type]) {
                errors.push(`Component ID "${comp.id}" uses an unapproved type: "${comp.type}". Valid types are: ${Object.keys(catalog).join(', ')}.`);
            }
        }

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
            if (visited.has(componentId)) return;

            const comp = componentMap.get(componentId);
            if (!comp) {
                errors.push(`Child component ID "${componentId}" is referenced but not defined in the components array.`);
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

    return {
        success: errors.length === 0,
        errors
    };
};

/**
 * Extracts, sanitizes, and runs comprehensive validation checks on raw LLM conversational text
 * to identify and validate Google A2UI payloads.
 *
 * @param {string} rawText - Raw LLM streaming text response chunk that may contain an A2UI payload.
 * @param {AuthContext} [authContext=null] - The user's authentication context, used to load the correct workspace-specific component catalog for validation.
 * @returns {A2uiValidationReport} A validation report containing success status, structured JSON payload, and any structural warnings or errors.
 */
const parseAndValidateA2ui = (rawText, authContext = null) => {
  try {
    if (!rawText) {
      // BUG FIX: Changed from throwing an error to returning a structured report for consistency.
      return {
        success: false,
        containsUi: false,
        errors: ['Raw conversational response stream is empty.'],
        payload: null
      };
    }

    logger.info('GCP A2UI: Parsing raw text block to extract Google A2UI payload...');

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
    rawJson = rawJson.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

    logger.info('GCP A2UI: Extracted raw JSON string. Running structural validation check...');

    const parsedPayload = JSON.parse(rawJson);

    // INTEGRATION FIX: Load the appropriate catalog for the workspace to validate against custom components.
    const catalog = getWorkspaceCatalog(authContext?.workspaceId);
    const validationResult = validateA2uiPayload(parsedPayload, catalog);

    if (!validationResult.success) {
      logger.warn(`GCP A2UI: Structural validation failed with ${validationResult.errors.length} violations.`);
      return {
        success: false,
        containsUi: true,
        errors: validationResult.errors,
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
    // SECURITY: Ensure the error message is generic to avoid leaking implementation details.
    const isParsingError = err instanceof SyntaxError;
    const errorMessage = isParsingError ? 'Invalid JSON format in A2UI payload.' : 'An unexpected error occurred during A2UI parsing.';
    return {
      success: false,
      containsUi: true,
      errors: [errorMessage],
      payload: null
    };
  }
};

/**
 * Returns the Google A2UI base schema catalog object.
 * This provides a reference to the predefined component schemas.
 *
 * @returns {A2uiBaseCatalog} The immutable A2UI base component catalog.
 */
const getA2uiBaseCatalog = () => {
  return A2UI_BASE_CATALOG;
};

/**
 * Heuristically corrects typical LLM JSON structural syntax errors.
 * @param {string} rawJson - Raw, potentially malformed JSON string payload from an LLM.
 * @returns {string} A repaired and sanitized JSON string. Returns an empty string if input is null or empty.
 */
const fixA2uiPayload = (rawJson) => {
  if (!rawJson) return '';
  logger.info('GCP A2UI PayloadFixer: Attempting programmatic syntax correction on JSON string...');

  let fixed = rawJson.trim();
  fixed = fixed.replace(/"([^"]*)"/g, (match, group) => '"' + group.replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"');
  fixed = fixed.replace(/'([^']*)'\s*:/g, '"$1":');
  fixed = fixed.replace(/:\s*'([^']*)'/g, ': "$1"');
  fixed = fixed.replace(/([{,]\s*)([a-zA-Z0-9_\-]+)\s*:/g, '$1"$2":');
  fixed = fixed.replace(/,\s*([}\]])/g, '$1');

  const stack = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < fixed.length; i++) {
    const char = fixed[i];
    if (escape) { escape = false; continue; }
    if (char === '\\') { escape = true; continue; }
    if (char === '"') { inString = !inString; continue; }
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
    fixed += stack.pop();
  }
  return fixed;
};

/** @typedef {'text' | 'a2ui_partial' | 'a2ui_complete'} A2uiStreamPartType */
/** @typedef {{ type: 'text', content: string }} A2uiStreamPartText */
/** @typedef {{ type: 'a2ui_partial', bufferedLength: number }} A2uiStreamPartPartial */
/** @typedef {{ type: 'a2ui_complete', success: boolean, payload?: object, error?: string, rawPayload?: string }} A2uiStreamPartComplete */
/** @typedef {A2uiStreamPartText | A2uiStreamPartPartial | A2uiStreamPartComplete} A2uiStreamPart */

/**
 * Stateful stream parser that progressively processes incoming text chunks
 * to extract and validate Google A2UI dynamic components.
 */
class A2uiStreamParser {
  /**
   * @param {object} [catalog=null] - The component catalog to validate against. If null, uses the base catalog.
   */
  constructor(catalog = null) {
    this.buffer = '';
    this.insideTag = false;
    // BUG FIX: The provided catalog was previously unused. It is now used for validation.
    this.catalog = catalog || A2UI_BASE_CATALOG;
  }

  /**
   * Processes a single chunk of text from a stream.
   * @param {string} chunk - The incoming text chunk to process.
   * @returns {A2uiStreamPart[]} An array of processed parts.
   */
  processChunk(chunk) {
    if (!chunk) return [];
    this.buffer += chunk;
    const parts = [];

    while (this.buffer.length > 0) {
      if (!this.insideTag) {
        const tagIndex = this.buffer.toLowerCase().indexOf('<a2ui-json>');
        if (tagIndex === -1) {
          parts.push({ type: 'text', content: this.buffer });
          this.buffer = '';
          break;
        } else {
          if (tagIndex > 0) {
            parts.push({ type: 'text', content: this.buffer.substring(0, tagIndex) });
          }
          this.insideTag = true;
          this.buffer = this.buffer.substring(tagIndex + '<a2ui-json>'.length);
        }
      } else {
        const closeIndex = this.buffer.toLowerCase().indexOf('</a2ui-json>');
        if (closeIndex === -1) {
          parts.push({ type: 'a2ui_partial', bufferedLength: this.buffer.length });
          break;
        } else {
          let rawJson = this.buffer.substring(0, closeIndex).trim();
          this.buffer = this.buffer.substring(closeIndex + '</a2ui-json>'.length);
          this.insideTag = false;

          rawJson = rawJson.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
          const repairedJson = fixA2uiPayload(rawJson);

          try {
            const parsedPayload = JSON.parse(repairedJson);
            // INTEGRATION: Validate the parsed payload against the provided catalog.
            const validationResult = validateA2uiPayload(parsedPayload, this.catalog);
            if (!validationResult.success) {
              throw new Error(validationResult.errors.join('; '));
            }
            parts.push({ type: 'a2ui_complete', success: true, payload: parsedPayload });
          } catch (err) {
            parts.push({ type: 'a2ui_complete', success: false, error: err.message, rawPayload: rawJson });
          }
        }
      }
    }
    return parts;
  }
}

/** @typedef {{ buffer: string, insideTag: boolean }} A2uiStreamState */
/** @typedef {{ parts: A2uiStreamPart[], newState: A2uiStreamState }} ParseA2uiStreamChunkResult */

/**
 * Stateless wrapper for `A2uiStreamParser` that processes a single stream chunk.
 * @param {string} chunk - The incoming text chunk to process.
 * @param {A2uiStreamState} [state={ buffer: '', insideTag: false }] - The current state of the stream parser.
 * @param {object} [catalog=null] - The component catalog to validate against.
 * @returns {ParseA2uiStreamChunkResult} An object containing the processed parts and the new state.
 */
const parseA2uiStreamChunk = (chunk, state = { buffer: '', insideTag: false }, catalog = null) => {
  const parser = new A2uiStreamParser(catalog);
  parser.buffer = state.buffer || '';
  parser.insideTag = state.insideTag || false;
  const parts = parser.processChunk(chunk);
  return { parts, newState: { buffer: parser.buffer, insideTag: parser.insideTag } };
};

/** @typedef {{ componentId: string, action: string, values?: object }} A2uiRpcPayload */
/** @typedef {{ success: boolean, actionProcessed: string, timestamp: string, surfaceUpdate: object }} A2uiRpcResponseUpdate */

/**
 * Stateful dispatcher that processes incoming user interface actions (RPCs) from an A2UI client.
 *
 * @param {object} sessionState - The current session state, which MUST include an `authContext`.
 * @param {AuthContext} sessionState.authContext - The user's authentication context.
 * @param {A2uiRpcPayload} rpcPayload - The RPC trigger packet containing details about the user's interaction.
 * @returns {Promise<A2uiRpcResponseUpdate>} A promise that resolves to an interactive response update.
 */
const handleA2uiRpc = async (sessionState, rpcPayload) => {
  // CRITICAL INTEGRATION: The sessionState MUST contain an authContext with user, role, and workspaceId
  // to enforce security and tenant boundaries for every action.
  const { authContext } = sessionState;
  if (!authContext || !authContext.userId || !authContext.workspaceId) {
    logger.error('GCP A2UI RPC: Authorization failed. Missing authContext in sessionState.');
    return {
      success: false,
      actionProcessed: rpcPayload.action,
      timestamp: new Date().toISOString(),
      surfaceUpdate: {
        root: 'error-layout',
        components: [{ id: 'error-layout', type: 'text', content: 'Error: Your session is invalid or has expired. Please refresh.' }]
      }
    };
  }

  logger.info(`GCP A2UI RPC: User "${authContext.userId}" in workspace "${authContext.workspaceId}" executing action "${rpcPayload.action}" on component "${rpcPayload.componentId}"...`);

  // HIERARCHY & SECURITY: Placeholder for role-based access control (RBAC).
  // Real-world applications must validate if the user's role permits this specific action.
  // e.g., a 'user' role might not be allowed to trigger a 'delete_data' action.
  // const isAuthorized = await rbacService.check(authContext, 'a2ui:rpc', rpcPayload.action);
  // if (!isAuthorized) { /* return authorization error UI */ }

  // HIERARCHY & USAGE: Placeholder for propagating usage metrics.
  // Actions that consume resources should be tracked and reported up the hierarchy.
  // This could trigger notifications to managers or admins if limits are approached.
  // e.g., await usageService.trackAction(authContext, 'a2ui_rpc', { action: rpcPayload.action });

  const componentId = rpcPayload.componentId || 'unknown';
  const action = rpcPayload.action || 'click';
  const values = rpcPayload.values || {};

  const responseUpdate = {
    success: true,
    actionProcessed: action,
    timestamp: new Date().toISOString(),
    surfaceUpdate: {
      root: 'rpc-status-layout',
      components: [
        { id: 'rpc-status-layout', type: 'column', children: ['status-lbl', 'refresh-btn'] },
        { id: 'status-lbl', type: 'text', content: `Action "${action}" on component "${componentId}" processed successfully! Values: ${JSON.stringify(values)}` },
        { id: 'refresh-btn', type: 'button', label: 'Continue', action: 'reset_explore' }
      ]
    }
  };

  return responseUpdate;
};

/** @typedef {{ success: boolean, activatedId: string, catalogKeys: string[] }} ActivateExtensionResult */

/**
 * Dynamically registers and validates a new custom UI component for a specific workspace.
 *
 * @param {AuthContext} authContext - The context of the user performing the action, used for authorization and scoping.
 * @param {string} extensionId - The unique identifier for the extension component (e.g., 'myCustomCard').
 * @param {A2uiComponentSchema} componentSchema - The JSON Schema defining the new component's structure.
 * @returns {ActivateExtensionResult} An object indicating the activation result.
 * @throws {Error} If context is invalid, permissions are insufficient, or parameters are missing.
 */
const tryActivateExtension = (authContext, extensionId, componentSchema) => {
  logger.info(`GCP A2UI: Attempting to activate extension "${extensionId}" for workspace "${authContext?.workspaceId}"...`);

  // SECURITY & HIERARCHY FIX: Role-based access control. Only admins or super_admins can modify the component catalog for a workspace.
  if (!authContext || !['admin', 'super_admin'].includes(authContext.role)) {
    throw new Error('Authorization failed: Insufficient permissions to activate a UI extension.');
  }
  if (!authContext.workspaceId) {
    throw new Error('A valid workspaceId is required in the authContext to activate an extension.');
  }
  if (!extensionId || !componentSchema) {
    throw new Error('Extension ID and Component Schema are required.');
  }

  // MULTI-TENANCY BUG FIX: The extension is now correctly associated with the specific workspace from the authContext,
  // preventing data leakage between tenants.
  if (!workspaceExtensionCatalogs.has(authContext.workspaceId)) {
    workspaceExtensionCatalogs.set(authContext.workspaceId, {});
  }
  const workspaceCatalog = workspaceExtensionCatalogs.get(authContext.workspaceId);
  workspaceCatalog[extensionId] = componentSchema;

  logger.info(`GCP A2UI: Extension "${extensionId}" successfully activated for workspace "${authContext.workspaceId}".`);

  return {
    success: true,
    activatedId: extensionId,
    catalogKeys: Object.keys(getWorkspaceCatalog(authContext.workspaceId))
  };
};

/**
 * Provides a collection of services for interacting with Google's Agent-to-User Interface (A2UI) standard.
 * @namespace GcpA2uiService
 */
export const GcpA2uiService = {
  generateA2uiSystemPrompt,
  parseAndValidateA2ui,
  getA2uiBaseCatalog,
  fixA2uiPayload,
  parseA2uiStreamChunk,
  A2uiStreamParser,
  handleA2uiRpc,
  tryActivateExtension
};