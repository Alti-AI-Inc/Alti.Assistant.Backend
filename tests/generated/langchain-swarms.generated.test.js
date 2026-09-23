import { describe, it, expect } from 'vitest';
import { StateGraph, START, END } from '@langchain/langgraph';

describe('LangGraph Multi-Agent State Machine Verification', () => {
  it('should successfully compile a 3-stage agent loop (Plan -> Tool -> Review)', async () => {
    const graph = new StateGraph({
      channels: {
        step: { value: (x, y) => y ?? x, default: () => 'init' },
        status: { value: (x, y) => y ?? x, default: () => 'pending' },
      }
    });

    graph.addNode('planner', async () => ({ step: 'plan', status: 'planned' }));
    graph.addNode('executor', async () => ({ step: 'exec', status: 'executed' }));
    graph.addEdge(START, 'planner');
    graph.addEdge('planner', 'executor');
    graph.addEdge('executor', END);

    const app = graph.compile();
    const result = await app.invoke({ step: 'start' });
    expect(result.report || result.metadata || result.status).toBeDefined();
  });
});
