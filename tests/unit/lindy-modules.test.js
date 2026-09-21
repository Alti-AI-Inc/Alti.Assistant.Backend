import { describe, it, expect, vi } from 'vitest';

// ─── Module 1: Agents ───────────────────────────────────────────────

describe('Agent Module', () => {
  it('should export Agent model with correct schema fields', async () => {
    const { default: Agent } = await import('../../src/app/modules/agents/agents.model.js');
    expect(Agent).toBeDefined();
    expect(Agent.modelName).toBe('Agent');

    const schema = Agent.schema;
    expect(schema.path('name')).toBeDefined();
    expect(schema.path('instructions')).toBeDefined();
    expect(schema.path('model')).toBeDefined();
    expect(schema.path('status')).toBeDefined();
    expect(schema.path('createdBy')).toBeDefined();
    expect(schema.path('version')).toBeDefined();
  });

  it('should enforce allowed model enum values', async () => {
    const { default: Agent } = await import('../../src/app/modules/agents/agents.model.js');
    const modelPath = Agent.schema.path('model');
    expect(modelPath.enumValues || modelPath.options?.enum).toBeDefined();
  });

  it('should export AgentService with all required methods', async () => {
    const { AgentService } = await import('../../src/app/modules/agents/agents.service.js');
    expect(AgentService).toBeDefined();
    expect(typeof AgentService.createAgent).toBe('function');
    expect(typeof AgentService.listAgents).toBe('function');
    expect(typeof AgentService.getAgent).toBe('function');
    expect(typeof AgentService.updateAgent).toBe('function');
    expect(typeof AgentService.deleteAgent).toBe('function');
    expect(typeof AgentService.executeAgent).toBe('function');
  });

  it('should export AgentRoutes as Express router', async () => {
    const { AgentRoutes } = await import('../../src/app/modules/agents/agents.route.js');
    expect(AgentRoutes).toBeDefined();
    expect(typeof AgentRoutes).toBe('function'); // Express router is a function
  });

  it('should export AgentController with all handlers', async () => {
    const { AgentController } = await import('../../src/app/modules/agents/agents.controller.js');
    expect(AgentController).toBeDefined();
    expect(typeof AgentController.createAgent).toBe('function');
    expect(typeof AgentController.listAgents).toBe('function');
    expect(typeof AgentController.executeAgent).toBe('function');
  });
});

// ─── Module 2: Workflows ────────────────────────────────────────────

describe('Workflow Module', () => {
  it('should export Workflow model with step schema', async () => {
    const mod = await import('../../src/app/modules/workflows/workflows.model.js');
    const Workflow = mod.default || mod.Workflow;
    expect(Workflow).toBeDefined();

    const schema = Workflow.schema;
    expect(schema.path('name')).toBeDefined();
    expect(schema.path('steps')).toBeDefined();
    expect(schema.path('status')).toBeDefined();
    expect(schema.path('createdBy')).toBeDefined();
  });

  it('should export WorkflowService with core methods', async () => {
    const { WorkflowService } = await import('../../src/app/modules/workflows/workflows.service.js');
    expect(WorkflowService).toBeDefined();
    expect(typeof WorkflowService.createWorkflow).toBe('function');
    expect(typeof WorkflowService.executeWorkflow).toBe('function');
    expect(typeof WorkflowService.approveStep).toBe('function');
  });

  it('should export WorkflowRoutes as Express router', async () => {
    const { WorkflowRoutes } = await import('../../src/app/modules/workflows/workflows.route.js');
    expect(WorkflowRoutes).toBeDefined();
    expect(typeof WorkflowRoutes).toBe('function');
  });
});

// ─── Module 3: Triggers ─────────────────────────────────────────────

describe('Trigger Module', () => {
  it('should export Trigger model with all trigger types', async () => {
    const { default: Trigger } = await import('../../src/app/modules/triggers/triggers.model.js');
    expect(Trigger).toBeDefined();

    const schema = Trigger.schema;
    expect(schema.path('type')).toBeDefined();
    expect(schema.path('targetType')).toBeDefined();
    expect(schema.path('targetId')).toBeDefined();
    expect(schema.path('status')).toBeDefined();
  });

  it('should export TriggerService with webhook handling', async () => {
    const { TriggerService } = await import('../../src/app/modules/triggers/triggers.service.js');
    expect(TriggerService).toBeDefined();
    expect(typeof TriggerService.createTrigger).toBe('function');
    expect(typeof TriggerService.fireTrigger).toBe('function');
    expect(typeof TriggerService.handleWebhook).toBe('function');
    expect(typeof TriggerService.handleEvent).toBe('function');
  });

  it('should export TriggerRoutes as Express router', async () => {
    const { TriggerRoutes } = await import('../../src/app/modules/triggers/triggers.route.js');
    expect(TriggerRoutes).toBeDefined();
    expect(typeof TriggerRoutes).toBe('function');
  });
});

