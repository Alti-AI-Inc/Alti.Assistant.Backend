import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { SupportController } from './support.controller.js';
import { supportValidationSchema } from './support.validation.js';

/**
 * @constant {express.Router} router - Express router for support routes.
 */
const router = express.Router();

/**
 * @swagger
 * /api/v1/support/req-support/{id}:
 *   post:
 *     summary: Request support
 *     description: Allows a user or admin to request support for a specific entity identified by the provided ID.
 *     tags:
 *       - Support
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the entity for which support is being requested.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SupportRequest'
 *     responses:
 *       200:
 *         description: Support request created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Support request created successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Support'
 *       400:
 *         description: Bad request. Invalid input data.
 *       401:
 *         description: Unauthorized. Authentication token is missing or invalid.
 *       403:
 *         description: Forbidden. User does not have the necessary permissions.
 */
router
  .route('/req-support/:id')
  .post(
    validateRequest(supportValidationSchema),
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    SupportController.reqForSupport
  );

/**
 * @swagger
 * /api/v1/support/{id}:
 *   get:
 *     summary: Get support request by ID
 *     description: Retrieves the details of a specific support request using its unique ID.
 *     tags:
 *       - Support
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the support request to retrieve.
 *     responses:
 *       200:
 *         description: Support request retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Support request retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Support'
 *       401:
 *         description: Unauthorized. Authentication token is missing or invalid.
 *       403:
 *         description: Forbidden. User does not have the necessary permissions.
 *       404:
 *         description: Not Found. Support request with the given ID does not exist.
 */
router
  .route('/:id')
  .get(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    SupportController.getSupportById
  );

/**
 * @swagger
 * /api/v1/support/update-support-req/{id}:
 *   patch:
 *     summary: Update a support request
 *     description: Allows an admin or user to update an existing support request identified by its ID.
 *     tags:
 *       - Support
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the support request to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SupportUpdate'
 *     responses:
 *       200:
 *         description: Support request updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Support request updated successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Support'
 *       400:
 *         description: Bad request. Invalid input data.
 *       401:
 *         description: Unauthorized. Authentication token is missing or invalid.
 *       403:
 *         description: Forbidden. User does not have the necessary permissions.
 *       404:
 *         description: Not Found. Support request with the given ID does not exist.
 */
router
  .route('/update-support-req/:id')
  .patch(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    SupportController.updateSupportReq
  );

/**
 * @swagger
 * /api/v1/support/delete-support-req/{id}:
 *   delete:
 *     summary: Delete a support request
 *     description: Allows an admin or user to delete a specific support request identified by its ID.
 *     tags:
 *       - Support
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the support request to delete.
 *     responses:
 *       200:
 *         description: Support request deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Support request deleted successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Support'
 *       401:
 *         description: Unauthorized. Authentication token is missing or invalid.
 *       403:
 *         description: Forbidden. User does not have the necessary permissions.
 *       404:
 *         description: Not Found. Support request with the given ID does not exist.
 */
router
  .route('/delete-support-req/:id')
  .delete(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    SupportController.deleteSupportReq
  );

/**
 * @swagger
 * /api/v1/support/all-support:
 *   get:
 *     summary: Get all support requests
 *     description: Retrieves a list of all support requests. This endpoint supports pagination, filtering, and sorting.
 *     tags:
 *       - Support
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number for pagination (default 1).
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Number of items per page (default 10).
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *         description: Field to sort by (e.g., 'createdAt', 'status').
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         description: Sort order (asc or desc, default desc).
 *       - in: query
 *         name: searchTerm
 *         schema:
 *           type: string
 *         description: Search term to filter results.
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, resolved, closed]
 *         description: Filter by support request status.
 *     responses:
 *       200:
 *         description: A list of support requests retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Support requests retrieved successfully"
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Support'
 *       401:
 *         description: Unauthorized. Authentication token is missing or invalid.
 *       403:
 *         description: Forbidden. User does not have the necessary permissions.
 */
router
  .route('/all-support')
  .get(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    SupportController.getAllSupportReq
  );

/**
 * @swagger
 * /api/v1/support/bulk-delete:
 *   delete:
 *     summary: Bulk delete support requests
 *     description: Allows for the deletion of multiple support requests simultaneously by providing an array of their IDs.
 *     tags:
 *       - Support
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: An array of support request IDs to be deleted.
 *                 example: ["65a4a2c2a2b2c2d2e2f2a2b2", "65a4a2c2a2b2c2d2e2f2a2b3"]
 *     responses:
 *       200:
 *         description: Support requests deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Support requests deleted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     deletedCount:
 *                       type: integer
 *                       example: 2
 *       400:
 *         description: Bad request. Invalid input data or no IDs provided.
 *       401:
 *         description: Unauthorized. Authentication token is missing or invalid.
 *       403:
 *         description: Forbidden. User does not have the necessary permissions.
 */
router.route('/bulk-delete').delete(SupportController.bulkDeleteSupportReq);

/**
 * @constant {express.Router} supportRoutes - Exported Express router for support module.
 */
export const supportRoutes = router;