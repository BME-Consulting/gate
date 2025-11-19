import express from 'express';
import { prisma } from '../lib/prisma';
import { EventRepository } from '../repositories';
import type { Stats } from '../types';

const router = express.Router();

// Repository初期化
const eventRepo = new EventRepository(prisma);

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

    // Repositoryから統計を取得
    const stats = await eventRepo.getStats(projectId, targetDate);

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
