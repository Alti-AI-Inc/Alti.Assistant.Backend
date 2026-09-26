import express from 'express';
import cors from 'cors';
import WorkflowRoutes from '../app/routes/workflow.routes.js';

const app = express();
app.use(cors());
app.use(express.json());

// Specialized isolated route
app.use('/api/v1/workflow', WorkflowRoutes);

const PORT = process.env.PORT || 4003;
app.listen(PORT, () => {
  console.log(`[ISOLATED AGENT] DAG Workflow Orchestrator listening on port ${PORT}`);
});
