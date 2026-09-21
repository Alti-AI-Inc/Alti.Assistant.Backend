import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import { LibertyController } from './liberty.controller.js';

const router = express.Router();

// Public health / cluster status
router.get('/status', LibertyController.getClusterStatus);

// Authenticated infrastructure management
router.use(auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.SUPER_ADMIN));

// ── Object Storage (S3 / Swift) ───────────────────────────────────────────
router.get('/storage/buckets', LibertyController.listBuckets);
router.post('/storage/buckets', LibertyController.createBucket);
router.get('/storage/buckets/:bucket/objects', LibertyController.listObjects);
router.post('/storage/presigned-url', LibertyController.getPresignedUrl);
router.delete('/storage/objects', LibertyController.deleteObject);
router.get('/storage/stats', LibertyController.getStorageStats);

// ── Compute (Nova) ────────────────────────────────────────────────────────
router.get('/compute/instances', LibertyController.listInstances);
router.get('/compute/instances/:id', LibertyController.getInstance);
router.post('/compute/instances/:id/action', LibertyController.instanceAction);

// ── Block Storage (Cinder) ────────────────────────────────────────────────
router.get('/volumes', LibertyController.listVolumes);
router.post('/volumes', LibertyController.createVolume);

// ── Networking (Neutron) ──────────────────────────────────────────────────
router.get('/networks', LibertyController.listNetworks);

export const LibertyRoutes = router;
export default LibertyRoutes;
