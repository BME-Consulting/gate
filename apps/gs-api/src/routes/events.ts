import express from 'express';
import { db } from '../database/sqlite';
import type { ScanEvent, EventResponse } from '../types';

const router = express.Router();

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
    const existing = db.prepare(
      'SELECT id FROM scan_events WHERE transport_idempotency_key = ?'
    ).get(event.transport.idempotencyKey);

    if (existing) {
      console.log(`Event already exists (idempotent): ${event.id}`);
      return res.status(200).json({
        success: true,
        id: event.id,
        message: 'Event already exists (idempotent)'
      } as EventResponse);
    }

    // 作業員存在チェック
    const worker = db.prepare('SELECT person_id FROM workers WHERE person_id = ?').get(event.personId);
    if (!worker) {
      return res.status(400).json({
        error: 'INVALID_EVENT_DATA',
        message: `Worker not found: ${event.personId}`,
        details: { field: 'personId', issue: 'Worker does not exist' }
      });
    }

    // プロジェクト存在チェック
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(event.projectId);
    if (!project) {
      return res.status(400).json({
        error: 'INVALID_EVENT_DATA',
        message: `Project not found: ${event.projectId}`,
        details: { field: 'projectId', issue: 'Project does not exist' }
      });
    }

    // イベント保存
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO scan_events (
        id, project_id, person_id, method, gate_mode, decided_mode,
        occurred_at, rule_result, transport_status, transport_attempts,
        transport_last_error, transport_idempotency_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id,
      event.projectId,
      event.personId,
      event.method,
      event.gateMode,
      event.decidedMode,
      event.occurredAt,
      JSON.stringify(event.ruleResult),
      event.transport.status,
      event.transport.attempts,
      event.transport.lastError ?? null,
      event.transport.idempotencyKey,
      now,
      now
    );

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

    let query = 'SELECT * FROM scan_events WHERE project_id = ?';
    const params: any[] = [projectId];

    if (dateFrom) {
      query += ' AND occurred_at >= ?';
      params.push(dateFrom);
    }

    if (dateTo) {
      query += ' AND occurred_at <= ?';
      params.push(dateTo);
    }

    if (decidedMode) {
      query += ' AND decided_mode = ?';
      params.push(decidedMode);
    }

    query += ' ORDER BY occurred_at DESC LIMIT ? OFFSET ?';
    const limitNum = Math.min(1000, Math.max(1, Number(limit) || 100));
    const offsetNum = Math.max(0, Number(offset) || 0);
    params.push(limitNum, offsetNum);

    const rows = db.prepare(query).all(...params);

    // 総数取得
    let countQuery = 'SELECT COUNT(*) as count FROM scan_events WHERE project_id = ?';
    const countParams: any[] = [projectId];

    if (dateFrom) {
      countQuery += ' AND occurred_at >= ?';
      countParams.push(dateFrom);
    }

    if (dateTo) {
      countQuery += ' AND occurred_at <= ?';
      countParams.push(dateTo);
    }

    if (decidedMode) {
      countQuery += ' AND decided_mode = ?';
      countParams.push(decidedMode);
    }

    const { count } = db.prepare(countQuery).get(...countParams) as { count: number };

    // 行をScanEvent型に変換
    const events: ScanEvent[] = rows.map((row: any) => ({
      id: row.id,
      projectId: row.project_id,
      personId: row.person_id,
      method: row.method,
      gateMode: row.gate_mode,
      decidedMode: row.decided_mode,
      occurredAt: row.occurred_at,
      ruleResult: JSON.parse(row.rule_result),
      transport: {
        status: row.transport_status,
        attempts: row.transport_attempts,
        lastError: row.transport_last_error ?? undefined,
        idempotencyKey: row.transport_idempotency_key,
      },
    }));

    res.json({
      events,
      total: count,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
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
