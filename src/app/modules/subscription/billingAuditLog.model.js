import mongoose from 'mongoose';

const BillingAuditLogSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        'upgrade',
        'cancel',
        'seat_add',
        'seat_remove',
        'billing_portal',
        'webhook_failed',
        'dispute_created',
        'dispute_closed',
        'outage_detected',
      ],
    },
    previousState: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    newState: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    ipAddress: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const BillingAuditLog = mongoose.model('BillingAuditLog', BillingAuditLogSchema);
export default BillingAuditLog;
