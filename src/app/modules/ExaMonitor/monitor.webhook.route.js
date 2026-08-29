import express from 'express';
import { Monitor } from './Monitor.model.js';
import { MonitorRun } from './monitorRun.model.js';
import { verifyExaWebhookSignature } from './monitor.webhook.js';

const router = express.Router();

const getMonitorId = (eventType, data) =>
  eventType.startsWith('monitor.run.')
    ? data.monitorId || data.monitor_id
    : data.id || data.monitorId || data.monitor_id;

const normalizeRun = (data) => ({
  status: data.status,
  output: data.output,
  failReason: data.failReason || data.fail_reason,
  startedAt: data.startedAt || data.started_at,
  completedAt: data.completedAt || data.completed_at,
  failedAt: data.failedAt || data.failed_at,
  cancelledAt: data.cancelledAt || data.cancelled_at,
  durationMs: data.durationMs || data.duration_ms,
  exaCreatedAt: data.createdAt || data.created_at,
  exaUpdatedAt: data.updatedAt || data.updated_at,
});

router.post(
  '/',
  express.raw({ type: 'application/json', limit: '2mb' }),
  async (req, res, next) => {
    try {
      const rawBody = req.body?.toString('utf8');
      if (!rawBody) {
        return res
          .status(400)
          .json({ success: false, message: 'Raw request body is required' });
      }

      let event;
      try {
        event = JSON.parse(rawBody);
      } catch {
        return res
          .status(400)
          .json({ success: false, message: 'Invalid JSON payload' });
      }

      const eventType = event.type || event.eventType;
      const data = event.data;
      const exaMonitorId = data && getMonitorId(eventType || '', data);
      if (!eventType || !data || !exaMonitorId) {
        return res
          .status(400)
          .json({ success: false, message: 'Invalid Exa monitor event' });
      }

      const monitor = await Monitor.findOne({ exaMonitorId }).select(
        '+webhookSecret'
      );
      if (
        !monitor ||
        !verifyExaWebhookSignature(
          rawBody,
          req.get('Exa-Signature'),
          monitor.webhookSecret
        )
      ) {
        return res
          .status(401)
          .json({ success: false, message: 'Invalid webhook signature' });
      }

      if (eventType === 'monitor.deleted') {
        await MonitorRun.deleteMany({ monitor: monitor._id });
        await monitor.deleteOne();
      } else if (
        eventType === 'monitor.updated' ||
        eventType === 'monitor.created'
      ) {
        const fields = [
          'name',
          'status',
          'search',
          'trigger',
          'outputSchema',
          'metadata',
          'webhook',
          'nextRunAt',
        ];
        const update = Object.fromEntries(
          fields
            .filter((field) => data[field] !== undefined)
            .map((field) => [field, data[field]])
        );
        update.exaUpdatedAt = data.updatedAt || data.updated_at || new Date();
        update.lastSyncedAt = new Date();
        await Monitor.updateOne({ _id: monitor._id }, { $set: update });
      } else if (eventType.startsWith('monitor.run.')) {
        const exaRunId = data.id || data.runId || data.run_id;
        if (!exaRunId) {
          return res
            .status(400)
            .json({ success: false, message: 'Monitor run id is required' });
        }

        await MonitorRun.findOneAndUpdate(
          { monitor: monitor._id, exaRunId },
          {
            $set: {
              ...normalizeRun(data),
              space: monitor.space,
              monitor: monitor._id,
              exaRunId,
            },
          },
          { upsert: true, new: true, runValidators: true }
        );
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      return next(error);
    }
  }
);

export const MonitorWebhookRoutes = router;
export default router;
