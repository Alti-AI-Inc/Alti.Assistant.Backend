import { describe, it, expect } from 'vitest';

// ─── Queue Service ──────────────────────────────────────────────────

describe('Queue Service (BullMQ)', () => {
  it('should export QueueService with required methods', async () => {
    const { QueueService } = await import('../../src/app/services/queue.service.js');
    expect(QueueService).toBeDefined();
    expect(typeof QueueService.getQueue).toBe('function');
    expect(typeof QueueService.addJob).toBe('function');
    expect(typeof QueueService.registerWorker).toBe('function');
    expect(typeof QueueService.getJobStatus).toBe('function');
    expect(typeof QueueService.getQueueMetrics).toBe('function');
    expect(typeof QueueService.shutdown).toBe('function');
  });
});

// ─── Memory Service ─────────────────────────────────────────────────

describe('Memory Service (Mem0)', () => {
  it('should export MemoryService with required methods', async () => {
    const { MemoryService } = await import('../../src/app/services/memory.service.js');
    expect(MemoryService).toBeDefined();
    expect(typeof MemoryService.addMemory).toBe('function');
    expect(typeof MemoryService.searchMemories).toBe('function');
    expect(typeof MemoryService.getMemories).toBe('function');
    expect(typeof MemoryService.deleteMemories).toBe('function');
    expect(typeof MemoryService.buildMemoryContext).toBe('function');
  });

  it('should use fallback store when Mem0 is unavailable', async () => {
    const { MemoryService } = await import('../../src/app/services/memory.service.js');

    // Add a memory
    const result = await MemoryService.addMemory('test-user', 'test-agent', 'Hello world');
    expect(result).toBeDefined();

    // Search for it
    const memories = await MemoryService.searchMemories('test-user', 'test-agent', 'hello');
    expect(Array.isArray(memories)).toBe(true);

    // Build context
    const context = await MemoryService.buildMemoryContext('test-user', 'test-agent', 'hello');
    expect(typeof context).toBe('string');

    // Delete
    const deleted = await MemoryService.deleteMemories('test-user', 'test-agent');
    expect(deleted.deleted).toBe(true);
  });
});

// ─── Scheduler Service ──────────────────────────────────────────────

describe('Scheduler Service (node-cron + cron-parser)', () => {
  it('should export SchedulerService with required methods', async () => {
    const { SchedulerService } = await import('../../src/app/services/scheduler.service.js');
    expect(SchedulerService).toBeDefined();
    expect(typeof SchedulerService.validateCron).toBe('function');
    expect(typeof SchedulerService.getNextRuns).toBe('function');
    expect(typeof SchedulerService.scheduleTrigger).toBe('function');
    expect(typeof SchedulerService.unscheduleTrigger).toBe('function');
    expect(typeof SchedulerService.getScheduledJobs).toBe('function');
    expect(typeof SchedulerService.stopAll).toBe('function');
  });

  it('should validate correct cron expressions', async () => {
    const { SchedulerService } = await import('../../src/app/services/scheduler.service.js');
    const result = await SchedulerService.validateCron('0 9 * * 1-5');
    expect(result.valid).toBe(true);
    expect(result.nextRun).toBeDefined();
  });

  it('should reject invalid cron expressions', async () => {
    const { SchedulerService } = await import('../../src/app/services/scheduler.service.js');
    const result = await SchedulerService.validateCron('invalid cron');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should compute next run times', async () => {
    const { SchedulerService } = await import('../../src/app/services/scheduler.service.js');
    const runs = await SchedulerService.getNextRuns('*/5 * * * *', 3);
    expect(runs.length).toBe(3);
  });
});

// ─── Telemetry Service ──────────────────────────────────────────────

describe('Telemetry Service (OpenTelemetry)', () => {
  it('should export TelemetryService with required methods', async () => {
    const { TelemetryService } = await import('../../src/app/services/telemetry.service.js');
    expect(TelemetryService).toBeDefined();
    expect(typeof TelemetryService.getTracer).toBe('function');
    expect(typeof TelemetryService.startSpan).toBe('function');
    expect(typeof TelemetryService.traceLLMCall).toBe('function');
    expect(typeof TelemetryService.traceToolCall).toBe('function');
    expect(typeof TelemetryService.traceRAGQuery).toBe('function');
    expect(typeof TelemetryService.getContextInfo).toBe('function');
    expect(typeof TelemetryService.initSDK).toBe('function');
  });

  it('should return no-op span when OTel is not configured', async () => {
    const { TelemetryService } = await import('../../src/app/services/telemetry.service.js');
    const spanHelper = await TelemetryService.startSpan('test-span');
    expect(spanHelper).toBeDefined();
    expect(typeof spanHelper.end).toBe('function');
    expect(typeof spanHelper.setAttributes).toBe('function');
    // Should not throw
    spanHelper.setAttributes({ test: true });
    spanHelper.end();
  });
});

// ─── Package Integration Verification ───────────────────────────────

describe('Package Integration', () => {
  it('should have handlebars available', async () => {
    const Handlebars = await import('handlebars');
    const hbs = Handlebars.default || Handlebars;
    const template = hbs.compile('Hello {{name}}!');
    expect(template({ name: 'World' })).toBe('Hello World!');
  });

  it('should have p-queue available', async () => {
    const pq = await import('p-queue');
    const PQueue = pq.default;
    const queue = new PQueue({ concurrency: 2 });
    expect(queue).toBeDefined();
    expect(typeof queue.add).toBe('function');
  });

  it('should have p-limit available', async () => {
    const pl = await import('p-limit');
    const pLimit = pl.default;
    const limit = pLimit(2);
    expect(typeof limit).toBe('function');
  });

  it('should have sharp available', async () => {
    const sharp = await import('sharp');
    expect(sharp.default || sharp).toBeDefined();
  });

  it('should have cron-parser available', async () => {
    const parser = await import('cron-parser');
    const CronExpressionParser = parser.CronExpressionParser;
    const interval = CronExpressionParser.parse('*/5 * * * *');
    expect(interval.next()).toBeDefined();
  });

  it('should have @opentelemetry/api available', async () => {
    const api = await import('@opentelemetry/api');
    expect(api.trace).toBeDefined();
    expect(api.context).toBeDefined();
  });

  it('should have bullmq available', async () => {
    const bullmq = await import('bullmq');
    expect(bullmq.Queue).toBeDefined();
    expect(bullmq.Worker).toBeDefined();
  });
});

// ─── Zero GCP in new services ───────────────────────────────────────

describe('Zero GCP in new services', () => {
  const serviceFiles = [
    '../../src/app/services/queue.service.js',
    '../../src/app/services/memory.service.js',
    '../../src/app/services/scheduler.service.js',
    '../../src/app/services/telemetry.service.js',
  ];

  it('should not contain any GCP references', async () => {
    const fs = await import('fs');
    const path = await import('path');

    for (const filePath of serviceFiles) {
      const resolved = path.resolve(import.meta.dirname, filePath);
      const content = fs.readFileSync(resolved, 'utf-8');
      expect(content).not.toContain('@google-cloud');
      expect(content).not.toContain('googleapis');
      expect(content).not.toContain('firebase');
    }
  });
});
