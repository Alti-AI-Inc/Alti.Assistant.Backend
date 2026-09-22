import express from 'express';
import realEstateApiController from './realestateapi.controller.js';
import auth from '../../middlewares/auth/auth.js';

const router = express.Router();

router.use(auth());

// V2 Routes
router.post('/property-search', realEstateApiController.getPropertySearch);
router.post('/property-detail', realEstateApiController.getPropertyDetail);
router.post('/property-detail-bulk', realEstateApiController.getPropertyDetailBulk);
router.post('/property-avm-bulk', realEstateApiController.getPropertyAvmBulk);
router.post('/mls-search', realEstateApiController.getMlsSearch);
router.post('/mls-detail', realEstateApiController.getMlsDetail);
router.post('/property-avm', realEstateApiController.getPropertyAvm);
router.post('/property-comps', realEstateApiController.getPropertyComps);
router.post('/skip-trace', realEstateApiController.getSkipTrace);
router.post('/skip-trace-batch', realEstateApiController.getSkipTraceBatch);
router.post('/skip-trace-batch-await', realEstateApiController.getSkipTraceBatchAwait);
router.post('/involuntary-lien', realEstateApiController.getInvoluntaryLien);
router.post('/property-liens', realEstateApiController.getPropertyLiens);
router.post('/demographics', realEstateApiController.getDemographics);
router.post('/autocomplete', realEstateApiController.getAutocomplete);
router.post('/address-verification', realEstateApiController.getAddressVerification);
router.post('/csv-builder', realEstateApiController.getCsvBuilder);
router.post('/change-files', realEstateApiController.getChangeFiles);
router.post('/mls-property-mapping', realEstateApiController.getMlsPropertyMappingV2);
router.get('/key-info', realEstateApiController.getKeyInfo);

// V3 Routes
router.post('/v3/mls-search', realEstateApiController.getMlsSearchV3);
router.post('/v3/mls-detail', realEstateApiController.getMlsDetailV3);
router.post('/v3/mls-detail-bulk', realEstateApiController.getMlsDetailBulkV3);
router.post('/v3/mls-autocomplete', realEstateApiController.getMlsAutocompleteV3);
router.post('/v3/property-comps', realEstateApiController.getPropertyCompsV3);
router.post('/v3/mls-board-coverage', realEstateApiController.getMlsBoardCoverage);
router.post('/v3/mls-property-mapping', realEstateApiController.getMlsPropertyMappingV3);

// V1 / Portfolio Routes
router.post('/v1/property-parcel', realEstateApiController.getPropertyParcel);
router.post('/v1/saved-search/create', realEstateApiController.savedSearchCreate);
router.post('/v1/saved-search/retrieve', realEstateApiController.savedSearchRetrieve);
router.post('/v1/saved-search/list', realEstateApiController.savedSearchList);
router.post('/v1/saved-search/update', realEstateApiController.savedSearchUpdate);
router.post('/v1/saved-search/delete', realEstateApiController.savedSearchDelete);

export const realEstateApiRoutes = router;
