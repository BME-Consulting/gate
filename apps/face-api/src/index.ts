import express from 'express';
import cors from 'cors';
import faceRoutes from './routes/face';
import workerRoutes from './routes/workers';
import { authMiddleware } from './middleware/auth';

const app = express();
const PORT = process.env.PORT || 8100;

// 許可するオリジンのリスト
const allowedOrigins = [
  'http://localhost:19006',  // Expo DevTools
  'http://localhost:8081',   // Metro Bundler
  process.env.ALLOWED_ORIGIN // 本番環境のオリジン
].filter(Boolean) as string[];

// CORS設定の厳格化
app.use(cors({
  origin: (origin, callback) => {
    // originがundefinedの場合は同一オリジン（許可）
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));

app.use(express.json({ limit: '50mb' }));

// リクエストタイムアウトミドルウェア
app.use((req, res, next) => {
  // 60秒のタイムアウト
  req.setTimeout(60000, () => {
    console.error(`Request timeout: ${req.method} ${req.url}`);
    if (!res.headersSent) {
      res.status(408).json({
        success: false,
        error: 'Request timeout'
      });
    }
  });
  next();
});

// ヘルスチェックエンドポイント（認証不要）
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 認証が必要なエンドポイント
app.use('/api/face', authMiddleware, faceRoutes);
app.use('/api/workers', authMiddleware, workerRoutes);

const server = app.listen(PORT, () => {
  console.log(`🚀 Face API Server running on http://localhost:${PORT}`);
  console.log(`✓ Authentication enabled (API_KEY: ${process.env.API_KEY ? '***configured***' : 'development-api-key-12345'})`);
  console.log(`✓ CORS origins: ${allowedOrigins.join(', ')}`);
  console.log(`✓ Request timeout: 60 seconds`);
});

// サーバーのkeep-aliveタイムアウト設定
server.keepAliveTimeout = 65000; // 65秒
server.headersTimeout = 66000;   // 66秒（keepAliveTimeout + 1秒）
