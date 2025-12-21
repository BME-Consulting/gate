import express from 'express';

const router = express.Router();

/**
 * GET /api/me/projects
 * ユーザーがアクセス可能なプロジェクト一覧を取得
 * 認証: OAuth 2.0 Bearer Token
 *
 * Step A: 仮データ返却（DB参照なし）
 * Step B: DB参照に置き換え（TODO）
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

    // Step A: ハードコードの仮データを返す（DB参照なし）
    const mockProjects = [
      {
        projectId: 'PRJ001',
        name: '東京建設現場A',
        gateMode: 'IN',
        checkConfig: {
          ccusIdCheck: true,
          socialInsuranceCheck: true,
          residencyCheck: false,
          ageCheck: false,
          healthCheck: false,
          soleProprietorCheck: true,
        },
        serverLock: false,
      },
      {
        projectId: 'PRJ002',
        name: '大阪建設現場B',
        gateMode: 'OUT',
        checkConfig: {
          ccusIdCheck: false,
          socialInsuranceCheck: true,
          residencyCheck: true,
          ageCheck: true,
          healthCheck: false,
          soleProprietorCheck: false,
        },
        serverLock: true,
      },
      {
        projectId: 'PRJ003',
        name: '名古屋建設現場C',
        gateMode: 'IN',
        checkConfig: {
          ccusIdCheck: false,
          socialInsuranceCheck: false,
          residencyCheck: false,
          ageCheck: false,
          healthCheck: false,
          soleProprietorCheck: false,
        },
        serverLock: false,
      },
    ];

    // ユーザーがアクセス可能なプロジェクトのみフィルタ
    const accessibleProjects = mockProjects.filter((project) =>
      projectIds.includes(project.projectId)
    );

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
