import crypto from 'crypto';
import Handlebars from 'handlebars';
import { logger } from '../../../shared/logger.js';
import { SchedulerService } from '../../services/scheduler.service.js';
import Trigger from './triggers.model.js';
import httpStatus from 'http-status';

const createTrigger = async (userId, config) => {
  const triggerData = { ...config, createdBy: userId };

  if (config.type === 'cron') {
    if (!config.cronExpression) {
      throw new Error('cronExpression is required for cron type');
    }
    // Validate with cron-parser
    const validation = await SchedulerService.validateCron(config.cronExpression);
    if (!validation.valid) {
      throw new Error(`Invalid cron expression: ${validation.error}`);
    }
  } else if (config.type === 'webhook') {
    triggerData.webhookId = crypto.randomUUID();
    triggerData.webhookSecret = crypto.randomBytes(32).toString('hex');
  } else if (config.type === 'event') {
    if (!config.eventSource) {
      throw new Error('eventSource is required for event type');
    }
  }

  const trigger = await Trigger.create(triggerData);

  // Register cron job if active
  if (trigger.type === 'cron' && trigger.status === 'active') {
    await SchedulerService.scheduleTrigger(
      trigger._id.toString(),
      trigger.cronExpression,
      async (triggerId) => {
        await fireTrigger(triggerId, { source: 'cron', scheduledAt: new Date().toISOString() });
      }
    );
  }

  return trigger;
};

const listTriggers = async (userId, { page = 1, limit = 10, type, status }) => {
  const query = { createdBy: userId };
  if (type) query.type = type;
  if (status) query.status = status;

  const skip = (page - 1) * limit;
  const triggers = await Trigger.find(query).skip(skip).limit(Number(limit));
  const total = await Trigger.countDocuments(query);

  return {
    data: triggers,
    meta: {
      page: Number(page),
      limit: Number(limit),
      total,
    },
  };
};

const getTrigger = async (triggerId) => {
  const trigger = await Trigger.findById(triggerId);
  if (!trigger) throw new Error('Trigger not found');
  return trigger;
};

const updateTrigger = async (triggerId, updates) => {
  const trigger = await Trigger.findByIdAndUpdate(triggerId, updates, { new: true });
  if (!trigger) throw new Error('Trigger not found');
  return trigger;
};

const deleteTrigger = async (triggerId) => {
  const trigger = await Trigger.findByIdAndDelete(triggerId);
  if (!trigger) throw new Error('Trigger not found');
  return trigger;
};

const updateStatus = async (triggerId, status) => {
  const trigger = await Trigger.findByIdAndUpdate(triggerId, { status }, { new: true });
  if (!trigger) throw new Error('Trigger not found');
  return trigger;
};

const fireTrigger = async (triggerId, payload) => {
  const trigger = await Trigger.findById(triggerId);
  if (!trigger) throw new Error('Trigger not found');
  if (trigger.status !== 'active') throw new Error('Trigger is not active');

  // Handlebars template rendering (MIT license)
  let transformedPayload = payload;
  if (trigger.inputTemplate) {
    try {
        const template = Handlebars.compile(trigger.inputTemplate);
        const rendered = template(payload);
        transformedPayload = JSON.parse(rendered);
    } catch (e) {
        logger.warn(`Failed to render Handlebars template: ${e.message}`);
        transformedPayload = payload; // fallback
    }
  }

  let result;
  if (trigger.targetType === 'agent') {
    // dynamically import
    const { AgentService } = await import('../agents/agents.service.js');
    result = await AgentService.executeAgent(trigger.targetId, transformedPayload);
  } else if (trigger.targetType === 'workflow') {
    const { WorkflowService } = await import('../workflows/workflows.service.js');
    result = await WorkflowService.executeWorkflow(trigger.targetId, transformedPayload);
  }

  trigger.lastFiredAt = new Date();
  trigger.fireCount += 1;
  await trigger.save();

  return result;
};

const testFire = async (triggerId) => {
  return fireTrigger(triggerId, { test: true, timestamp: new Date() });
};

const handleWebhook = async (webhookId, payload, signature) => {
  const trigger = await Trigger.findOne({ webhookId, type: 'webhook' });
  if (!trigger) throw new Error('Webhook trigger not found');

  // Verify HMAC signature
  if (trigger.webhookSecret && signature) {
    const expectedSignature = crypto
      .createHmac('sha256', trigger.webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');
    
    // Check if signature matches expected (allowing for standard sha256= prefix if used)
    if (signature !== expectedSignature && signature !== `sha256=${expectedSignature}`) {
       throw new Error('Invalid webhook signature');
    }
  }

  return fireTrigger(trigger._id, payload);
};

const handleEvent = async (eventSource, payload) => {
  const triggers = await Trigger.find({ eventSource, type: 'event', status: 'active' });
  
  const results = await Promise.allSettled(
    triggers.map(trigger => fireTrigger(trigger._id, payload))
  );

  return results;
};

const getActiveCronTriggers = async () => {
  return Trigger.find({ type: 'cron', status: 'active' });
};

export const TriggerService = {
  createTrigger,
  listTriggers,
  getTrigger,
  updateTrigger,
  deleteTrigger,
  updateStatus,
  testFire,
  fireTrigger,
  handleWebhook,
  handleEvent,
  getActiveCronTriggers,
};
