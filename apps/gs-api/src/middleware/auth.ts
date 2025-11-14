import { Request, Response, NextFunction } from 'express';

/**
 * API Key認証ミドルウェア
 *
 * 以下のいずれかの方法でAPIキーを受け取る:
 * 1. x-api-key ヘッダー
 * 2. Authorization: ApiKey {key} ヘッダー
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // 環境変数からAPIキーを取得（本番環境では必須）
  const validApiKey = process.env.API_KEY;

  // 本番環境でAPIキーが設定されていない場合はエラー
  if (process.env.NODE_ENV === 'production' && !validApiKey) {
    console.error('FATAL: API_KEY environment variable is not set in production');
    return res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Server configuration error'
    });
  }

  // 開発環境用のデフォルトキー（本番では使用されない）
  const apiKey = validApiKey || 'development-api-key-12345';

  // リクエストからAPIキーを取得
  const requestApiKey =
    req.headers['x-api-key'] as string ||
    (req.headers['authorization'] as string)?.replace(/^ApiKey\s+/i, '');

  if (requestApiKey !== apiKey) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Invalid API key'
    });
  }

  next();
}
