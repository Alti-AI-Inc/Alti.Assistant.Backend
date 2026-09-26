import express from 'express';
import cors from 'cors';
import MonitorRoutes from '../app/routes/monitor.routes.js';

const app = express();
app.use(cors());
app.use(express.json());

// Specialized isolated route
app.use('/api/v1/monitor', MonitorRoutes);

const PORT = process.env.PORT || 4002;
app.listen(PORT, () => {
  console.log(`[ISOLATED AGENT] Semantic DOM Monitor Engine listening on port ${PORT}`);
});
