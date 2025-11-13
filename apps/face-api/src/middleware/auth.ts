import { Request, Response, NextFunction } from 'express';

// 簡易的なAPIキー認証（本番ではJWT/OAuth推奨）
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

  // 環境変数からAPIキーを取得
  const validApiKey = process.env.API_KEY || 'development-api-key-12345';

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Provide X-API-Key or Authorization header.'
    });
  }

  if (apiKey !== validApiKey) {
    return res.status(403).json({
      success: false,
      error: 'Invalid API key'
    });
  }

  next();
}
