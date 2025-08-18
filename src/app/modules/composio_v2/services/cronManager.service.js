import cron from 'node-cron';
import { logger } from '../../../../shared/logger.js';
import ScheduledWorkflow from '../models/scheduledWorkflow.model.js';
import { workflowExecutor } from './workflowExecutor.service.js';

/**
 * Cron Manager Service - Handles scheduling and execution of workflows
 */
class CronManager {
  constructor() {
    this.activeCronJobs = new Map(); // Map<workflowId, cronJob>
    this.isInitialized = false;
  }

  /**
   * Initialize the cron manager
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('CronManager already initialized');
      return;
    }

    try {
      logger.info('Initializing CronManager...');

      // Load existing active workflows and set up their cron jobs
      await this.loadActiveWorkflows();

      // Set up a cleanup job to run every hour
      this.setupCleanupJob();

      // Set up a health check job
      this.setupHealthCheckJob();

      this.isInitialized = true;
      logger.info('CronManager initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize CronManager:', error);
      throw error;
    }
  }

  /**
   * Schedule a workflow for execution
   */
  async scheduleWorkflow(workflow) {
    try {
      const { workflowId, scheduleConfig } = workflow;

      // Remove existing cron job if any
      await this.unscheduleWorkflow(workflowId);

      if (!scheduleConfig.isActive) {
        logger.info(`Workflow ${workflowId} is inactive, not scheduling`);
        return { success: true, message: 'Workflow is inactive' };
      }

      let cronExpression;
      let description;

      // Determine cron expression based on trigger type
      if (workflow.triggerType === 'scheduled') {
        // One-time scheduled execution
        if (!scheduleConfig.triggerDate) {
          throw new Error('Trigger date is required for scheduled workflows');
        }

        const triggerTime = new Date(scheduleConfig.triggerDate);
        if (triggerTime <= new Date()) {
          throw new Error('Trigger date must be in the future');
        }

        // Convert to cron expression for the specific date/time
        cronExpression = this.dateTimeToCron(triggerTime);
        description = `One-time execution at ${triggerTime.toISOString()}`;

      } else if (workflow.triggerType === 'recurring') {
        // Recurring scheduled execution
        if (!scheduleConfig.cronExpression) {
          throw new Error('Cron expression is required for recurring workflows');
        }

        cronExpression = scheduleConfig.cronExpression;
        description = `Recurring execution: ${cronExpression}`;

      } else {
        // Manual trigger workflows don't need cron scheduling
        return { success: true, message: 'Manual trigger workflow, no scheduling needed' };
      }

      // Validate cron expression
      if (!cron.validate(cronExpression)) {
        throw new Error(`Invalid cron expression: ${cronExpression}`);
      }

      // Create and start the cron job
      const cronJob = cron.schedule(cronExpression, async () => {
        await this.executeCronJob(workflowId);
      }, {
        scheduled: true,
        timezone: scheduleConfig.timezone || 'UTC'
      });

      // Store the cron job
      this.activeCronJobs.set(workflowId, {
        job: cronJob,
        cronExpression,
        description,
        createdAt: new Date()
      });

      // Update next execution time in database
      const nextExecution = this.getNextExecutionTime(cronExpression, scheduleConfig.timezone);
      await ScheduledWorkflow.updateOne(
        { workflowId },
        { nextExecution }
      );

      logger.info(`Workflow ${workflowId} scheduled: ${description}`);

      return {
        success: true,
        message: 'Workflow scheduled successfully',
        data: {
          cronExpression,
          description,
          nextExecution
        }
      };

    } catch (error) {
      logger.error(`Failed to schedule workflow ${workflow.workflowId}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Unschedule a workflow
   */
  async unscheduleWorkflow(workflowId) {
    try {
      const cronJobData = this.activeCronJobs.get(workflowId);
      
      if (cronJobData) {
        cronJobData.job.stop();
        cronJobData.job.destroy();
        this.activeCronJobs.delete(workflowId);
        
        logger.info(`Workflow ${workflowId} unscheduled`);
      }

      // Clear next execution time in database
      await ScheduledWorkflow.updateOne(
        { workflowId },
        { nextExecution: null }
      );

      return { success: true };

    } catch (error) {
      logger.error(`Failed to unschedule workflow ${workflowId}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Reschedule a workflow (update existing schedule)
   */
  async rescheduleWorkflow(workflow) {
    try {
      // First unschedule, then schedule again
      await this.unscheduleWorkflow(workflow.workflowId);
      return await this.scheduleWorkflow(workflow);

    } catch (error) {
      logger.error(`Failed to reschedule workflow ${workflow.workflowId}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute a cron job
   */
  async executeCronJob(workflowId) {
    try {
      logger.info(`Executing cron job for workflow: ${workflowId}`);

      // Get workflow from database
      const workflow = await ScheduledWorkflow.findOne({ workflowId });
      
      if (!workflow) {
        logger.error(`Workflow not found: ${workflowId}`);
        this.unscheduleWorkflow(workflowId); // Clean up orphaned cron job
        return;
      }

      if (!workflow.scheduleConfig.isActive) {
        logger.info(`Workflow ${workflowId} is inactive, skipping execution`);
        return;
      }

      // Execute the workflow
      const executionResult = await workflowExecutor.executeWorkflow(workflow, 'scheduled', 'cron_job');

      // Handle one-time scheduled workflows
      if (workflow.triggerType === 'scheduled') {
        // Mark as completed and unschedule
        await workflow.updateOne({ 
          status: 'completed',
          'scheduleConfig.isActive': false 
        });
        await this.unscheduleWorkflow(workflowId);
        
        logger.info(`One-time scheduled workflow ${workflowId} completed and unscheduled`);
      } else {
        // For recurring workflows, update next execution time
        const nextExecution = this.getNextExecutionTime(
          workflow.scheduleConfig.cronExpression, 
          workflow.scheduleConfig.timezone
        );
        
        await workflow.updateOne({ nextExecution });
      }

      logger.info(`Cron job execution completed for workflow: ${workflowId}`);

    } catch (error) {
      logger.error(`Error executing cron job for workflow ${workflowId}:`, error);
    }
  }

  /**
   * Load and schedule all active workflows from database
   */
  async loadActiveWorkflows() {
    try {
      const activeWorkflows = await ScheduledWorkflow.find({
        status: 'active',
        'scheduleConfig.isActive': true,
        triggerType: { $in: ['scheduled', 'recurring'] }
      });

      logger.info(`Loading ${activeWorkflows.length} active workflows`);

      for (const workflow of activeWorkflows) {
        await this.scheduleWorkflow(workflow);
      }

      logger.info(`Loaded and scheduled ${activeWorkflows.length} workflows`);

    } catch (error) {
      logger.error('Failed to load active workflows:', error);
    }
  }

  /**
   * Set up cleanup job to remove completed one-time workflows
   */
  setupCleanupJob() {
    // Run cleanup every hour
    cron.schedule('0 * * * *', async () => {
      try {
        logger.info('Running workflow cleanup job');

        // Find completed one-time workflows older than 24 hours
        const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const completedWorkflows = await ScheduledWorkflow.find({
          triggerType: 'scheduled',
          status: 'completed',
          updatedAt: { $lt: cutoffDate }
        });

        for (const workflow of completedWorkflows) {
          // Ensure cron job is removed
          await this.unscheduleWorkflow(workflow.workflowId);
        }

        logger.info(`Cleanup completed: processed ${completedWorkflows.length} completed workflows`);

      } catch (error) {
        logger.error('Error in cleanup job:', error);
      }
    }, {
      timezone: 'UTC'
    });

    logger.info('Cleanup job scheduled');
  }

  /**
   * Set up health check job
   */
  setupHealthCheckJob() {
    // Health check every 5 minutes
    cron.schedule('*/5 * * * *', () => {
      const activeJobsCount = this.activeCronJobs.size;
      logger.debug(`CronManager health check: ${activeJobsCount} active jobs`);
    }, {
      timezone: 'UTC'
    });

    logger.info('Health check job scheduled');
  }

  /**
   * Convert DateTime to cron expression for one-time execution
   */
  dateTimeToCron(dateTime) {
    const date = new Date(dateTime);
    
    const minute = date.getMinutes();
    const hour = date.getHours();
    const day = date.getDate();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed
    
    // For one-time execution: specific minute, hour, day, month, any day of week
    return `${minute} ${hour} ${day} ${month} *`;
  }

  /**
   * Get next execution time for a cron expression
   */
  getNextExecutionTime(cronExpression, timezone = 'UTC') {
    try {
      // This is a simplified implementation
      // In production, you might want to use a library like 'cron-parser'
      const now = new Date();
      
      // For demo purposes, add 1 hour to current time
      // Real implementation would parse the cron expression
      return new Date(now.getTime() + 60 * 60 * 1000);
      
    } catch (error) {
      logger.error('Error calculating next execution time:', error);
      return null;
    }
  }

  /**
   * Get status of all active cron jobs
   */
  getStatus() {
    const jobs = Array.from(this.activeCronJobs.entries()).map(([workflowId, jobData]) => ({
      workflowId,
      cronExpression: jobData.cronExpression,
      description: jobData.description,
      createdAt: jobData.createdAt,
      isRunning: jobData.job.running
    }));

    return {
      isInitialized: this.isInitialized,
      activeJobsCount: this.activeCronJobs.size,
      jobs
    };
  }

  /**
   * Stop all cron jobs (for graceful shutdown)
   */
  async shutdown() {
    try {
      logger.info('Shutting down CronManager...');

      for (const [workflowId, jobData] of this.activeCronJobs) {
        jobData.job.stop();
        jobData.job.destroy();
      }

      this.activeCronJobs.clear();
      this.isInitialized = false;

      logger.info('CronManager shutdown completed');

    } catch (error) {
      logger.error('Error during CronManager shutdown:', error);
    }
  }

  /**
   * Manually trigger a scheduled workflow
   */
  async triggerScheduledWorkflow(workflowId) {
    try {
      const workflow = await ScheduledWorkflow.findOne({ workflowId });
      
      if (!workflow) {
        return {
          success: false,
          error: 'Workflow not found'
        };
      }

      // Execute the workflow manually
      const executionResult = await workflowExecutor.executeWorkflow(workflow, 'manual', 'user_trigger');

      return {
        success: true,
        data: executionResult,
        message: 'Workflow triggered successfully'
      };

    } catch (error) {
      logger.error(`Error triggering scheduled workflow ${workflowId}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Export singleton instance
export const cronManager = new CronManager();
export default cronManager;
