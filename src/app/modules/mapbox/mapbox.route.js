import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { MapboxController } from './mapbox.controller.js';

const router = express.Router();

router.use(auth());

// ═══════════════════════════════════════════════════════════════════════
// GEOCODING v6
// ═══════════════════════════════════════════════════════════════════════

router.get('/geocode/forward', MapboxController.geocodeForward);
router.get('/geocode/reverse/:lng/:lat', MapboxController.geocodeReverse);

// ═══════════════════════════════════════════════════════════════════════
// SEARCH / PLACES (Searchbox v1)
// ═══════════════════════════════════════════════════════════════════════

router.get('/search/suggest', MapboxController.searchSuggest);
router.get('/search/retrieve/:mapboxId', MapboxController.searchRetrieve);
router.get('/search/category/:category', MapboxController.searchCategory);

// ═══════════════════════════════════════════════════════════════════════
// DIRECTIONS v5
// ═══════════════════════════════════════════════════════════════════════

router.get('/directions/:profile/:coordinates', MapboxController.getDirections);
router.get('/directions/driving-traffic/:coordinates', MapboxController.getDrivingDirections);
router.get('/directions/walking/:coordinates', MapboxController.getWalkingDirections);
router.get('/directions/cycling/:coordinates', MapboxController.getCyclingDirections);

// ═══════════════════════════════════════════════════════════════════════
// MATRIX v1 — Travel time/distance matrix
// ═══════════════════════════════════════════════════════════════════════

router.get('/matrix/:profile/:coordinates', MapboxController.getMatrix);

// ═══════════════════════════════════════════════════════════════════════
// OPTIMIZATION v1 — Optimal route (TSP)
// ═══════════════════════════════════════════════════════════════════════

router.get('/optimize/:profile/:coordinates', MapboxController.getOptimizedTrip);

// ═══════════════════════════════════════════════════════════════════════
// ISOCHRONE v1 — Reachability polygons
// ═══════════════════════════════════════════════════════════════════════

router.get('/isochrone/:profile/:lng/:lat', MapboxController.getIsochrone);

// ═══════════════════════════════════════════════════════════════════════
// MAP MATCHING v5 — Snap GPS traces to roads
// ═══════════════════════════════════════════════════════════════════════

router.get('/matching/:profile/:coordinates', MapboxController.matchRoute);

// ═══════════════════════════════════════════════════════════════════════
// TILEQUERY v4 — Query features near a point
// ═══════════════════════════════════════════════════════════════════════

router.get('/tilequery/:tileset/:lng/:lat', MapboxController.tilequery);

// ═══════════════════════════════════════════════════════════════════════
// STATIC IMAGES
// ═══════════════════════════════════════════════════════════════════════

router.get('/static/image-url', MapboxController.getStaticImageUrl);

// ═══════════════════════════════════════════════════════════════════════
// STYLES v1
// ═══════════════════════════════════════════════════════════════════════

router.get('/styles/:username', MapboxController.listStyles);
router.get('/styles/:username/:styleId', MapboxController.getStyle);

// ═══════════════════════════════════════════════════════════════════════
// TILESETS v1
// ═══════════════════════════════════════════════════════════════════════

router.get('/tilesets/:username', MapboxController.listTilesets);
router.get('/tilesets/tilejson/:tilesetId', MapboxController.getTileJSON);

// ═══════════════════════════════════════════════════════════════════════
// DATASETS v1
// ═══════════════════════════════════════════════════════════════════════

router.get('/datasets/:username', MapboxController.listDatasets);
router.get('/datasets/:username/:datasetId', MapboxController.getDataset);
router.get('/datasets/:username/:datasetId/features', MapboxController.listDatasetFeatures);

// ═══════════════════════════════════════════════════════════════════════
// UPLOADS v1
// ═══════════════════════════════════════════════════════════════════════

router.get('/uploads/:username', MapboxController.listUploads);
router.get('/uploads/:username/:uploadId', MapboxController.getUploadStatus);

// ═══════════════════════════════════════════════════════════════════════
// TOKENS v2
// ═══════════════════════════════════════════════════════════════════════

router.get('/tokens/:username', MapboxController.listTokens);

// ═══════════════════════════════════════════════════════════════════════
// FONTS v1
// ═══════════════════════════════════════════════════════════════════════

router.get('/fonts/:username', MapboxController.listFonts);

// ═══════════════════════════════════════════════════════════════════════
// RAW PROXY — catch-all for any unmapped Mapbox endpoint
// ═══════════════════════════════════════════════════════════════════════

router.get('/proxy/*', MapboxController.rawProxy);

export const MapboxRoutes = router;
export default MapboxRoutes;
