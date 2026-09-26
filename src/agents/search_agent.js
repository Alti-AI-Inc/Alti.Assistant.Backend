import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Specialized isolated route for Search
// import Routes from '../app/routes/search.routes.js';
// app.use('/api/v1/search', Routes);

app.get('/health', (req, res) => res.json({ status: 'ok', agent: 'search' }));

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
  console.log(`[ISOLATED AGENT] Search Engine running natively on Liberty Center One bare-metal, powered by Together AI + Exa + Composio + Zenrows + LangChain on port ${PORT}`);
});
