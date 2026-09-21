import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { TemplateController } from './templates.controller.js';

const router = express.Router();

router.use(auth());

router.get('/', TemplateController.listTemplates);
router.get('/:id', TemplateController.getTemplate);
router.post('/:id/deploy', TemplateController.deployTemplate);
router.post('/', TemplateController.publishTemplate);
router.put('/:id', TemplateController.updateTemplate);
router.delete('/:id', TemplateController.deleteTemplate);
router.post('/:id/rate', TemplateController.rateTemplate);

export const TemplateRoutes = router;
