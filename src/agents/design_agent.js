import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Specialized isolated route for Design
// import Routes from '../app/routes/design.routes.js';
// app.use('/api/v1/design', Routes);

app.get('/health', (req, res) => res.json({ status: 'ok', agent: 'design' }));

const PORT = process.env.PORT || 4005;
app.listen(PORT, () => {
  console.log(`[ISOLATED AGENT] Design Engine running natively on Liberty Center One bare-metal, powered by Together AI + Exa + Composio + Zenrows + LangChain on port ${PORT}`);
});
