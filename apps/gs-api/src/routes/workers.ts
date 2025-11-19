import express from 'express';
import { prisma } from '../lib/prisma';
import { WorkerRepository } from '../repositories';
import type { Worker, WorkersResponse } from '../types';
import { oauthMiddleware } from '../middleware/oauth';

const router = express.Router();

// Repository初期化
const workerRepo = new WorkerRepository(prisma);

/**
 * GET /api/workers
 * 作業員マスタ取得（モバイルアプリ同期用）
 * 認証: OAuth 2.0 Bearer Token（本番環境）/ API Key（開発環境）
 */
router.get('/workers', async (req, res) => {
  try {
    const { updatedAfter, limit = '1000', offset = '0' } = req.query;

    const limitNum = Math.min(1000, Math.max(1, Number(limit) || 100));
    const offsetNum = Math.max(0, Number(offset) || 0);

    // すべての作業員を取得
    const allWorkers = await workerRepo.findAll();

    // updatedAfterでフィルタリング
    let filteredWorkers = allWorkers;
    if (updatedAfter) {
      const afterDate = new Date(updatedAfter as string);
      filteredWorkers = allWorkers.filter(w => new Date(w.updatedAt) > afterDate);
    }

    // ページネーション
    const total = filteredWorkers.length;
    const paginatedWorkers = filteredWorkers.slice(offsetNum, offsetNum + limitNum);

    // Prisma結果をWorker型に変換
    const workers: Worker[] = paginatedWorkers.map((worker) => {
      let faceEmbedding: number[] | undefined = undefined;

      // faceEmbeddingのJSONパース
      if (worker.faceEmbedding) {
        try {
          faceEmbedding = worker.faceEmbedding as any;
        } catch (error) {
          console.error(`Failed to parse face_embedding for worker ${worker.personId}:`, error);
          faceEmbedding = undefined;
        }
      }

      return {
        personId: worker.personId,
        name: worker.name,
        company: worker.company,
        ccusId: worker.ccusId || undefined,
        ccusRegistered: worker.ccusRegistered,
        socialInsurance: worker.socialInsurance,
        residencyExpiry: worker.residencyExpiry?.toISOString() || undefined,
        age: worker.age || undefined,
        isSoleProprietor: worker.isSoleProprietor,
        faceEmbedding,
        faceImageUrl: worker.faceImageUrl || undefined,
        createdAt: worker.createdAt.toISOString(),
        updatedAt: worker.updatedAt.toISOString(),
      };
    });

    const response: WorkersResponse = {
      workers,
      total,
      updatedAt: new Date().toISOString(),
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error in GET /api/workers:', error);
    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: error.message || 'Failed to fetch workers'
    });
  }
});

export default router;
