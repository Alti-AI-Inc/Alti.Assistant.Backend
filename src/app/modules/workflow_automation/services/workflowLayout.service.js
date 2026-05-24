import { logger } from '../../../../shared/logger.js';

/**
 * Validates the schema of React Flow nodes and edges.
 * Checks for cycles, deadlocks, and disconnected nodes.
 * 
 * @param {Array} nodes - React Flow node objects
 * @param {Array} edges - React Flow edge objects
 * @returns {object} Validation report containing validity, errors, and warnings.
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

  // 1. Validate basic node properties & unique IDs
  const nodeIds = new Set();
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
  const adjList = new Map();
  const inDegree = new Map();

  // Initialize
  nodes.forEach(node => {
    adjList.set(node.id, []);
    inDegree.set(node.id, 0);
  });

  // Build adjacency list (source -> targets) and calculate in-degree
  edges.forEach(edge => {
    // Only add if source and target are not the same (self-loop prevention)
    if (edge.source === edge.target) {
      errors.push(`Self-loop detected on node '${edge.source}'.`);
      return;
    }
    adjList.get(edge.source).push(edge.target);
    inDegree.set(edge.target, inDegree.get(edge.target) + 1);
  });

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // Kahn's algorithm
  const queue = [];
  inDegree.forEach((deg, nodeId) => {
    if (deg === 0) {
      queue.push(nodeId);
    }
  });

  const sortedList = [];
  while (queue.length > 0) {
    const node = queue.shift();
    sortedList.push(node);

    const neighbors = adjList.get(node) || [];
    neighbors.forEach(neighbor => {
      inDegree.set(neighbor, inDegree.get(neighbor) - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    });
  }

  // If sorted list length is less than nodes length, there's a cycle!
  if (sortedList.length < nodes.length) {
    errors.push('Cyclic dependency detected: the workflow contains a closed feedback loop.');
  }

  // 4. Identify disconnected and unreachable nodes/subgraphs
  if (nodes.length > 1) {
    // A node is completely disconnected if it has no incoming and no outgoing edges
    nodes.forEach(node => {
      const incomingCount = edges.filter(e => e.target === node.id).length;
      const outgoingCount = edges.filter(e => e.source === node.id).length;
      const isTrigger = node.type === 'trigger' || (node.data && node.data.stepType === 'trigger') || incomingCount === 0;
      
      if (incomingCount === 0 && outgoingCount === 0 && !isTrigger) {
        warnings.push(`Node '${node.id}' is completely disconnected from the rest of the workflow.`);
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
      const targets = edges.filter(e => e.source === nodeId).map(e => e.target);
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
 * Compiles visual React Flow nodes and edges into executable steps for the backend database.
 * Also performs validation prior to compiling.
 * 
 * @param {Array} nodes - React Flow node objects
 * @param {Array} edges - React Flow edge objects
 * @returns {Array} Compiled execution steps array.
 */
function compileLayoutToSteps(nodes, edges = []) {
  // First validate layout schema
  const validationReport = validateLayoutSchema(nodes, edges);
  if (!validationReport.valid) {
    throw new Error(`Cannot compile invalid visual layout: ${validationReport.errors.join('; ')}`);
  }

  // Topological sorting using Kahn's algorithm
  const adjList = new Map();
  const inDegree = new Map();
  nodes.forEach(node => {
    adjList.set(node.id, []);
    inDegree.set(node.id, 0);
  });
  edges.forEach(edge => {
    adjList.get(edge.source).push(edge.target);
    inDegree.set(edge.target, inDegree.get(edge.target) + 1);
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
    const node = nodes.find(n => n.id === nodeId);
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

export const workflowLayoutService = {
  validateLayoutSchema,
  compileLayoutToSteps
};
