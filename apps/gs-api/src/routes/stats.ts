import express from 'express';
import { db } from '../database/sqlite';
import type { Stats } from '../types';

const router = express.Router();

/**
 * GET /api/projects/:projectId/stats
 * 統計情報取得（今日の入退場数、現在場内人数）
 */
router.get('/projects/:projectId/stats', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { date: dateParam } = req.query;

    // 基準日（デフォルトは今日）
    const targetDate = dateParam
      ? new Date(dateParam as string)
      : new Date();

    targetDate.setHours(0, 0, 0, 0);
    const startOfDay = targetDate.toISOString();

    // 入場数取得
    const todayInResult = db.prepare(`
      SELECT COUNT(*) as count FROM scan_events
      WHERE project_id = ?
        AND decided_mode = 'IN'
        AND occurred_at >= ?
        AND transport_status = 'sent'
    `).get(projectId, startOfDay) as { count: number };

    // 退場数取得
    const todayOutResult = db.prepare(`
      SELECT COUNT(*) as count FROM scan_events
      WHERE project_id = ?
        AND decided_mode = 'OUT'
        AND occurred_at >= ?
        AND transport_status = 'sent'
    `).get(projectId, startOfDay) as { count: number };

    const todayIn = todayInResult.count || 0;
    const todayOut = todayOutResult.count || 0;
    const currentInSite = Math.max(0, todayIn - todayOut);

    const stats: Stats = {
      todayIn,
      todayOut,
      currentInSite,
    };

    res.json(stats);
  } catch (error: any) {
    console.error('Error in GET /api/projects/:projectId/stats:', error);
    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: error.message || 'Failed to fetch stats'
    });
  }
});

export default router;
