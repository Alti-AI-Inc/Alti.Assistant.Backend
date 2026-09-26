import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Specialized isolated route for Code
// import Routes from '../app/routes/code.routes.js';
// app.use('/api/v1/code', Routes);

app.get('/health', (req, res) => res.json({ status: 'ok', agent: 'code' }));

const PORT = process.env.PORT || 4004;
app.listen(PORT, () => {
  console.log(`[ISOLATED AGENT] Code Engine running natively on Liberty Center One bare-metal, powered by Together AI + Exa + Composio + Zenrows + LangChain on port ${PORT}`);
});
