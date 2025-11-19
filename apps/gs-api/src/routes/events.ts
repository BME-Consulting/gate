import express from 'express';
import { prisma } from '../lib/prisma';
import { EventRepository, WorkerRepository, ProjectRepository } from '../repositories';
import type { ScanEvent, EventResponse, RuleResult } from '../types';

const router = express.Router();

// Repository初期化
const eventRepo = new EventRepository(prisma);
const workerRepo = new WorkerRepository(prisma);
const projectRepo = new ProjectRepository(prisma);

/**
 * POST /api/events
 * スキャンイベント受信（モバイルアプリから送信）
 */
router.post('/events', async (req, res) => {
  try {
    const event: ScanEvent = req.body;

    // バリデーション
    if (!event.id || !event.projectId || !event.personId) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Required fields missing: id, projectId, personId'
      });
    }

    // 冪等性チェック
    const existing = await eventRepo.findByIdempotencyKey(event.transport.idempotencyKey);

    if (existing) {
      console.log(`Event already exists (idempotent): ${event.id}`);
      return res.status(200).json({
        success: true,
        id: event.id,
        message: 'Event already exists (idempotent)'
      } as EventResponse);
    }

    // 作業員存在チェック
    const worker = await workerRepo.findById(event.personId);
    if (!worker) {
      return res.status(400).json({
        error: 'INVALID_EVENT_DATA',
        message: `Worker not found: ${event.personId}`,
        details: { field: 'personId', issue: 'Worker does not exist' }
      });
    }

    // プロジェクト存在チェック
    const project = await projectRepo.findById(event.projectId);
    if (!project) {
      return res.status(400).json({
        error: 'INVALID_EVENT_DATA',
        message: `Project not found: ${event.projectId}`,
        details: { field: 'projectId', issue: 'Project does not exist' }
      });
    }

    // イベント保存
    await eventRepo.create(event);

    console.log(`✅ Event created successfully: ${event.id}`);

    res.status(201).json({
      success: true,
      id: event.id,
      message: 'Event received successfully'
    } as EventResponse);
  } catch (error: any) {
    console.error('Error in POST /api/events:', error);
    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: error.message || 'Failed to create event'
    });
  }
});

/**
 * GET /api/projects/:projectId/events
 * イベント履歴取得
 */
router.get('/projects/:projectId/events', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { dateFrom, dateTo, decidedMode, limit = '100', offset = '0' } = req.query;

    const limitNum = Math.min(1000, Math.max(1, Number(limit) || 100));
    const offsetNum = Math.max(0, Number(offset) || 0);

    const result = await eventRepo.findByProject(projectId, {
      dateFrom: dateFrom as string | undefined,
      dateTo: dateTo as string | undefined,
      decidedMode: decidedMode as string | undefined,
      limit: limitNum,
      offset: offsetNum,
    });

    // Prisma結果をScanEvent型に変換
    const events: ScanEvent[] = result.events.map((event) => ({
      id: event.id,
      projectId: event.projectId,
      personId: event.personId,
      method: event.method as 'QR' | 'CARD' | 'FACE',
      gateMode: event.gateMode as 'IN' | 'OUT',
      decidedMode: event.decidedMode as 'IN' | 'OUT',
      occurredAt: event.occurredAt.toISOString(),
      ruleResult: event.ruleResult as unknown as RuleResult,
      transport: {
        status: event.transportStatus as 'pending' | 'sent' | 'failed',
        attempts: event.transportAttempts,
        lastError: event.transportLastError || undefined,
        idempotencyKey: event.transportIdempotencyKey,
      },
    }));

    res.json({
      events,
      total: result.total,
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (error: any) {
    console.error('Error in GET /api/projects/:projectId/events:', error);
    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: error.message || 'Failed to fetch events'
    });
  }
});

export default router;
