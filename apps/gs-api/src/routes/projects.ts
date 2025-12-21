import express from 'express';
import { prisma } from '../lib/prisma';

const router = express.Router();

/**
 * GET /api/me/projects
 * ユーザーがアクセス可能なプロジェクト一覧を取得
 * 認証: OAuth 2.0 Bearer Token
 *
 * Step B: DB参照（Prisma経由でpostgresql.projectsから取得）
 * - JWT の resource_access["mc-gate"].roles から project:XXX を抽出
 * - DBに無いprojectIdは黙って落とす（WARNログ）
 * - プロジェクト0件でも200を返す（403にしない）
 */
router.get('/me/projects', async (req, res) => {
  try {
    // モックユーザー情報を取得（oauthMiddleware経由）
    const user = (req as any).user;

    console.log('[GET /api/me/projects] User:', user);

    // JWT から resource_access["mc-gate"].roles を抽出
    // MOCK_AUTH=true の場合は仮データのロールを使用
    const mockRoles = ['project:PRJ001', 'project:PRJ002'];
    const roles = user?.resource_access?.['mc-gate']?.roles || mockRoles;

    console.log('[GET /api/me/projects] Roles:', roles);

    // project:XXX 形式のロールからプロジェクトIDを抽出
    const projectIds = roles
      .filter((role: string) => role.startsWith('project:'))
      .map((role: string) => role.replace('project:', ''));

    console.log('[GET /api/me/projects] Project IDs:', projectIds);

    // Step B: DBからプロジェクトを取得
    const projectsFromDb = await prisma.project.findMany({
      where: {
        id: {
          in: projectIds,
        },
      },
      orderBy: {
        id: 'asc',
      },
    });

    // DBに無いprojectIdは黙って落とす（WARNログ）
    const foundIds = projectsFromDb.map((p) => p.id);
    const missingIds = projectIds.filter((id) => !foundIds.includes(id));

    if (missingIds.length > 0) {
      console.warn('[GET /api/me/projects] Missing project IDs in DB:', missingIds);
    }

    // Prisma結果をAPI用のフォーマットに変換
    const accessibleProjects = projectsFromDb.map((p) => ({
      projectId: p.id,  // DB上は `id`、API では `projectId` として返す
      name: p.name,
      gateMode: p.gateMode,
      checkConfig: p.checkConfig,  // JSON as-is
      serverLock: p.serverLock,
    }));

    // プロジェクトが0件の場合でも空配列を返す（404にしない）
    const response = {
      projects: accessibleProjects,
      defaultProjectId: accessibleProjects.length > 0 ? accessibleProjects[0].projectId : undefined,
      fetchedAt: new Date().toISOString(),
    };

    console.log('[GET /api/me/projects] Response:', {
      projectCount: response.projects.length,
      defaultProjectId: response.defaultProjectId,
    });

    res.json(response);
  } catch (error: any) {
    console.error('Error in GET /api/me/projects:', error);
    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: error.message || 'Failed to fetch projects',
    });
  }
});

export default router;
