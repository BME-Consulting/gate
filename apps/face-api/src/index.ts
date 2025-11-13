import express from 'express';
import cors from 'cors';
import faceRoutes from './routes/face';
import workerRoutes from './routes/workers';

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api/face', faceRoutes);
app.use('/api/workers', workerRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Face API Server running on http://localhost:${PORT}`);
});
