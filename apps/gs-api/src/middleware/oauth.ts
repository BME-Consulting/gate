import { Request, Response, NextFunction } from 'express';

/**
 * OAuth 2.0 Bearer認証ミドルウェア
 *
 * 開発環境: モックトークンを受け入れる（JWT検証なし）
 * 本番環境: Keycloak JWTを検証（未実装）
 */
export function oauthMiddleware(req: Request, res: Response, next: NextFunction) {
  // 1. Bearerトークンの抽出
  const authHeader = req.headers['authorization'];
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Missing authorization token'
    });
  }

  // 2. モック環境: トークン検証をスキップ
  if (process.env.MOCK_AUTH === 'true') {
    console.log(`[OAuth Middleware] MOCK_AUTH enabled - accepting token: ${token.substring(0, 20)}...`);

    // モックユーザー情報をreq.userに格納
    (req as any).user = {
      sub: 'dev-user-1',
      name: 'Development User',
      email: 'dev@example.com',
      preferred_username: 'dev-user',
    };

    return next();
  }

  // 3. 本番環境: JWT検証（Keycloak）
  // TODO: Keycloak Public Keyを使ったJWT検証を実装
  // - jwks-rsa ライブラリを使用
  // - Keycloak issuer URL から公開鍵を取得
  // - RS256アルゴリズムで署名検証
  // - 有効期限チェック
  // - issuer/audience 検証

  return res.status(501).json({
    error: 'NOT_IMPLEMENTED',
    message: 'JWT verification is not yet implemented. Set MOCK_AUTH=true for development.'
  });
}
