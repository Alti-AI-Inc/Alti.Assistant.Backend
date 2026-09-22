import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { ExploriumController } from './explorium.controller.js';

const router = express.Router();

router.use(auth());

// ═══════════════════════════════════════════════════════════════════════
// BUSINESSES
// ═══════════════════════════════════════════════════════════════════════

router.post('/businesses/match', ExploriumController.matchBusinesses);
router.post('/businesses/enrich', ExploriumController.enrichBusinesses);
router.post('/businesses/search', ExploriumController.searchBusinesses);
router.post('/businesses/research', ExploriumController.researchBusiness);
router.get('/businesses/:businessId', ExploriumController.getBusiness);

// ═══════════════════════════════════════════════════════════════════════
// PROSPECTS
// ═══════════════════════════════════════════════════════════════════════

router.post('/prospects/match', ExploriumController.matchProspects);
router.post('/prospects/enrich', ExploriumController.enrichProspects);
router.post('/prospects/search', ExploriumController.searchProspects);
router.get('/prospects/:prospectId', ExploriumController.getProspect);

// ═══════════════════════════════════════════════════════════════════════
// EVENTS / SIGNALS
// ═══════════════════════════════════════════════════════════════════════

router.post('/events', ExploriumController.getEvents);

// ═══════════════════════════════════════════════════════════════════════
// AUTOCOMPLETE
// ═══════════════════════════════════════════════════════════════════════

router.post('/autocomplete', ExploriumController.autocomplete);

// ═══════════════════════════════════════════════════════════════════════
// AUDIENCE STATS
// ═══════════════════════════════════════════════════════════════════════

router.post('/audience/stats', ExploriumController.getAudienceStats);

// ═══════════════════════════════════════════════════════════════════════
// ASYNC JOBS
// ═══════════════════════════════════════════════════════════════════════

router.post('/jobs', ExploriumController.createJob);
router.get('/jobs', ExploriumController.listJobs);
router.get('/jobs/:jobId', ExploriumController.getJobStatus);

// ═══════════════════════════════════════════════════════════════════════
// CREDITS
// ═══════════════════════════════════════════════════════════════════════

router.get('/credits/balance', ExploriumController.getCreditBalance);

// ═══════════════════════════════════════════════════════════════════════
// RAW PROXY — catch-all for any unmapped Explorium endpoint
// ═══════════════════════════════════════════════════════════════════════

router.all('/proxy/*', ExploriumController.rawProxy);

export const ExploriumRoutes = router;
export default ExploriumRoutes;
