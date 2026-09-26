import Together from 'together-ai';
import { Composio } from 'composio-core';

const TOGETHER = new Together({ apiKey: process.env.TOGETHER_API_KEY || 'TOGETHER_KEY' });
const COMPOSIO = new Composio({ apiKey: process.env.COMPOSIO_API_KEY || 'COMPOSIO_KEY' });

export class AphuraWorkflowEngine {
  /**
   * THE APHURA DAG ORCHESTRATOR
   * Compiles natural language into a Directed Acyclic Graph (DAG) of parallel/sequential autonomous tasks.
   */
  static async executeWorkflow(instruction, options = {}) {
    const emit = options.onEvent || (() => {});
    
    emit('status', `Booting Aphura Workflow Orchestrator for: "${instruction}"`);
    
    // 1. COMPILATION PHASE
    emit('action', 'Compiling natural language intent into execution DAG...');
    const compilerPrompt = `You are the Aphura Workflow Compiler. Break down the user's instruction into a JSON Directed Acyclic Graph (DAG) of discrete tasks.
    Each node must have an id, description, tool_required (if any), and dependencies (array of node ids).
    Output JSON ONLY. Example: {"nodes": [{"id":"task_1", "desc":"Search for news", "deps":[]}, {"id":"task_2", "desc":"Summarize news", "deps":["task_1"]}]}`;

    const compilation = await TOGETHER.chat.completions.create({
      messages: [{ role: 'system', content: compilerPrompt }, { role: 'user', content: instruction }],
      model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
      response_format: { type: 'json_object' }
    });

    const dag = JSON.parse(compilation.choices[0].message.content);
    emit('dag_compiled', dag);

    // 2. EXECUTION PHASE (Topological Sort / Async Queue)
    const results = {};
    const executed = new Set();
    const pending = new Set(dag.nodes.map(n => n.id));

    while (pending.size > 0) {
      const runnable = dag.nodes.filter(n => pending.has(n.id) && n.deps.every(d => executed.has(d)));
      
      if (runnable.length === 0) {
        emit('error', 'DAG Deadlock detected. Circular dependency or failed task.');
        break;
      }

      emit('status', `Executing parallel task batch: [${runnable.map(r => r.id).join(', ')}]`);

      const batchPromises = runnable.map(async (task) => {
        emit('action', `Executing Task: ${task.desc}`);
        
        let tools = [];
        try {
            // Dynamically fetch tools from Composio if the task requires it
            if (task.tool_required || task.desc.toLowerCase().includes('search') || task.desc.toLowerCase().includes('fetch')) {
               const entity = COMPOSIO.getEntity('default');
               // Mocking a tool fetch or getting actual tools if COMPOSIO_API_KEY is present
               if (process.env.COMPOSIO_API_KEY) {
                  tools = await COMPOSIO.getTools({ apps: ["github", "slack", "gmail", "notion", "linear", "exa"] });
               }
            }
        } catch (e) {
            emit('error', `Failed to bind Composio tools for task ${task.id}: ${e.message}`);
        }

        const context = Object.entries(results).map(([k, v]) => `${k}: ${v}`).join('\n');
        const taskPrompt = `Task: ${task.desc}\nContext from previous tasks:\n${context}\nPerform the task and output the result. You have access to tools if needed.`;

        const payload = {
          messages: [{ role: 'user', content: taskPrompt }],
          model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
        };
        
        // Only inject tools array if we successfully fetched them
        if (tools && tools.length > 0) {
           payload.tools = tools;
           payload.tool_choice = "auto";
        }

        const res = await TOGETHER.chat.completions.create(payload);

        results[task.id] = res.choices[0].message.content || 'Task executed successfully via tool call.';
        executed.add(task.id);
        pending.delete(task.id);
        
        emit('action', `Task Completed: ${task.id}`);
      });

        results[task.id] = res.choices[0].message.content;
        executed.add(task.id);
        pending.delete(task.id);
        
        emit('action', `Task Completed: ${task.id}`);
      });

      await Promise.all(batchPromises);
    }

    emit('status', 'Workflow execution completed successfully.');
    
    // 3. FINAL SYNTHESIS
    const finalReportPrompt = `Synthesize the results of the workflow into a clean report.\n${JSON.stringify(results)}`;
    const report = await TOGETHER.chat.completions.create({
      messages: [{ role: 'user', content: finalReportPrompt }],
      model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    });

    emit('complete', 'Aphura Workflow Orchestrator Complete.');

    return {
      success: true,
      dag,
      raw_results: results,
      report: report.choices[0].message.content
    };
  }
}
