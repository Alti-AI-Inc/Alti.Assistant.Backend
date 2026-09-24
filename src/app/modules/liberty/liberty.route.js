import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import { LibertyController } from './liberty.controller.js';

const router = express.Router();

// Public health / cluster status
router.get('/status', LibertyController.getClusterStatus);

// Authenticated infrastructure management
router.use(auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.SUPER_ADMIN));

// ── Full Cluster Dashboard ────────────────────────────────────────────────
router.get('/cluster', LibertyController.getFullClusterStatus);

// ── Object Storage (Swift S3 via MinIO) ───────────────────────────────────
router.get('/storage/buckets', LibertyController.listBuckets);
router.post('/storage/buckets', LibertyController.createBucket);
router.get('/storage/buckets/:bucket/objects', LibertyController.listObjects);
router.post('/storage/presigned-url', LibertyController.getPresignedUrl);
router.delete('/storage/objects', LibertyController.deleteObject);
router.get('/storage/stats', LibertyController.getStorageStats);

// ── OTA Binary Distribution (Desktop/Mobile Apps) ─────────────────────────
// Dedicated Swift endpoints for high-speed download of APKs, IPAs, and Electron binaries
router.post('/storage/ota/release', LibertyController.publishOtaRelease);
router.get('/storage/ota/latest/:platform', LibertyController.getLatestOtaReleaseUrl);

// ── Compute (Nova) ────────────────────────────────────────────────────────
router.get('/compute/instances', LibertyController.listInstances);
router.get('/compute/instances/:id', LibertyController.getInstance);
router.post('/compute/instances/:id/action', LibertyController.instanceAction);

// ── Block Storage (Cinder) ────────────────────────────────────────────────
router.get('/volumes', LibertyController.listVolumes);
router.post('/volumes', LibertyController.createVolume);

// ── Networking (Neutron) ──────────────────────────────────────────────────
router.get('/networks', LibertyController.listNetworks);
router.get('/networks/security-groups', LibertyController.listSecurityGroups);
router.get('/networks/floating-ips', LibertyController.listFloatingIps);

// ── Secrets & Key Management (Barbican — Apache 2.0) ──────────────────────
router.get('/secrets', LibertyController.listSecrets);
router.post('/secrets', LibertyController.createSecret);
router.get('/secrets/:id', LibertyController.getSecret);
router.delete('/secrets/:id', LibertyController.deleteSecret);

// ── Image Service (Glance — Apache 2.0) ───────────────────────────────────
router.get('/images', LibertyController.listImages);
router.get('/images/:id', LibertyController.getImage);

// ── Load Balancer (Octavia — Apache 2.0) ──────────────────────────────────
router.get('/load-balancers', LibertyController.listLoadBalancers);
router.post('/load-balancers', LibertyController.createLoadBalancer);
router.get('/load-balancers/:id', LibertyController.getLoadBalancer);
router.get('/load-balancers/:id/stats', LibertyController.getLoadBalancerStats);

// ── Orchestration / IaC (Heat — Apache 2.0) ───────────────────────────────
router.get('/stacks', LibertyController.listStacks);
router.post('/stacks', LibertyController.createStack);
router.get('/stacks/:name/:id', LibertyController.getStack);
router.delete('/stacks/:name/:id', LibertyController.deleteStack);
router.post('/stacks/validate', LibertyController.validateTemplate);

export const LibertyRoutes = router;
export default LibertyRoutes;
