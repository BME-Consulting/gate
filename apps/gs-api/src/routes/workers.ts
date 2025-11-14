import express from 'express';
import { db } from '../database/sqlite';
import type { Worker, WorkersResponse } from '../types';

const router = express.Router();

/**
 * GET /api/workers
 * 作業員マスタ取得（モバイルアプリ同期用）
 */
router.get('/workers', async (req, res) => {
  try {
    const { updatedAfter, limit = '1000', offset = '0' } = req.query;

    let query = 'SELECT * FROM workers';
    const params: any[] = [];

    if (updatedAfter) {
      query += ' WHERE updated_at > ?';
      params.push(updatedAfter);
    }

    query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit as string), parseInt(offset as string));

    const rows = db.prepare(query).all(...params);

    // 総数を取得
    let countQuery = 'SELECT COUNT(*) as count FROM workers';
    const countParams: any[] = [];

    if (updatedAfter) {
      countQuery += ' WHERE updated_at > ?';
      countParams.push(updatedAfter);
    }

    const { count } = db.prepare(countQuery).get(...countParams) as { count: number };

    // 行をWorker型に変換
    const workers: Worker[] = rows.map((row: any) => {
      let faceEmbedding: number[] | undefined = undefined;

      // faceEmbeddingのJSONパースをエラーハンドリング
      if (row.face_embedding) {
        try {
          faceEmbedding = JSON.parse(row.face_embedding);
        } catch (error) {
          console.error(`Failed to parse face_embedding for worker ${row.person_id}:`, error);
          faceEmbedding = undefined;
        }
      }

      return {
        personId: row.person_id,
        name: row.name,
        company: row.company,
        ccusId: row.ccus_id || undefined,
        ccusRegistered: row.ccus_registered === 1,
        socialInsurance: row.social_insurance === 1,
        residencyExpiry: row.residency_expiry || undefined,
        age: row.age !== null ? row.age : undefined,
        isSoleProprietor: row.is_sole_proprietor === 1,
        faceEmbedding,
        faceImageUrl: row.face_image_url || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    const response: WorkersResponse = {
      workers,
      total: count,
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
