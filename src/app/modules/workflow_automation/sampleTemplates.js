import WorkflowTemplate from './models/workflowTemplate.model.js';
import { logger } from '../../../shared/logger.js';

/**
 * Sample workflow templates to help users get started
 */
const sampleTemplates = [
  {
    name: "Daily Stock Price Email",
    description: "Get daily stock price updates via email",
    category: "finance",
    tags: ["stocks", "email", "daily"],
    difficulty: "beginner",
    steps: [
      {
        stepId: "get_stock_price",
        stepType: "action",
        description: "Fetch current stock price",
        app: "finance_api",
        action: "get_stock_price",
        parameters: {
          symbol: "{{stock_symbol}}",
          metrics: ["price", "change", "volume"]
        },
        order: 1
      },
      {
        stepId: "send_email",
        stepType: "action",
        description: "Send stock update email",
        app: "gmail",
        action: "send_email",
        parameters: {
          to: "{{user_email}}",
          subject: "Daily {{stock_symbol}} Stock Update",
          body: "Current price: ${{get_stock_price_result.price}}\nChange: {{get_stock_price_result.change}}"
        },
        order: 2
      }
    ],
    triggerTypes: ["schedule"],
    requiredApps: ["finance_api", "gmail"],
    examples: [
      {
        prompt: "Send me daily Apple stock updates to my email",
        description: "Daily AAPL stock price notifications"
      },
      {
        prompt: "Email me Tesla stock price every morning at 9 AM",
        description: "Scheduled Tesla stock updates"
      }
    ]
  },
  {
    name: "Social Media Cross-Posting",
    description: "Post content across multiple social media platforms",
    category: "social",
    tags: ["social", "posting", "automation"],
    difficulty: "intermediate",
    steps: [
      {
        stepId: "post_twitter",
        stepType: "action",
        description: "Post to Twitter/X",
        app: "twitter",
        action: "create_tweet",
        parameters: {
          text: "{{post_content}}"
        },
        order: 1
      },
      {
        stepId: "post_linkedin",
        stepType: "action",
        description: "Post to LinkedIn",
        app: "linkedin",
        action: "create_post",
        parameters: {
          text: "{{post_content}}"
        },
        order: 2
      },
      {
        stepId: "post_facebook",
        stepType: "action",
        description: "Post to Facebook",
        app: "facebook",
        action: "create_post",
        parameters: {
          message: "{{post_content}}"
        },
        order: 3
      }
    ],
    triggerTypes: ["manual", "webhook"],
    requiredApps: ["twitter", "linkedin", "facebook"],
    examples: [
      {
        prompt: "Post my blog articles to Twitter, LinkedIn and Facebook",
        description: "Cross-platform content distribution"
      }
    ]
  },
  {
    name: "Weekly Expense Report",
    description: "Generate and email weekly expense summaries",
    category: "productivity",
    tags: ["expenses", "reporting", "weekly"],
    difficulty: "intermediate",
    steps: [
      {
        stepId: "fetch_expenses",
        stepType: "action",
        description: "Get weekly expenses",
        app: "expense_tracker",
        action: "get_expenses",
        parameters: {
          date_range: "last_7_days",
          categories: "all"
        },
        order: 1
      },
      {
        stepId: "generate_report",
        stepType: "action",
        description: "Create expense report",
        app: "reporting",
        action: "create_summary",
        parameters: {
          data: "{{fetch_expenses_result}}",
          format: "table"
        },
        order: 2
      },
      {
        stepId: "email_report",
        stepType: "action",
        description: "Email the report",
        app: "gmail",
        action: "send_email",
        parameters: {
          to: "{{user_email}}",
          subject: "Weekly Expense Report - {{current_date}}",
          body: "{{generate_report_result}}"
        },
        order: 3
      }
    ],
    triggerTypes: ["schedule"],
    requiredApps: ["expense_tracker", "gmail"],
    examples: [
      {
        prompt: "Send me a weekly summary of my expenses every Sunday",
        description: "Automated expense reporting"
      }
    ]
  },
  {
    name: "Task Reminder System",
    description: "Set up automated reminders for important tasks",
    category: "productivity",
    tags: ["reminders", "tasks", "notifications"],
    difficulty: "beginner",
    steps: [
      {
        stepId: "check_due_tasks",
        stepType: "action",
        description: "Check for upcoming due tasks",
        app: "task_manager",
        action: "get_due_tasks",
        parameters: {
          due_within: "24_hours"
        },
        order: 1
      },
      {
        stepId: "send_reminder",
        stepType: "condition",
        description: "Send reminder if tasks found",
        app: "notification",
        action: "send_notification",
        parameters: {
          message: "You have {{check_due_tasks_result.count}} tasks due soon",
          details: "{{check_due_tasks_result.tasks}}"
        },
        conditions: {
          if: "{{check_due_tasks_result.count}} > 0"
        },
        order: 2
      }
    ],
    triggerTypes: ["schedule"],
    requiredApps: ["task_manager", "notification"],
    examples: [
      {
        prompt: "Remind me daily about tasks that are due tomorrow",
        description: "Daily task due date reminders"
      }
    ]
  }
];

/**
 * Create sample templates in the database
 */
export const createSampleTemplates = async () => {
  try {
    logger.info('Creating sample workflow templates...');

    for (const templateData of sampleTemplates) {
      const existingTemplate = await WorkflowTemplate.findOne({
        name: templateData.name
      });

      if (!existingTemplate) {
        const template = new WorkflowTemplate(templateData);
        await template.save();
        logger.info(`Created template: ${templateData.name}`);
      } else {
        logger.info(`Template already exists: ${templateData.name}`);
      }
    }

    logger.info('Sample templates creation completed');

  } catch (error) {
    logger.error('Error creating sample templates:', error);
    throw error;
  }
};