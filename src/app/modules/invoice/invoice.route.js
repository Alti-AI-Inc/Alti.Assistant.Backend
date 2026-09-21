import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import invoiceController from './invoice.controller.js';

const router = express.Router();

// All invoice routes require authentication
router.use(auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER));

/**
 * @swagger
 * /api/v1/invoices/summary:
 *   get:
 *     summary: Get billing summary
 *     description: Returns total spent (self + team), invoice counts, and recent invoices.
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Billing summary
 */
router.get('/summary', invoiceController.getInvoiceSummary);

/**
 * @swagger
 * /api/v1/invoices:
 *   get:
 *     summary: List invoices
 *     description: Returns all invoices for the authenticated user (own + team).
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [subscription, one_time, sponsored, refund, credit]
 *     responses:
 *       200:
 *         description: Invoices list with pagination
 */
router.get('/', invoiceController.listInvoices);

/**
 * @swagger
 * /api/v1/invoices/{invoiceId}:
 *   get:
 *     summary: Get single invoice
 *     description: Returns details of a specific invoice. Only accessible by the invoice owner or payer.
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invoice details
 *       404:
 *         description: Invoice not found
 */
router.get('/:invoiceId', invoiceController.getInvoice);

export const invoiceRoutes = router;
export default router;
