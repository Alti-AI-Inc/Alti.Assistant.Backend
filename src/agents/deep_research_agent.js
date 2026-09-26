import express from 'express';
import cors from 'cors';
import ResearchRoutes from '../app/routes/research.routes.js';

const app = express();
app.use(cors());
app.use(express.json());

// Specialized isolated route
app.use('/api/v1/research', ResearchRoutes);

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
  console.log(`[ISOLATED AGENT] Deep Research Engine listening on port ${PORT}`);
});
