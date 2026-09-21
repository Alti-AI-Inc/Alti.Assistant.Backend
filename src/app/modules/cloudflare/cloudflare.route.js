import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import { CloudflareController } from './cloudflare.controller.js';

const router = express.Router();

// Public Turnstile verification (for login / register forms)
router.post('/turnstile/verify', CloudflareController.verifyTurnstile);

// Authenticated Zone & Security management (Admins only)
router.use(auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.SUPER_ADMIN));

router.get('/zone', CloudflareController.getZoneDetails);
router.post('/cache/purge', CloudflareController.purgeCache);

// DNS Management
router.get('/dns', CloudflareController.listDnsRecords);
router.post('/dns', CloudflareController.createDnsRecord);
router.delete('/dns/:recordId', CloudflareController.deleteDnsRecord);

// WAF & Security Rules
router.get('/waf/rules', CloudflareController.listWafRules);

export const CloudflareRoutes = router;
export default CloudflareRoutes;
