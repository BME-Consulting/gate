import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

/**
 * OAuth 2.0 Bearer認証ミドルウェア
 *
 * 開発環境: モックトークンを受け入れる（JWT検証なし）
 * 本番環境: Keycloak JWTを検証
 *
 * Step C-1: 形式/iss/exp チェック（署名検証なし）
 * Step C-2: JWKS署名検証（TODO）
 */
export function oauthMiddleware(req: Request, res: Response, next: NextFunction) {
  // 1. Bearerトークンの抽出
  const authHeader = req.headers['authorization'];

  // Authorization ヘッダーが無い → 401
  if (!authHeader) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Missing authorization header'
    });
  }

  // Bearer 形式でない → 401
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Invalid authorization header format. Expected: Bearer <token>'
    });
  }

  const token = authHeader.substring(7); // "Bearer " の7文字を除去

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

  // 3. Step C-1: 本番環境のJWT基本検証（署名検証なし）
  try {
    // JWT形式チェック（.が2個ない → 401）
    const parts = token.split('.');
    if (parts.length !== 3) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Invalid JWT format. Expected 3 parts separated by dots.'
      });
    }

    // JWTデコード（署名検証なし）
    const decoded = jwt.decode(token, { complete: true });

    if (!decoded || typeof decoded === 'string') {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Failed to decode JWT'
      });
    }

    const payload = decoded.payload as any;

    // issuerチェック
    const expectedIssuer = process.env.AUTH_ISSUER || 'https://auth-gate-prod.bme-service.monster/realms/mcd3';
    if (payload.iss !== expectedIssuer) {
      console.warn(`[OAuth Middleware] Invalid issuer: ${payload.iss} (expected: ${expectedIssuer})`);
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Invalid token issuer'
      });
    }

    // expチェック（有効期限切れ → 401）
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Token has expired'
      });
    }

    // ユーザー情報をreq.userに格納
    (req as any).user = {
      sub: payload.sub,
      name: payload.name,
      email: payload.email,
      preferred_username: payload.preferred_username,
      resource_access: payload.resource_access, // プロジェクトroles用
    };

    console.log(`[OAuth Middleware] JWT validated (no signature check): sub=${payload.sub}`);
    next();

  } catch (error: any) {
    console.error('[OAuth Middleware] JWT validation error:', error.message);
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Invalid JWT token'
    });
  }
}
