import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Specialized isolated route for Audio
// import Routes from '../app/routes/audio.routes.js';
// app.use('/api/v1/audio', Routes);

app.get('/health', (req, res) => res.json({ status: 'ok', agent: 'audio' }));

const PORT = process.env.PORT || 4007;
app.listen(PORT, () => {
  console.log(`[ISOLATED AGENT] Audio Engine running natively on Liberty Center One bare-metal, powered by Together AI + Exa + Composio + Zenrows + LangChain on port ${PORT}`);
});