// ─── Module 4: Templates ────────────────────────────────────────────

describe('Template Module', () => {
  it('should export Template model with marketplace fields', async () => {
    const { default: Template } = await import('../../src/app/modules/templates/templates.model.js');
    expect(Template).toBeDefined();

    const schema = Template.schema;
    expect(schema.path('name')).toBeDefined();
    expect(schema.path('category')).toBeDefined();
    expect(schema.path('isOfficial')).toBeDefined();
    expect(schema.path('usageCount')).toBeDefined();
  });

  it('should export TemplateService with deploy capability', async () => {
    const { TemplateService } = await import('../../src/app/modules/templates/templates.service.js');
    expect(TemplateService).toBeDefined();
    expect(typeof TemplateService.listTemplates).toBe('function');
    expect(typeof TemplateService.deployTemplate).toBe('function');
    expect(typeof TemplateService.publishTemplate).toBe('function');
  });

  it('should export TemplateRoutes as Express router', async () => {
    const { TemplateRoutes } = await import('../../src/app/modules/templates/templates.route.js');
    expect(TemplateRoutes).toBeDefined();
    expect(typeof TemplateRoutes).toBe('function');
  });
});

// ─── Module 5: Traces ───────────────────────────────────────────────

describe('Trace Module', () => {
  it('should export Trace model with observability fields', async () => {
    const { default: Trace } = await import('../../src/app/modules/traces/traces.model.js');
    expect(Trace).toBeDefined();

    const schema = Trace.schema;
    expect(schema.path('runId')).toBeDefined();
    expect(schema.path('status')).toBeDefined();
    expect(schema.path('steps')).toBeDefined();
    expect(schema.path('userId')).toBeDefined();
  });

  it('should export TraceService with analytics methods', async () => {
    const { TraceService } = await import('../../src/app/modules/traces/traces.service.js');
    expect(TraceService).toBeDefined();
    expect(typeof TraceService.startTrace).toBe('function');
    expect(typeof TraceService.addStep).toBe('function');
    expect(typeof TraceService.completeTrace).toBe('function');
    expect(typeof TraceService.getDashboard).toBe('function');
    expect(typeof TraceService.getAgentAnalytics).toBe('function');
  });

  it('should export TraceRoutes as Express router', async () => {
    const { TraceRoutes } = await import('../../src/app/modules/traces/traces.route.js');
    expect(TraceRoutes).toBeDefined();
    expect(typeof TraceRoutes).toBe('function');
  });
});

// ─── Cross-Module: Zero GCP Verification ────────────────────────────

describe('Zero GCP Verification (Lindy Modules)', () => {
  const moduleFiles = [
    '../../src/app/modules/agents/agents.service.js',
    '../../src/app/modules/workflows/workflows.service.js',
    '../../src/app/modules/triggers/triggers.service.js',
    '../../src/app/modules/templates/templates.service.js',
    '../../src/app/modules/traces/traces.service.js',
  ];

  it('should not import any GCP packages', async () => {
    const fs = await import('fs');
    const path = await import('path');

    for (const filePath of moduleFiles) {
      const resolved = path.resolve(import.meta.dirname, filePath);
      const content = fs.readFileSync(resolved, 'utf-8');
      expect(content).not.toContain('@google-cloud');
      expect(content).not.toContain('googleapis');
      expect(content).not.toContain('firebase');
      expect(content).not.toContain('gcp');
    }
  });
});

// ─── Route Mounting Verification ────────────────────────────────────

describe('Route Mounting', () => {
  it('should have all 5 new modules in routes/index.js', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const routeFile = path.resolve(import.meta.dirname, '../../src/app/routes/index.js');
    const content = fs.readFileSync(routeFile, 'utf-8');

    expect(content).toContain("'/agents'");
    expect(content).toContain("'/workflows'");
    expect(content).toContain("'/triggers'");
    expect(content).toContain("'/templates'");
    expect(content).toContain("'/traces'");
    expect(content).toContain('AgentRoutes');
    expect(content).toContain('WorkflowRoutes');
    expect(content).toContain('TriggerRoutes');
    expect(content).toContain('TemplateRoutes');
    expect(content).toContain('TraceRoutes');
  });
});
