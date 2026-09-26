import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Specialized isolated route for Research
// import Routes from '../app/routes/research.routes.js';
// app.use('/api/v1/research', Routes);

app.get('/health', (req, res) => res.json({ status: 'ok', agent: 'research' }));

const PORT = process.env.PORT || 4002;
app.listen(PORT, () => {
  console.log(`[ISOLATED AGENT] Research Engine running natively on Liberty Center One bare-metal, powered by Together AI + Exa + Composio + Zenrows + LangChain on port ${PORT}`);
});
