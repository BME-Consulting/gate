import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { prisma } from './lib/prisma';
import { authMiddleware } from './middleware/auth';
import workersRoutes from './routes/workers';
import eventsRoutes from './routes/events';
import statsRoutes from './routes/stats';
import uxMetricsRoutes from './routes/ux-metrics';
import projectsRoutes from './routes/projects';

const app = express();
const PORT = Number(process.env.PORT) || 7070;

// セキュリティヘッダー
app.use(helmet());

// CORS設定
const isDevelopment = process.env.NODE_ENV !== 'production';

if (isDevelopment) {
  app.use(cors({
    origin: '*',
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
  }));
  console.log('✓ CORS: Development mode - all origins allowed');
} else {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:19006',
    'http://localhost:8081',
  ]).filter(Boolean);

  app.use(cors({
    origin: (origin, callback) => {
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

// 圧縮
app.use(compression());

// レート制限
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 1000, // 最大1000リクエスト
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many requests from this IP, please try again later.',
  },
});
app.use(limiter);

// JSON解析
app.use(express.json({ limit: '50mb' }));

// リクエストタイムアウト
app.use((req, res, next) => {
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

// ヘルスチェックエンドポイント（認証不要）
app.get('/health', async (req, res) => {
  try {
    // データベース接続確認
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      database: 'connected',
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// OAuth認証が必要なエンドポイント（JWT トークンからプロジェクトロールを抽出）
// NOTE: 開発環境では MOCK_AUTH=true で動作（JWT検証スキップ）
// IMPORTANT: authMiddleware より先に登録（API Key チェックをスキップ）
import { oauthMiddleware } from './middleware/oauth';
app.use('/api', oauthMiddleware, projectsRoutes);

// API Key 認証が必要なエンドポイント
app.use('/api', authMiddleware, workersRoutes);
app.use('/api', authMiddleware, eventsRoutes);
app.use('/api', authMiddleware, statsRoutes);
app.use('/api', authMiddleware, uxMetricsRoutes);

// 404 ハンドラー
app.use((req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Cannot ${req.method} ${req.path}`,
  });
});

// エラーハンドラー
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: isDevelopment ? err.message : 'An error occurred',
  });
});

// サーバー起動
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('========================================');
  console.log(`🚀 GS API Server running on http://0.0.0.0:${PORT}`);
  console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✓ Database: PostgreSQL (${process.env.DATABASE_URL?.split('@')[1]?.split('?')[0] || 'localhost:5435/mc_gate'})`);
  console.log(`✓ Redis: ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
  console.log(`✓ Authentication: ${process.env.API_KEY ? 'Configured' : 'Development mode'}`);
  console.log('========================================');
  console.log('');
  console.log('📋 Available endpoints:');
  console.log('  GET  /health                           - ヘルスチェック（認証不要）');
  console.log('  GET  /api/workers                      - 作業員マスタ取得');
  console.log('  POST /api/events                       - スキャンイベント受信');
  console.log('  GET  /api/projects/:id/events          - イベント履歴取得');
  console.log('  GET  /api/projects/:id/stats           - 統計情報取得');
  console.log('  GET  /api/me/projects                  - ユーザープロジェクト一覧（OAuth）');
  console.log('  POST /api/ux-metrics                   - UX計測イベント受信');
  console.log('  GET  /api/ux-metrics/stats             - UX計測統計取得');
  console.log('');
});

// サーバー設定
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// グレースフルシャットダウン
const shutdown = async () => {
  console.log('\n🛑 Shutting down gracefully...');

  server.close(() => {
    console.log('✓ HTTP server closed');
  });

  try {
    await prisma.$disconnect();
    console.log('✓ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
