import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Specialized isolated route for Write
// import Routes from '../app/routes/write.routes.js';
// app.use('/api/v1/write', Routes);

app.get('/health', (req, res) => res.json({ status: 'ok', agent: 'write' }));

const PORT = process.env.PORT || 4003;
app.listen(PORT, () => {
  console.log(`[ISOLATED AGENT] Write Engine running natively on Liberty Center One bare-metal, powered by Together AI + Exa + Composio + Zenrows + LangChain on port ${PORT}`);
});
