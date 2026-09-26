import express from 'express';
import ResearchRoutes from './research.routes.js';
import { ComposioRoutes } from '../modules/composio/composio.route.js';

const router = express.Router();

const moduleRoutes = [
  {
    path: '/research',
    route: ResearchRoutes,
  },

  {
    path: '/composio',
    route: ComposioRoutes,
  }
];

for (const route of moduleRoutes) {
  router.use(route.path, route.route);
}

// API Discovery Endpoint
router.get('/api-map', (req, res) => {
  res.json({
    success: true,
    data: {
      baseUrl: '/api/v1',
      modules: [{ module: 'composio', basePath: '/api/v1/composio' }]
    },
  });
});

export default router;
