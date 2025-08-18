import mongoose from "mongoose";

const WorkflowExecutionSchema = new mongoose.Schema({
  // Execution identification
  executionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  workflowId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Execution metadata
  executionType: {
    type: String,
    enum: ['manual', 'scheduled', 'retry'],
    required: true
  },
  triggerSource: {
    type: String,
    enum: ['user_click', 'cron_job', 'api_call', 'retry_mechanism'],
    required: true
  },
  
  // Timing information
  executionStartTime: {
    type: Date,
    required: true,
    default: Date.now
  },
  executionEndTime: {
    type: Date
  },
  executionDuration: {
    type: Number, // in milliseconds
    default: 0
  },
  
  // Execution status and progress
  status: {
    type: String,
    enum: ['queued', 'running', 'completed', 'failed', 'cancelled', 'timeout'],
    default: 'queued'
  },
  currentStep: {
    type: Number,
    default: 0
  },
  totalSteps: {
    type: Number,
    required: true
  },
  completedSteps: {
    type: Number,
    default: 0
  },
  
  // Step execution details
  stepResults: [{
    step: {
      type: Number,
      required: true
    },
    app: {
      type: String,
      required: true
    },
    action: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed', 'skipped'],
      required: true
    },
    startTime: {
      type: Date
    },
    endTime: {
      type: Date
    },
    duration: {
      type: Number // in milliseconds
    },
    parameters: {
      type: mongoose.Schema.Types.Mixed
    },
    result: {
      type: mongoose.Schema.Types.Mixed
    },
    error: {
      message: String,
      code: String,
      details: mongoose.Schema.Types.Mixed
    },
    retryCount: {
      type: Number,
      default: 0
    }
  }],
  
  // Overall execution results
  executionResult: {
    success: {
      type: Boolean,
      default: false
    },
    data: {
      type: mongoose.Schema.Types.Mixed
    },
    summary: {
      type: String
    },
    outputData: {
      type: mongoose.Schema.Types.Mixed
    }
  },
  
  // Error handling
  errorDetails: {
    type: {
      type: String,
      enum: ['connection_error', 'parameter_error', 'execution_error', 'timeout_error', 'system_error']
    },
    message: {
      type: String
    },
    step: {
      type: Number
    },
    timestamp: {
      type: Date
    },
    stackTrace: {
      type: String
    },
    isRetryable: {
      type: Boolean,
      default: true
    }
  },
  
  // Resource usage
  resourceUsage: {
    memoryUsed: {
      type: Number // in MB
    },
    cpuTime: {
      type: Number // in milliseconds
    },
    apiCalls: {
      type: Number,
      default: 0
    },
    dataTransferred: {
      type: Number // in bytes
    }
  },
  
  // Retry information
  retryCount: {
    type: Number,
    default: 0
  },
  maxRetries: {
    type: Number,
    default: 3
  },
  nextRetryTime: {
    type: Date
  },
  
  // Connected accounts at execution time
  connectedAccountsUsed: [{
    app: String,
    connectedAccountId: String,
    status: String
  }],
  
  // Execution context
  executionContext: {
    userAgent: String,
    ipAddress: String,
    sessionId: String,
    conversationId: String
  },
  
  // Logging and debugging
  logs: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    level: {
      type: String,
      enum: ['debug', 'info', 'warn', 'error'],
      required: true
    },
    message: {
      type: String,
      required: true
    },
    step: Number,
    details: mongoose.Schema.Types.Mixed
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
WorkflowExecutionSchema.index({ workflowId: 1, executionStartTime: -1 });
WorkflowExecutionSchema.index({ userId: 1, status: 1 });
WorkflowExecutionSchema.index({ status: 1, executionStartTime: 1 });
WorkflowExecutionSchema.index({ executionType: 1, triggerSource: 1 });
WorkflowExecutionSchema.index({ nextRetryTime: 1, status: 1 });

// Virtuals
WorkflowExecutionSchema.virtual('progressPercentage').get(function() {
  if (this.totalSteps === 0) return 0;
  return Math.round((this.completedSteps / this.totalSteps) * 100);
});

WorkflowExecutionSchema.virtual('isRunning').get(function() {
  return ['queued', 'running'].includes(this.status);
});

WorkflowExecutionSchema.virtual('isCompleted').get(function() {
  return ['completed', 'failed', 'cancelled', 'timeout'].includes(this.status);
});

WorkflowExecutionSchema.virtual('executionTime').get(function() {
  if (!this.executionEndTime || !this.executionStartTime) {
    return this.isRunning ? Date.now() - this.executionStartTime.getTime() : 0;
  }
  return this.executionEndTime.getTime() - this.executionStartTime.getTime();
});

// Methods
WorkflowExecutionSchema.methods.startExecution = function() {
  this.status = 'running';
  this.executionStartTime = new Date();
  return this.save();
};

WorkflowExecutionSchema.methods.completeExecution = function(success, result = null) {
  this.status = success ? 'completed' : 'failed';
  this.executionEndTime = new Date();
  this.executionDuration = this.executionEndTime.getTime() - this.executionStartTime.getTime();
  this.executionResult.success = success;
  
  if (result) {
    this.executionResult.data = result.data;
    this.executionResult.summary = result.summary;
    this.executionResult.outputData = result.outputData;
  }
  
  return this.save();
};

WorkflowExecutionSchema.methods.updateProgress = function(stepNumber, stepResult) {
  // Update current step
  this.currentStep = stepNumber;
  
  // Add or update step result
  const existingIndex = this.stepResults.findIndex(sr => sr.step === stepNumber);
  if (existingIndex >= 0) {
    this.stepResults[existingIndex] = { ...this.stepResults[existingIndex], ...stepResult };
  } else {
    this.stepResults.push({ step: stepNumber, ...stepResult });
  }
  
  // Update completed steps count
  this.completedSteps = this.stepResults.filter(sr => 
    ['completed', 'failed', 'skipped'].includes(sr.status)
  ).length;
  
  return this.save();
};

WorkflowExecutionSchema.methods.addLog = function(level, message, step = null, details = null) {
  this.logs.push({
    timestamp: new Date(),
    level,
    message,
    step,
    details
  });
  
  return this.save();
};

WorkflowExecutionSchema.methods.cancel = function(reason = 'User cancelled') {
  this.status = 'cancelled';
  this.executionEndTime = new Date();
  this.executionDuration = this.executionEndTime.getTime() - this.executionStartTime.getTime();
  this.addLog('info', reason);
  
  return this.save();
};

WorkflowExecutionSchema.methods.scheduleRetry = function(delayMinutes = 5) {
  if (this.retryCount >= this.maxRetries) {
    this.status = 'failed';
    return this.save();
  }
  
  this.retryCount += 1;
  this.nextRetryTime = new Date(Date.now() + (delayMinutes * 60 * 1000));
  this.status = 'queued';
  
  return this.save();
};

// Static methods
WorkflowExecutionSchema.statics.findByWorkflow = function(workflowId, limit = 50) {
  return this.find({ workflowId })
    .sort({ executionStartTime: -1 })
    .limit(limit);
};

WorkflowExecutionSchema.statics.findByUser = function(userId, status = null, limit = 100) {
  const query = { userId };
  if (status) query.status = status;
  
  return this.find(query)
    .sort({ executionStartTime: -1 })
    .limit(limit);
};

WorkflowExecutionSchema.statics.findPendingRetries = function() {
  return this.find({
    status: 'queued',
    nextRetryTime: { $lte: new Date() },
    retryCount: { $gt: 0, $lte: this.maxRetries }
  });
};

WorkflowExecutionSchema.statics.generateExecutionId = function() {
  return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

WorkflowExecutionSchema.statics.getExecutionStats = function(workflowId) {
  return this.aggregate([
    { $match: { workflowId } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgDuration: { $avg: '$executionDuration' },
        lastExecution: { $max: '$executionStartTime' }
      }
    }
  ]);
};

const WorkflowExecution = mongoose.model("WorkflowExecution", WorkflowExecutionSchema);

export default WorkflowExecution;
