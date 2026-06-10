/**
 * @file Zod schemas for validating Composio and Manager Dashboard operations.
 * @module appValidations
 */

import { z } from 'zod';

// =================================================================
// Composio Integration Validations
// =================================================================

/**
 * @typedef {object} EmailToolsValidationSchema
 * @property {string} connectedAccountId - The ID of the connected account. Must be a non-empty string.
 * @property {string} to - The recipient's email address. Must be a valid email format.
 * @property {string} subject - The subject of the email. Must be a non-empty string.
 * @property {string} body - The body content of the email. Must be a non-empty string.
 */

/**
 * Zod schema for validating input for email-related tools.
 * Ensures that all required fields for sending an email are present and correctly formatted.
 * @type {z.ZodObject<EmailToolsValidationSchema>}
 */
const emailToolsValidation = z.object({
  connectedAccountId: z.string().min(1, 'connectedAccountId is required'),
  to: z.string().email('Invalid email format'),
  subject: z
    .string()
    .min(1, 'Subject is required')
    // SECURITY: Sanitize subject by stripping HTML tags to prevent Stored XSS vulnerabilities.
    .transform((val) => val.replace(/<[^>]*>?/gm, '')),
  body: z
    .string()
    .min(1, 'Body is required')
    // SECURITY: Sanitize body by stripping HTML tags to prevent Stored XSS vulnerabilities.
    .transform((val) => val.replace(/<[^>]*>?/gm, '')),
});

/**
 * @typedef {object} LinkedinPostSchema
 * @property {string} connectedAccountId - The ID of the connected account. Must be a non-empty string.
 * @property {string} content - The content of the LinkedIn post. Must be a non-empty string.
 */

/**
 * Zod schema for validating input for creating a LinkedIn post.
 * Ensures that the connected account ID and post content are provided.
 * @type {z.ZodObject<LinkedinPostSchema>}
 */
export const linkedinPostSchema = z.object({
  connectedAccountId: z.string().min(1, 'connectedAccountId is required'),
  content: z
    .string()
    .min(1, 'Content is required')
    // SECURITY: Sanitize content by stripping HTML tags to prevent Stored XSS vulnerabilities.
    .transform((val) => val.replace(/<[^>]*>?/gm, '')),
});

/**
 * An object containing all Zod validation schemas related to Composio integrations.
 * @type {object}
 * @property {z.ZodObject<EmailToolsValidationSchema>} emailToolsValidation - Schema for validating email tool inputs.
 * @property {z.ZodObject<LinkedinPostSchema>} linkedinPostSchema - Schema for validating LinkedIn post inputs.
 */
export const composioValidation = {
  emailToolsValidation,
  linkedinPostSchema,
};

// =================================================================
// Manager Dashboard Validations
// =================================================================

/**
 * @typedef {object} InviteMemberValidationSchema
 * @property {string} email - The email address of the user to invite.
 * @property {'MEMBER' | 'ANALYST'} role - The role to assign to the new member.
 */

/**
 * Zod schema for validating a manager's request to invite a new member.
 * - Ensures the email is valid.
 * - Restricts role assignment to non-administrative roles to prevent privilege escalation.
 *   Managers cannot assign roles that grant access to billing or workspace ownership.
 * - NOTE: Plan limit checks (e.g., max number of users) must be performed in the service layer
 *   after this validation passes.
 * @type {z.ZodObject<InviteMemberValidationSchema>}
 */
const inviteMemberSchema = z.object({
  email: z.string().email('A valid email address is required for the invitation.'),
  role: z.enum(['MEMBER', 'ANALYST'], {
    errorMap: () => ({
      message: 'Invalid role. Managers can only assign MEMBER or ANALYST roles.',
    }),
  }),
});

/**
 * @typedef {object} UpdateMemberRoleValidationSchema
 * @property {string} memberId - The UUID of the member to update.
 * @property {'MEMBER' | 'ANALYST'} role - The new role to assign.
 */

/**
 * Zod schema for validating a manager's request to update a team member's role.
 * - Ensures the memberId is a valid UUID.
 * - Restricts role assignment to prevent privilege escalation, mirroring invitation rules.
 * @type {z.ZodObject<UpdateMemberRoleValidationSchema>}
 */
const updateMemberRoleSchema = z.object({
  memberId: z.string().uuid('A valid member ID is required.'),
  role: z.enum(['MEMBER', 'ANALYST'], {
    errorMap: () => ({
      message: 'Invalid role. Managers can only assign MEMBER or ANALYST roles.',
    }),
  }),
});

/**
 * @typedef {object} GetWorkspaceMetricsValidationSchema
 * @property {string} [startDate] - Optional start date for the metrics query (ISO 8601 format).
 * @property {string} [endDate] - Optional end date for the metrics query (ISO 8601 format).
 */

/**
 * Zod schema for validating query parameters for fetching workspace metrics.
 * - Ensures that date strings are in the correct format if provided.
 * - Verifies that the start date comes before the end date.
 * - NOTE: Authorization logic to ensure the manager can only access their own
 *   workspace's metrics should be handled in middleware or the service layer.
 * @type {z.ZodObject<GetWorkspaceMetricsValidationSchema>}
 */
const getWorkspaceMetricsSchema = z
  .object({
    startDate: z.string().datetime({ message: 'Invalid start date format.' }).optional(),
    endDate: z.string().datetime({ message: 'Invalid end date format.' }).optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.startDate) < new Date(data.endDate);
      }
      return true;
    },
    {
      message: 'startDate must be earlier than endDate.',
      path: ['startDate'],
    },
  );

/**
 * An object containing all Zod validation schemas related to the Manager Dashboard.
 * @type {object}
 * @property {z.ZodObject<InviteMemberValidationSchema>} inviteMemberSchema - Schema for validating new member invitations.
 * @property {z.ZodObject<UpdateMemberRoleValidationSchema>} updateMemberRoleSchema - Schema for validating member role updates.
 * @property {z.ZodObject<GetWorkspaceMetricsValidationSchema>} getWorkspaceMetricsSchema - Schema for validating workspace metrics queries.
 */
export const managerDashboardValidation = {
  inviteMemberSchema,
  updateMemberRoleSchema,
  getWorkspaceMetricsSchema,
};