import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Specialized isolated route for Video
// import Routes from '../app/routes/video.routes.js';
// app.use('/api/v1/video', Routes);

app.get('/health', (req, res) => res.json({ status: 'ok', agent: 'video' }));

const PORT = process.env.PORT || 4006;
app.listen(PORT, () => {
  console.log(`[ISOLATED AGENT] Video Engine running natively on Liberty Center One bare-metal, powered by Together AI + Exa + Composio + Zenrows + LangChain on port ${PORT}`);
});
