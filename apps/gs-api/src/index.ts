import express from 'express';
import cors from 'cors';
import { initializeDatabase, seedDefaultProject, seedDummyWorkers } from './database/sqlite';
import { authMiddleware } from './middleware/auth';
import workersRoutes from './routes/workers';
import eventsRoutes from './routes/events';
import statsRoutes from './routes/stats';

const app = express();
const PORT = process.env.PORT || 7070;

// 開発環境と本番環境でCORS設定を切り替え
const isDevelopment = process.env.NODE_ENV !== 'production';

if (isDevelopment) {
  // 開発環境: 全オリジンを許可
  app.use(cors({
    origin: '*',
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
  }));
  console.log('✓ CORS: Development mode - all origins allowed');
} else {
  // 本番環境: 許可するオリジンのリスト
  const allowedOrigins = [
    'http://localhost:19006',  // Expo DevTools
    'http://localhost:8081',   // Metro Bundler
    process.env.ALLOWED_ORIGIN // 本番環境のオリジン
  ].filter(Boolean) as string[];

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
  console.log(`✓ CORS: Production mode - allowed origins: ${allowedOrigins.join(', ')}`);
}

app.use(express.json({ limit: '50mb' }));

// リクエストタイムアウトミドルウェア
app.use((req, res, next) => {
  // 60秒のタイムアウト
  req.setTimeout(60000, () => {
    console.error(`Request timeout: ${req.method} ${req.url}`);
    if (!res.headersSent) {
      res.status(408).json({
        error: 'REQUEST_TIMEOUT',
        message: 'Request timeout'
      });
    }
  });
  next();
});

// データベース初期化
initializeDatabase();
seedDefaultProject();
seedDummyWorkers();

// ヘルスチェックエンドポイント（認証不要）
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// 認証が必要なエンドポイント
app.use('/api', authMiddleware, workersRoutes);
app.use('/api', authMiddleware, eventsRoutes);
app.use('/api', authMiddleware, statsRoutes);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('========================================');
  console.log(`🚀 GS API Server running on http://0.0.0.0:${PORT}`);
  console.log(`✓ Accessible from: http://localhost:${PORT} and http://192.168.1.4:${PORT}`);
  console.log(`✓ Authentication enabled (API_KEY: ${process.env.API_KEY ? '***configured***' : 'development-api-key-12345'})`);
  console.log(`✓ Request timeout: 60 seconds`);
  console.log('========================================');
  console.log('');
  console.log('📋 Available endpoints:');
  console.log('  GET  /health                           - ヘルスチェック（認証不要）');
  console.log('  GET  /api/workers                      - 作業員マスタ取得');
  console.log('  POST /api/events                       - スキャンイベント受信');
  console.log('  GET  /api/projects/:id/events          - イベント履歴取得');
  console.log('  GET  /api/projects/:id/stats           - 統計情報取得');
  console.log('');
});

// サーバーのkeep-aliveタイムアウト設定
server.keepAliveTimeout = 65000; // 65秒
server.headersTimeout = 66000;   // 66秒（keepAliveTimeout + 1秒）
