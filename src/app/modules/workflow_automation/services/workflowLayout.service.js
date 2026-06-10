import { logger } from '../../../../shared/logger.js';

/**
 * Validates the schema of React Flow nodes and edges for a workflow layout.
 * This function performs several checks to ensure the structural integrity and executability
 * of a workflow represented by React Flow components:
 * - Basic structural validation of nodes and edges (e.g., array types, object types).
 * - Uniqueness of node IDs.
 * - Presence of required node properties (`id`) and edge properties (`source`, `target`).
 * - Existence of referenced source/target nodes for all edges.
 * - Validation of `parameters` property within node data (must be an object if present).
 * - Detection of self-loops on nodes.
 * - Detection of cyclic dependencies within the workflow graph using Kahn's algorithm.
 * - Identification of completely disconnected nodes (nodes with no incoming or outgoing edges)
 *   that are not explicitly marked as 'trigger' nodes.
 * - Identification of unreachable nodes from any designated 'trigger' node, indicating
 *   parts of the workflow that will never execute.
 *
 * @param {Array<object>} nodes - An array of React Flow node objects. Each node is expected to have:
 *                                 `id` (string, unique), `type` (string, e.g., 'trigger', 'action'),
 *                                 `data` (object, optional, containing `stepType`, `parameters`, etc.).
 * @param {Array<object>} [edges=[]] - An array of React Flow edge objects. Each edge is expected to have:
 *                                   `source` (string, ID of the source node),
 *                                   `target` (string, ID of the target node),
 *                                   `sourceHandle` (string, optional, for specific output port).
 * @returns {object} A validation report object detailing the outcome of the checks.
 * @property {boolean} valid - `true` if the layout is valid and has no errors; `false` otherwise.
 * @property {Array<string>} errors - An array of error messages found during validation. If this array is not empty, `valid` will be `false`.
 * @property {Array<string>} warnings - An array of warning messages found during validation. Warnings indicate potential issues
 *                                      but do not prevent `valid` from being `true`.
 */
