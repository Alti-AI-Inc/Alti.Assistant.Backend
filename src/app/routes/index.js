import express from 'express';
import ExtractRoutes from './extract.routes.js';
import ResearchRoutes from './research.routes.js';
import WorkflowRoutes from './workflow.routes.js';
import MonitorRoutes from './monitor.routes.js';


import { ComposioRoutes } from '../modules/composio/composio.route.js';

const router = express.Router();

const moduleRoutes = [
  {
    path: '/extract',
    route: ExtractRoutes,
  },

  {
    path: '/research',
    route: ResearchRoutes,
  },
  {
    path: '/workflow',
    route: WorkflowRoutes,
  },
  {
    path: '/monitor',
    route: MonitorRoutes,
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
