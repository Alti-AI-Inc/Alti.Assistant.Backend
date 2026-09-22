import express from 'express';
import realEstateApiController from './realestateapi.controller.js';
import auth from '../../middlewares/auth.js';

const router = express.Router();

// Apply auth middleware if you want these protected, or remove if public.
// Assuming we want them protected.
router.use(auth());

router.post('/property-search', realEstateApiController.getPropertySearch);
router.post('/property-detail', realEstateApiController.getPropertyDetail);
router.post('/property-detail-bulk', realEstateApiController.getPropertyDetailBulk);
router.post('/mls-search', realEstateApiController.getMlsSearch);
router.post('/mls-detail', realEstateApiController.getMlsDetail);
router.post('/property-avm', realEstateApiController.getPropertyAvm);
router.post('/property-comps', realEstateApiController.getPropertyComps);
router.post('/skip-trace', realEstateApiController.getSkipTrace);
router.post('/skip-trace-batch', realEstateApiController.getSkipTraceBatch);
router.post('/skip-trace-batch-await', realEstateApiController.getSkipTraceBatchAwait);
router.post('/involuntary-lien', realEstateApiController.getInvoluntaryLien);
router.post('/demographics', realEstateApiController.getDemographics);
router.get('/key-info', realEstateApiController.getKeyInfo);

export const realEstateApiRoutes = router;
