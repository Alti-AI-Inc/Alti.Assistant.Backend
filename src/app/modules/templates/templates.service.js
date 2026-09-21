import Template from './templates.model.js';
import { logger } from '../../../shared/logger.js';

const listTemplates = async ({ page = 1, limit = 10, category, search, tags, sort }) => {
  const query = {};

  if (category) {
    query.category = category;
  }

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
  }

  if (tags) {
    const tagsArray = Array.isArray(tags) ? tags : tags.split(',');
    query.tags = { $in: tagsArray };
  }

  let sortQuery = {};
  if (sort === 'popular') {
    sortQuery = { usageCount: -1 };
  } else if (sort === 'rating') {
    sortQuery = { 'rating.average': -1, 'rating.count': -1 };
  } else if (sort === 'newest') {
    sortQuery = { createdAt: -1 };
  } else {
    sortQuery = { createdAt: -1 };
  }

  const skip = (page - 1) * limit;

  const templates = await Template.find(query).sort(sortQuery).skip(skip).limit(parseInt(limit));
  const total = await Template.countDocuments(query);

  return {
    meta: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / limit),
    },
    data: templates,
  };
};

const getTemplate = async (templateId) => {
  const template = await Template.findById(templateId);
  if (!template) {
    throw new Error('Template not found');
  }
  return template;
};

const deployTemplate = async (userId, templateId, overrides = {}) => {
  const template = await getTemplate(templateId);
  
  // Dynamically import AgentService
  const { AgentService } = await import('../agents/agents.service.js');
  
  const mergedAgentConfig = {
    ...template.agentConfig,
    ...overrides,
    name: overrides.name || template.name,
    description: overrides.description || template.description,
    createdBy: userId
  };

  const agent = await AgentService.createAgent(mergedAgentConfig);

  let workflow = null;
  if (template.workflowConfig) {
    const { WorkflowService } = await import('../workflows/workflows.service.js');
    workflow = await WorkflowService.createWorkflow({
      ...template.workflowConfig,
      agentId: agent._id,
      createdBy: userId,
    });
  }

  let triggers = null;
  if (template.triggerConfigs && template.triggerConfigs.length > 0) {
    const { TriggerService } = await import('../triggers/triggers.service.js');
    triggers = await Promise.all(template.triggerConfigs.map(async (triggerConfig) => {
      return await TriggerService.createTrigger({
        ...triggerConfig,
        agentId: agent._id,
        workflowId: workflow ? workflow._id : null,
        createdBy: userId,
      });
    }));
  }

  template.usageCount += 1;
  await template.save();

  return { agent, workflow, triggers };
};

const publishTemplate = async (userId, agentId) => {
  const { AgentService } = await import('../agents/agents.service.js');
  const agent = await AgentService.getAgent(agentId);
  
  if (agent.createdBy.toString() !== userId.toString()) {
    throw new Error('Unauthorized to publish this agent');
  }

  const templateData = {
    name: agent.name,
    description: agent.description || 'Published agent template',
    category: 'custom',
    agentConfig: {
      instructions: agent.instructions,
      model: agent.model,
      tools: agent.tools,
      knowledgeBases: agent.knowledgeBases,
      swarmConfig: agent.swarmConfig,
      humanApproval: agent.humanApproval,
    },
    createdBy: userId,
    isOfficial: false,
    isPublic: true,
  };

  const template = await Template.create(templateData);
  return template;
};

const updateTemplate = async (templateId, updates) => {
  const template = await Template.findByIdAndUpdate(templateId, updates, { new: true, runValidators: true });
  if (!template) {
    throw new Error('Template not found');
  }
  return template;
};

const deleteTemplate = async (templateId) => {
  const template = await Template.findByIdAndDelete(templateId);
  if (!template) {
    throw new Error('Template not found');
  }
  return template;
};

const rateTemplate = async (userId, templateId, score) => {
  const template = await getTemplate(templateId);
  
  if (score < 1 || score > 5) {
    throw new Error('Score must be between 1 and 5');
  }

  const currentAverage = template.rating.average;
  const currentCount = template.rating.count;

  const newCount = currentCount + 1;
  const newAverage = currentAverage + (score - currentAverage) / newCount;

  template.rating.average = newAverage;
  template.rating.count = newCount;
  
  await template.save();
  return template;
};

const seedOfficialTemplates = async () => {
  try {
    const existingCount = await Template.countDocuments({ isOfficial: true });
    if (existingCount === 0) {
      const templates = [
        {
          name: 'Email Triage Assistant',
          description: 'Triages and organizes incoming emails.',
          category: 'productivity',
          agentConfig: {
            instructions: 'You are an email triage assistant...',
            model: 'gpt-oss-20b',
            tools: ['GMAIL_FETCH_EMAILS', 'GMAIL_SEND_EMAIL'],
          },
          isOfficial: true,
        },
        {
          name: 'Research Agent',
          description: 'Conducts deep research using Exa.',
          category: 'research',
          agentConfig: {
            instructions: 'You are a research agent...',
            model: 'gpt-oss-120b',
            tools: [],
          },
          isOfficial: true,
        },
        {
          name: 'Customer Support Bot',
          description: 'Answers customer queries based on docs.',
          category: 'support',
          agentConfig: {
            instructions: 'You are a customer support bot...',
            model: 'gpt-oss-120b',
            tools: [],
          },
          isOfficial: true,
        },
        {
          name: 'Sales Outreach',
          description: 'Drafts and sends sales emails.',
          category: 'sales',
          agentConfig: {
            instructions: 'You are a sales outreach assistant...',
            model: 'gpt-oss-120b',
            tools: ['GMAIL_SEND_EMAIL'],
          },
          isOfficial: true,
        },
        {
          name: 'Meeting Scheduler',
          description: 'Finds free slots and schedules meetings.',
          category: 'productivity',
          agentConfig: {
            instructions: 'You are a meeting scheduler...',
            model: 'gpt-oss-20b',
            tools: ['GOOGLECALENDAR_FIND_FREE_SLOTS', 'GOOGLECALENDAR_CREATE_EVENT'],
          },
          isOfficial: true,
        }
      ];
      
      await Template.insertMany(templates);
      logger.info('Official templates seeded successfully');
    }
  } catch (error) {
    logger.error('Error seeding templates:', error);
  }
};

export const TemplateService = {
  listTemplates,
  getTemplate,
  deployTemplate,
  publishTemplate,
  updateTemplate,
  deleteTemplate,
  rateTemplate,
  seedOfficialTemplates,
};
