import { describe, it, expect, beforeEach, vi } from 'vitest';
import { workflowLayoutService } from './workflowLayout.service.js';

// Mock the logger dependency
vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('workflowLayoutService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateLayoutSchema', () => {
    it('should return valid: false and an error if nodes is not an array', () => {
      const result = workflowLayoutService.validateLayoutSchema(null, []);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Nodes must be an array.');
    });

    it('should return valid: false and an error if edges is not an array', () => {
      const result = workflowLayoutService.validateLayoutSchema([], null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Edges must be an array.');
    });

    it('should return valid: true for empty nodes and edges', () => {
      const result = workflowLayoutService.validateLayoutSchema([], []);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should return valid: false and an error for an invalid node object', () => {
      const nodes = [null];
      const result = workflowLayoutService.validateLayoutSchema(nodes, []);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Node at index 0 is invalid.');
    });

    it('should return valid: false and an error if a node is missing an id', () => {
      const nodes = [{ type: 'action' }];
      const result = workflowLayoutService.validateLayoutSchema(nodes, []);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Node at index 0 is missing a unique 'id' field.");
    });

    it('should return valid: false and an error for duplicate node IDs', () => {
      const nodes = [{ id: 'node1' }, { id: 'node1' }];
      const result = workflowLayoutService.validateLayoutSchema(nodes, []);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Duplicate node ID detected: 'node1'.");
    });

    it('should return valid: false and an error if node.data.parameters is not an object', () => {
      const nodes = [{ id: 'node1', data: { parameters: 'invalid' } }];
      const result = workflowLayoutService.validateLayoutSchema(nodes, []);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Node 'node1' contains invalid 'parameters' property (must be an object).");
    });

    it('should return valid: false and an error for an invalid edge object', () => {
      const nodes = [{ id: 'node1' }];
      const edges = [null];
      const result = workflowLayoutService.validateLayoutSchema(nodes, edges);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Edge at index 0 is invalid.');
    });

    it('should return valid: false and an error if an edge is missing source or target', () => {
      const nodes = [{ id: 'node1' }, { id: 'node2' }];
      const edges = [{ source: 'node1' }];
      const result = workflowLayoutService.validateLayoutSchema(nodes, edges);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Edge at index 0 is missing required 'source' or 'target' field.");
    });

    it('should return valid: false and an error if an edge references a non-existent source node', () => {
      const nodes = [{ id: 'node1' }];
      const edges = [{ source: 'node_nonexistent', target: 'node1' }];
      const result = workflowLayoutService.validateLayoutSchema(nodes, edges);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Edge references non-existent source node: 'node_nonexistent'.");
    });

    it('should return valid: false and an error if an edge references a non-existent target node', () => {
      const nodes = [{ id: 'node1' }];
      const edges = [{ source: 'node1', target: 'node_nonexistent' }];
      const result = workflowLayoutService.validateLayoutSchema(nodes, edges);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Edge references non-existent target node: 'node_nonexistent'.");
    });

    it('should return valid: false and an error for a self-loop', () => {
      const nodes = [{ id: 'node1' }];
      const edges = [{ source: 'node1', target: 'node1' }];
      const result = workflowLayoutService.validateLayoutSchema(nodes, edges);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Self-loop detected on node 'node1'.");
    });

    it('should return valid: false and an error for a cyclic dependency', () => {
      const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
      const edges = [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'C' },
        { source: 'C', target: 'A' },
      ];
      const result = workflowLayoutService.validateLayoutSchema(nodes, edges);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Cyclic dependency detected: the workflow contains a closed feedback loop.');
    });

    it('should return a warning for a completely disconnected non-trigger node', () => {
      const nodes = [
        { id: 'trigger1', type: 'trigger' },
        { id: 'action1', type: 'action' },
      ];
      const result = workflowLayoutService.validateLayoutSchema(nodes, []);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toContain(
        "Node 'action1' is completely disconnected from the rest of the workflow and is not an explicit trigger."
      );
    });

    it('should NOT return a warning for a completely disconnected trigger node', () => {
      const nodes = [{ id: 'trigger1', type: 'trigger' }];
      const result = workflowLayoutService.validateLayoutSchema(nodes, []);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should return a warning for an unreachable node', () => {
      const nodes = [
        { id: 'trigger1', type: 'trigger' },
        { id: 'action1', type: 'action' },
        { id: 'action2', type: 'action' },
      ];
      const edges = [{ source: 'trigger1', target: 'action1' }];
      const result = workflowLayoutService.validateLayoutSchema(nodes, edges);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toContain("Node 'action2' is unreachable from any trigger and will never execute.");
    });

    it('should return valid: true for a simple linear workflow', () => {
      const nodes = [
        { id: 'trigger1', type: 'trigger' },
        { id: 'action1', type: 'action' },
        { id: 'action2', type: 'action' },
      ];
      const edges = [
        { source: 'trigger1', target: 'action1' },
        { source: 'action1', target: 'action2' },
      ];
      const result = workflowLayoutService.validateLayoutSchema(nodes, edges);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should handle multiple trigger nodes correctly', () => {
      const nodes = [
        { id: 'trigger1', type: 'trigger' },
        { id: 'trigger2', type: 'trigger' },
        { id: 'action1', type: 'action' },
        { id: 'action2', type: 'action' },
      ];
      const edges = [
        { source: 'trigger1', target: 'action1' },
        { source: 'trigger2', target: 'action2' },
      ];
      const result = workflowLayoutService.validateLayoutSchema(nodes, edges);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should return valid: true for a complex valid workflow', () => {
      const nodes = [
        { id: 'start', type: 'trigger' },
        { id: 'stepA', type: 'action', data: { parameters: { key: 'value' } } },
        { id: 'stepB', type: 'action' },
        { id: 'stepC', type: 'action' },
        { id: 'end', type: 'action' },
      ];
      const edges = [
        { source: 'start', target: 'stepA' },
        { source: 'stepA', target: 'stepB' },
        { source: 'stepA', target: 'stepC' },
        { source: 'stepB', target: 'end' },
        { source: 'stepC', target: 'end' },
      ];
      const result = workflowLayoutService.validateLayoutSchema(nodes, edges);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should return warnings for both disconnected and unreachable nodes', () => {
      const nodes = [
        { id: 'trigger1', type: 'trigger' },
        { id: 'action1', type: 'action' }, // reachable
        { id: 'action2', type: 'action' }, // unreachable
        { id: 'action3', type: 'action' }, // disconnected
      ];
      const edges = [{ source: 'trigger1', target: 'action1' }];
      const result = workflowLayoutService.validateLayoutSchema(nodes, edges);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings).toContain("Node 'action2' is unreachable from any trigger and will never execute.");
      expect(result.warnings).toContain(
        "Node 'action3' is completely disconnected from the rest of the workflow and is not an explicit trigger."
      );
    });
  });

  describe('compileLayoutToSteps', () => {
    it('should throw an error if the layout schema is invalid', () => {
      const nodes = [{ id: 'node1' }, { id: 'node1' }]; // Duplicate ID, invalid
      expect(() => workflowLayoutService.compileLayoutToSteps(nodes, [])).toThrow(
        'Cannot compile invalid visual layout: Duplicate node ID detected: \'node1\'.'
      );
    });

    it('should return an empty array for empty nodes and edges', () => {
      const result = workflowLayoutService.compileLayoutToSteps([], []);
      expect(result).toEqual([]);
    });

    it('should compile a single trigger node correctly', () => {
      const nodes = [{ id: 'trigger1', type: 'trigger', position: { x: 10, y: 20 } }];
      const result = workflowLayoutService.compileLayoutToSteps(nodes, []);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        stepId: 'trigger1',
        stepType: 'trigger',
        app: 'trigger',
        action: undefined,
        parameters: {},
        continueOnError: false,
        dependsOn: [],
        order: 1,
        metadata: { layout: { position: { x: 10, y: 20 } } },
      });
    });

    it('should compile a single action node correctly (will have warnings from validateLayoutSchema, but still compiles)', () => {
      const nodes = [{ id: 'action1', type: 'action', position: { x: 10, y: 20 } }];
      const result = workflowLayoutService.compileLayoutToSteps(nodes, []);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        stepId: 'action1',
        stepType: 'action',
        app: 'action',
        action: undefined,
        parameters: {},
        continueOnError: false,
        dependsOn: [],
        order: 1,
        metadata: { layout: { position: { x: 10, y: 20 } } },
      });
    });

    it('should compile a linear workflow with correct topological order and dependencies', () => {
      const nodes = [
        { id: 'A', type: 'trigger', position: { x: 0, y: 0 } },
        { id: 'B', type: 'action', position: { x: 1, y: 1 } },
        { id: 'C', type: 'action', position: { x: 2, y: 2 } },
      ];
      const edges = [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'C' },
      ];
      const result = workflowLayoutService.compileLayoutToSteps(nodes, edges);
      expect(result).toHaveLength(3);
      expect(result[0].stepId).toBe('A');
      expect(result[0].dependsOn).toEqual([]);
      expect(result[0].order).toBe(1);

      expect(result[1].stepId).toBe('B');
      expect(result[1].dependsOn).toEqual(['A']);
      expect(result[1].order).toBe(2);

      expect(result[2].stepId).toBe('C');
      expect(result[2].dependsOn).toEqual(['B']);
      expect(result[2].order).toBe(3);
    });

    it('should compile a branching workflow with correct dependencies', () => {
      const nodes = [
        { id: 'A', type: 'trigger' },
        { id: 'B', type: 'action' },
        { id: 'C', type: 'action' },
      ];
      const edges = [
        { source: 'A', target: 'B' },
        { source: 'A', target: 'C' },
      ];
      const result = workflowLayoutService.compileLayoutToSteps(nodes, edges);
      expect(result).toHaveLength(3);
      const nodeA = result.find((s) => s.stepId === 'A');
      const nodeB = result.find((s) => s.stepId === 'B');
      const nodeC = result.find((s) => s.stepId === 'C');

      expect(nodeA.dependsOn).toEqual([]);
      expect(nodeA.order).toBe(1);
      expect(nodeB.dependsOn).toEqual(['A']);
      expect(nodeB.order).toBeGreaterThan(nodeA.order);
      expect(nodeC.dependsOn).toEqual(['A']);
      expect(nodeC.order).toBeGreaterThan(nodeA.order);
    });

    it('should compile a merging workflow with correct dependencies', () => {
      const nodes = [
        { id: 'A', type: 'trigger' },
        { id: 'B', type: 'trigger' },
        { id: 'C', type: 'action' },
      ];
      const edges = [
        { source: 'A', target: 'C' },
        { source: 'B', target: 'C' },
      ];
      const result = workflowLayoutService.compileLayoutToSteps(nodes, edges);
      expect(result).toHaveLength(3);
      const nodeA = result.find((s) => s.stepId === 'A');
      const nodeB = result.find((s) => s.stepId === 'B');
      const nodeC = result.find((s) => s.stepId === 'C');

      expect(nodeA.dependsOn).toEqual([]);
      expect(nodeB.dependsOn).toEqual([]);
      expect(nodeC.dependsOn).toEqual(expect.arrayContaining(['A', 'B']));
      expect(nodeC.dependsOn).toHaveLength(2);
      expect(nodeC.order).toBeGreaterThan(nodeA.order);
      expect(nodeC.order).toBeGreaterThan(nodeB.order);
    });

    it('should correctly map all node properties to step properties', () => {
      const nodes = [
        {
          id: 'node1',
          type: 'customType',
          data: {
            stepType: 'customStep',
            app: 'myApp',
            action: 'doSomething',
            parameters: { input: 'value' },
            continueOnError: true,
            application: 'shouldBeOverriddenByApp', // Should be ignored if 'app' is present
          },
          position: { x: 100, y: 200 },
        },
      ];
      const result = workflowLayoutService.compileLayoutToSteps(nodes, []);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        stepId: 'node1',
        stepType: 'customStep',
        app: 'myApp',
        action: 'doSomething',
        parameters: { input: 'value' },
        continueOnError: true,
        dependsOn: [],
        order: 1,
        metadata: { layout: { position: { x: 100, y: 200 } } },
      });
    });

    it('should use default values for missing data properties', () => {
      const nodes = [{ id: 'node1', type: 'defaultType', position: { x: 0, y: 0 } }];
      const result = workflowLayoutService.compileLayoutToSteps(nodes, []);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        stepId: 'node1',
        stepType: 'defaultType', // Falls back to node.type
        app: 'defaultType', // Falls back to node.type
        action: undefined,
        parameters: {}, // Defaults to empty object
        continueOnError: false, // Defaults to false
        dependsOn: [],
        order: 1,
        metadata: { layout: { position: { x: 0, y: 0 } } },
      });
    });

    it('should prioritize node.data.application if node.data.app is missing', () => {
      const nodes = [
        {
          id: 'node1',
          type: 'defaultType',
          data: {
            application: 'myOldApp',
          },
        },
      ];
      const result = workflowLayoutService.compileLayoutToSteps(nodes, []);
      expect(result).toHaveLength(1);
      expect(result[0].app).toBe('myOldApp');
    });

    it('should correctly handle dependsOn with sourceHandle and deduplicate', () => {
      const nodes = [
        { id: 'A', type: 'trigger' },
        { id: 'B', type: 'action' },
      ];
      const edges = [
        { source: 'A', target: 'B' },
        { source: 'A', target: 'B', sourceHandle: 'output1' },
        { source: 'A', target: 'B', sourceHandle: 'output1' }, // Duplicate
      ];
      const result = workflowLayoutService.compileLayoutToSteps(nodes, edges);
      expect(result).toHaveLength(2);
      const nodeB = result.find((s) => s.stepId === 'B');
      expect(nodeB.dependsOn).toEqual(expect.arrayContaining(['A', 'A.output1']));
      expect(nodeB.dependsOn).toHaveLength(2); // Should be deduplicated
    });

    it('should handle empty sourceHandle gracefully', () => {
      const nodes = [
        { id: 'A', type: 'trigger' },
        { id: 'B', type: 'action' },
      ];
      const edges = [{ source: 'A', target: 'B', sourceHandle: ' ' }]; // Empty string handle
      const result = workflowLayoutService.compileLayoutToSteps(nodes, edges);
      expect(result).toHaveLength(2);
      const nodeB = result.find((s) => s.stepId === 'B');
      expect(nodeB.dependsOn).toEqual(['A']); // Should not include 'A.'
    });

    it('should handle a complex workflow with multiple dependencies and properties', () => {
      const nodes = [
        { id: 'start', type: 'trigger', position: { x: 0, y: 0 } },
        {
          id: 'fetchData',
          type: 'action',
          data: { app: 'api', action: 'get', parameters: { url: '...' } },
          position: { x: 100, y: 0 },
        },
        {
          id: 'processData',
          type: 'action',
          data: { stepType: 'processor', app: 'data', action: 'transform', continueOnError: true },
          position: { x: 200, y: 0 },
        },
        {
          id: 'saveResult',
          type: 'action',
          data: { app: 'db', action: 'insert' },
          position: { x: 300, y: 0 },
        },
      ];
      const edges = [
        { source: 'start', target: 'fetchData' },
        { source: 'fetchData', target: 'processData', sourceHandle: 'success' },
        { source: 'processData', target: 'saveResult' },
      ];

      const result = workflowLayoutService.compileLayoutToSteps(nodes, edges);
      expect(result).toHaveLength(4);

      const startStep = result.find((s) => s.stepId === 'start');
      expect(startStep).toEqual({
        stepId: 'start',
        stepType: 'trigger',
        app: 'trigger',
        action: undefined,
        parameters: {},
        continueOnError: false,
        dependsOn: [],
        order: 1,
        metadata: { layout: { position: { x: 0, y: 0 } } },
      });

      const fetchStep = result.find((s) => s.stepId === 'fetchData');
      expect(fetchStep).toEqual({
        stepId: 'fetchData',
        stepType: 'action',
        app: 'api',
        action: 'get',
        parameters: { url: '...' },
        continueOnError: false,
        dependsOn: ['start'],
        order: 2,
        metadata: { layout: { position: { x: 100, y: 0 } } },
      });

      const processStep = result.find((s) => s.stepId === 'processData');
      expect(processStep).toEqual({
        stepId: 'processData',
        stepType: 'processor',
        app: 'data',
        action: 'transform',
        parameters: {},
        continueOnError: true,
        dependsOn: ['fetchData.success'],
        order: 3,
        metadata: { layout: { position: { x: 200, y: 0 } } },
      });

      const saveStep = result.find((s) => s.stepId === 'saveResult');
      expect(saveStep).toEqual({
        stepId: 'saveResult',
        stepType: 'action',
        app: 'db',
        action: 'insert',
        parameters: {},
        continueOnError: false,
        dependsOn: ['processData'],
        order: 4,
        metadata: { layout: { position: { x: 300, y: 0 } } },
      });
    });
  });
});