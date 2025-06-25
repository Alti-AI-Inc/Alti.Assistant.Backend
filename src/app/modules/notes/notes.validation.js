const { z } = require('zod');

const taskValidationSchema = z.object({
  title: z.string({
    required_error: 'Title is required',
  }).min(1).max(255).optional(),
  description: z.string().min(0).max(1000).optional(),
  status: z.enum(['Pending', 'In Progress', 'Completed'],{
    required_error: 'Status is required',
  }).optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().nullable().optional(),
  userId: z.string().optional(),
});

module.exports = taskValidationSchema;
