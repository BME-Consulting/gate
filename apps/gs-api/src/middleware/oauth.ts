import { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { webcrypto } from 'node:crypto';

// Node.js 18+ の Web Crypto API を jose が利用できるようにする
if (!globalThis.crypto) {
  (globalThis as any).crypto = webcrypto;
}

/**
 * OAuth 2.0 Bearer認証ミドルウェア
 *
 * 開発環境: MOCK_AUTH=true でモックトークンを受け入れる
 * 本番環境: MOCK_AUTH=false で Keycloak JWKS署名検証（RS256）
 *
 * Step C-1: 形式/iss/exp チェック（署名検証なし） ✅
 * Step C-2: JWKS署名検証（RS256） ✅
 */

// 環境変数
const ISSUER = process.env.AUTH_ISSUER || 'https://auth-gate-prod.bme-service.monster/realms/mcd3';
const AUDIENCE = process.env.AUTH_AUDIENCE || 'mc-gate';
const JWKS_URL = process.env.AUTH_JWKS_URL || 'https://auth-gate-prod.bme-service.monster/realms/mcd3/protocol/openid-connect/certs';

// JWKS エンドポイント（jose が内部でキャッシュ＆レート制御）
let JWKS: ReturnType<typeof createRemoteJWKSet> | null = null;

// JWKS初期化（MOCK_AUTH=false の場合のみ）
if (process.env.MOCK_AUTH !== 'true') {
  try {
    JWKS = createRemoteJWKSet(new URL(JWKS_URL));
    console.log(`[OAuth Middleware] JWKS endpoint configured: ${JWKS_URL}`);
  } catch (error) {
    console.error('[OAuth Middleware] Failed to configure JWKS endpoint:', error);
  }
}

/**
 * 検証済みユーザー情報
 */
export interface VerifiedUser {
  sub: string;
  name?: string;
  email?: string;
  preferred_username?: string;
  resource_access?: any;
  payload: JWTPayload;
  roles: string[];
}

/**
 * Bearer トークンを抽出
 */
function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

/**
 * JWT アクセストークンを検証
 *
 * @param req - Express Request オブジェクト
 * @returns 検証済みユーザー情報
 * @throws 401 エラー（トークンが無効な場合）
 */
export async function verifyAccessToken(req: Request): Promise<VerifiedUser> {
  const token = extractBearerToken(req.headers['authorization']);

  if (!token) {
    const err: any = new Error('Missing Authorization Bearer token');
    err.status = 401;
    throw err;
  }

  // MOCK_AUTH=true: モック認証（開発用）
  if (process.env.MOCK_AUTH === 'true') {
    console.log(`[OAuth Middleware] MOCK_AUTH enabled - accepting token: ${token.substring(0, 20)}...`);

    const mockPayload: JWTPayload = {
      sub: 'dev-user-1',
      name: 'Development User',
      email: 'dev@example.com',
      preferred_username: 'dev-user',
    };

    return {
      sub: 'dev-user-1',
      name: 'Development User',
      email: 'dev@example.com',
      preferred_username: 'dev-user',
      payload: mockPayload,
      roles: [], // routes/projects.ts で mockRoles を使用
    };
  }

  // MOCK_AUTH=false: JWKS署名検証
  if (!JWKS) {
    const err: any = new Error('JWKS endpoint not configured');
    err.status = 500;
    throw err;
  }

  try {
    // jose による JWKS 署名検証（RS256）
    // - 署名検証
    // - issuer 検証
    // - audience 検証
    // - exp / nbf 検証
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    const sub = payload.sub;
    if (!sub) {
      const err: any = new Error('JWT missing sub claim');
      err.status = 401;
      throw err;
    }

    // Keycloak roles 抽出: resource_access["mc-gate-mobile"].roles または resource_access["mc-gate"].roles
    const mcGateMobileRoles = (payload as any)?.resource_access?.['mc-gate-mobile']?.roles ?? [];
    const mcGateRoles = (payload as any)?.resource_access?.['mc-gate']?.roles ?? [];
    const roles = mcGateMobileRoles.length > 0 ? mcGateMobileRoles : mcGateRoles;

    console.log(`[OAuth Middleware] JWT verified: sub=${sub}, roles=${JSON.stringify(roles)} (from ${mcGateMobileRoles.length > 0 ? 'mc-gate-mobile' : 'mc-gate'})`);

    return {
      sub,
      name: (payload as any).name,
      email: (payload as any).email,
      preferred_username: (payload as any).preferred_username,
      resource_access: (payload as any).resource_access,
      payload,
      roles,
    };

  } catch (error: any) {
    // 署名検証失敗、issuer/audience 不一致、有効期限切れ、など
    console.error('[OAuth Middleware] JWT verification failed:', error.message);

    const err: any = new Error('Invalid token');
    err.status = 401;
    err.cause = error?.message ?? String(error);
    throw err;
  }
}

/**
 * OAuth認証ミドルウェア
 *
 * Express middleware として使用
 */
export async function oauthMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await verifyAccessToken(req);

    // req.user に検証済みユーザー情報を格納
    (req as any).user = user;

    next();

  } catch (error: any) {
    const status = error.status || 401;
    const message = error.message || 'Unauthorized';

    return res.status(status).json({
      error: status === 401 ? 'UNAUTHORIZED' : 'INTERNAL_SERVER_ERROR',
      message,
    });
  }
}
