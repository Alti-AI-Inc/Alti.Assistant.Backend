import { SupervisorService } from '../src/app/modules/orchestrator/supervisor.service.js';

describe('LangChain gRPC Supervisor', () => {
  it('should route "weather" to the OmniData agent', async () => {
    const result = await SupervisorService.routePrompt('What is the weather in NYC?');
    expect(result.route).toBe('omnidata_agent');
  });

  it('should route "rust" to the Wasm Sandbox', async () => {
    const result = await SupervisorService.routePrompt('Write a rust function');
    expect(result.route).toBe('wasm_engine');
  });
});