function validateLayoutSchema(nodes, edges = []) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(nodes)) {
    errors.push('Nodes must be an array.');
    return { valid: false, errors, warnings };
  }
  if (!Array.isArray(edges)) {
    errors.push('Edges must be an array.');
    return { valid: false, errors, warnings };
  }

  // Use a Map for O(1) node lookup by ID and a Set for O(1) duplicate ID check
  const nodeMap = new Map();
  const nodeIds = new Set();

  // 1. Validate basic node properties & unique IDs
  nodes.forEach((node, index) => {
    if (!node || typeof node !== 'object') {
      errors.push(`Node at index ${index} is invalid.`);
      return;
    }
    if (!node.id) {
      errors.push(`Node at index ${index} is missing a unique 'id' field.`);
      return;
    }
    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate node ID detected: '${node.id}'.`);
    }
    nodeIds.add(node.id);
    nodeMap.set(node.id, node); // Store node in map for quick lookup

    // Validate parameters structure if present
    if (node.data && node.data.parameters && typeof node.data.parameters !== 'object') {
      errors.push(`Node '${node.id}' contains invalid 'parameters' property (must be an object).`);
    }
  });

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // 2. Validate edge references
  edges.forEach((edge, index) => {
    if (!edge || typeof edge !== 'object') {
      errors.push(`Edge at index ${index} is invalid.`);
      return;
    }
    if (!edge.source || !edge.target) {
      errors.push(`Edge at index ${index} is missing required 'source' or 'target' field.`);
      return;
    }
    if (!nodeIds.has(edge.source)) {
      errors.push(`Edge references non-existent source node: '${edge.source}'.`);
    }
    if (!nodeIds.has(edge.target)) {
      errors.push(`Edge references non-existent target node: '${edge.target}'.`);
    }
  });

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // 3. Cycle and Deadlock Detection (using in-degree / Kahn's algorithm)
  // Also build adjacency list and incoming/outgoing degree maps for later use
  const adjList = new Map(); // nodeId -> [targetNodeId, ...]
  const inDegree = new Map(); // nodeId -> count of incoming edges
  const outDegree = new Map(); // nodeId -> count of outgoing edges

  // Initialize maps for all nodes
  nodes.forEach(node => {
    adjList.set(node.id, []);
    inDegree.set(node.id, 0);
    outDegree.set(node.id, 0);
  });

  // Build adjacency list (source -> targets) and calculate in-degree and out-degree
  edges.forEach(edge => {
    // Only add if source and target are not the same (self-loop prevention)
    if (edge.source === edge.target) {
      errors.push(`Self-loop detected on node '${edge.source}'.`);
      return;
    }
    // Ensure source and target nodes exist before adding to adjList/inDegree
    if (adjList.has(edge.source) && adjList.has(edge.target)) {
      adjList.get(edge.source).push(edge.target);
      inDegree.set(edge.target, inDegree.get(edge.target) + 1);
      outDegree.set(edge.source, outDegree.get(edge.source) + 1);
    }
  });

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // Kahn's algorithm for cycle detection
  const queue = [];
  inDegree.forEach((deg, nodeId) => {
    if (deg === 0) {
      queue.push(nodeId);
    }
  });

  const sortedList = [];
  let processedNodesCount = 0; // Track nodes processed by Kahn's
  while (queue.length > 0) {
    const node = queue.shift();
    sortedList.push(node);
    processedNodesCount++;

    const neighbors = adjList.get(node) || [];
    neighbors.forEach(neighbor => {
      inDegree.set(neighbor, inDegree.get(neighbor) - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    });
  }

  // If processedNodesCount is less than nodes length, there's a cycle!
  if (processedNodesCount < nodes.length) {
    errors.push('Cyclic dependency detected: the workflow contains a closed feedback loop.');
  }

  // 4. Identify disconnected and unreachable nodes/subgraphs
  if (nodes.length > 1) {
    // A node is completely disconnected if it has no incoming and no outgoing edges
    nodes.forEach(node => {
      // Use pre-computed inDegree and outDegree for O(1) lookup instead of O(M) filter
      const incomingCount = inDegree.get(node.id) || 0;
      const outgoingCount = outDegree.get(node.id) || 0;

      // BUG FIX: The original `isTrigger` definition incorrectly included `incomingCount === 0`,
      // which caused the `!isTrigger` condition to always be false when `incomingCount === 0`.
      // This prevented the warning for completely disconnected nodes that were not explicit triggers.
      // Now, `isExplicitTrigger` only checks the node's type/data, ensuring the warning
      // correctly fires for isolated nodes that are not designated triggers.
      const isExplicitTrigger = node.type === 'trigger' || (node.data && node.data.stepType === 'trigger');

      if (incomingCount === 0 && outgoingCount === 0 && !isExplicitTrigger) {
        warnings.push(`Node '${node.id}' is completely disconnected from the rest of the workflow and is not an explicit trigger.`);
      }
    });

    // Graph reachability traversal starting at all trigger nodes
    const triggerNodes = nodes.filter(node =>
      node.type === 'trigger' ||
      (node.data && node.data.stepType === 'trigger')
    );

    const reachable = new Set();
    const dfs = (nodeId) => {
      if (reachable.has(nodeId)) return;
      reachable.add(nodeId);
      // Use adjList for O(1) lookup of neighbors instead of O(M) filter
      const targets = adjList.get(nodeId) || [];
      targets.forEach(t => dfs(t));
    };

    triggerNodes.forEach(t => dfs(t.id));

    nodes.forEach(node => {
      if (!reachable.has(node.id)) {
        warnings.push(`Node '${node.id}' is unreachable from any trigger and will never execute.`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Compiles visual React Flow nodes and edges into a topologically sorted array of executable steps
 * suitable for a backend workflow engine. This function first validates the layout schema
 * using `validateLayoutSchema` and throws an error if the layout is invalid.
 *
 * The compilation process involves:
 * 1. Validating the input nodes and edges using `validateLayoutSchema`.
 * 2. Performing a topological sort (using Kahn's algorithm) to determine the correct
 *    execution order of steps, respecting dependencies.
 * 3. Mapping React Flow node properties to a standardized step format required by the backend.
 * 4. Resolving dependencies (`dependsOn` array) for each step based on incoming edges,
 *    optionally including `sourceHandle` for specific output port dependencies.
 *
 * @param {Array<object>} nodes - An array of React Flow node objects representing the workflow steps.
 *                                 Each node is expected to have:
 *                                 `id` (string, unique identifier),
 *                                 `type` (string, e.g., 'trigger', 'action'),
 *                                 `data` (object, optional, containing `stepType`, `app`, `action`, `parameters`, `continueOnError`),
 *                                 `position` (object, optional, e.g., `{ x: number, y: number }` for layout metadata).
 * @param {Array<object>} [edges=[]] - An array of React Flow edge objects representing the connections between steps.
 *                                   Each edge is expected to have:
 *                                   `source` (string, ID of the source node),
 *                                   `target` (string, ID of the target node),
 *                                   `sourceHandle` (string, optional, identifier for the output port on the source node).
 * @returns {Array<object>} An array of compiled workflow step objects, sorted in topological execution order.
 * @throws {Error} If the input `nodes` and `edges` fail schema validation, an error is thrown
 *                 with a message detailing the validation issues.
 * @property {string} returns.stepId - The unique identifier for the compiled step, derived from the React Flow node's `id`.
 * @property {string} returns.stepType - The type of the step (e.g., 'trigger', 'action', 'condition'),
 *                                        derived from `node.data.stepType` or `node.type`. Defaults to 'action'.
 * @property {string} returns.app - The application or service associated with this step,
 *                                   derived from `node.data.app` or `node.data.application`. Defaults to `node.type`.
 * @property {string} returns.action - The specific action or operation to be performed by this step,
 *                                      derived from `node.data.action`.
 * @property {object} returns.parameters - An object containing key-value pairs of parameters required for the step's execution,
 *                                         derived from `node.data.parameters`. Defaults to an empty object.
 * @property {boolean} returns.continueOnError - A flag indicating whether the workflow should continue execution
 *                                               to subsequent steps even if this step encounters an error.
 *                                               Derived from `node.data.continueOnError`. Defaults to `false`.
 * @property {Array<string>} returns.dependsOn - An array of strings, where each string represents a dependency.
 *                                                A dependency can be a `stepId` or `stepId.handle` if a specific
 *                                                output handle is referenced. This array dictates the execution order
 *                                                and data flow dependencies.
 * @property {number} returns.order - The topological order of the step within the compiled workflow, starting from 1.
 * @property {object} returns.metadata - Additional metadata about the step, not directly used for execution logic.
 * @property {object} returns.metadata.layout - Layout-specific metadata.
 * @property {object} returns.metadata.layout.position - The x, y coordinates of the node in the React Flow layout,
 *                                                      useful for re-rendering or debugging the visual flow.
 */
function compileLayoutToSteps(nodes, edges = []) {
  // First validate layout schema
  const validationReport = validateLayoutSchema(nodes, edges);
  if (!validationReport.valid) {
    throw new Error(`Cannot compile invalid visual layout: ${validationReport.errors.join('; ')}`);
  }

  // Create a map for O(1) node lookup by ID, improving node.find(n => n.id === nodeId) from O(N) to O(1)
  const nodeMap = new Map(nodes.map(node => [node.id, node]));

  // Topological sorting using Kahn's algorithm
  const adjList = new Map();
  const inDegree = new Map();
  nodes.forEach(node => {
    adjList.set(node.id, []);
    inDegree.set(node.id, 0);
  });
  edges.forEach(edge => {
    // Ensure source and target nodes exist before adding to adjList/inDegree
    if (adjList.has(edge.source) && adjList.has(edge.target)) {
      adjList.get(edge.source).push(edge.target);
      inDegree.set(edge.target, inDegree.get(edge.target) + 1);
    }
  });

  const queue = [];
  inDegree.forEach((deg, nodeId) => {
    if (deg === 0) queue.push(nodeId);
  });

  const sortedNodeIds = [];
  while (queue.length > 0) {
    const node = queue.shift();
    sortedNodeIds.push(node);
    const neighbors = adjList.get(node) || [];
    neighbors.forEach(neighbor => {
      inDegree.set(neighbor, inDegree.get(neighbor) - 1);
      if (inDegree.get(neighbor) === 0) queue.push(neighbor);
    });
  }

  // Map edge connections to compile dependsOn arrays
  // For each node, find all edges targeting it
  const incomingEdgesMap = new Map();
  nodes.forEach(node => {
    incomingEdgesMap.set(node.id, []);
  });
  edges.forEach(edge => {
    if (incomingEdgesMap.has(edge.target)) {
      incomingEdgesMap.get(edge.target).push(edge);
    }
  });

  // Build steps in topologically sorted order
  const steps = sortedNodeIds.map((nodeId, index) => {
    // Use nodeMap for O(1) lookup
    const node = nodeMap.get(nodeId);
    const incomingEdges = incomingEdgesMap.get(nodeId) || [];

    // Map incoming edges to dependsOn dependencies
    const dependsOn = incomingEdges.map(edge => {
      if (edge.sourceHandle && edge.sourceHandle.trim() !== '') {
        return `${edge.source}.${edge.sourceHandle.trim()}`;
      }
      return edge.source;
    });

    return {
      stepId: node.id,
      stepType: node.data?.stepType || node.type || 'action',
      app: node.data?.app || node.data?.application || node.type,
      action: node.data?.action,
      parameters: node.data?.parameters || {},
      continueOnError: node.data?.continueOnError || false,
      dependsOn: [...new Set(dependsOn)], // Deduplicated list of dependencies
      order: index + 1,
      metadata: {
        layout: {
          position: node.position || { x: 0, y: 0 }
        }
      }
    };
  });

  return steps;
}

/**
 * @typedef {object} WorkflowLayoutService
 * @property {function(Array<object>, Array<object>): object} validateLayoutSchema - Validates the schema of React Flow nodes and edges for a workflow layout.
 * @property {function(Array<object>, Array<object>): Array<object>} compileLayoutToSteps - Compiles visual React Flow nodes and edges into executable steps for the backend.
 */

/**
 * Service module for managing and processing workflow layouts.
 * Provides functionalities for validating the structural integrity of React Flow diagrams
 * and compiling them into a backend-executable format.
 * @type {WorkflowLayoutService}
 */
export const workflowLayoutService = {
  validateLayoutSchema,
  compileLayoutToSteps
};