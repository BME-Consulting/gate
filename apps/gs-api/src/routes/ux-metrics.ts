import express from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

const router = express.Router();

/**
 * UX Metrics イベントペイロードのZodスキーマ
 */
const UxMetricEventSchema = z.object({
  // 誰が/どの現場か
  projectId: z.string().optional(),
  tenantId: z.string().optional(),

  // イベント本体
  eventType: z.enum(['FACE_REGISTER', 'FACE_VERIFY']),
  result: z.enum(['success', 'fail']),
  failReason: z.enum([
    'quality_dark',
    'quality_blurred',
    'no_face',
    'network',
    'server',
    'camera',
    'not_registered',
  ]).optional(),

  // UX-2の数値（無いときはnull）
  brightnessScore: z.number().optional(),
  sharpnessScore: z.number().optional(),

  // 実行環境
  deviceModel: z.string().optional(),
  os: z.string().optional(),
  osVersion: z.string().optional(),
  appVersion: z.string().optional(),
  buildId: z.string().optional(),
  runtimeVersion: z.string().optional(),

  // 通信経路の切り分け
  apiRoute: z.enum(['tunnel_url', 'lan_url']),
  faceApiBaseUrl: z.string().optional(),
  gsApiBaseUrl: z.string().optional(),

  // デバッグ最小
  durationMs: z.number().optional(),
  httpStatus: z.number().optional(),
  errorMessage: z.string().optional(),

  // 1リクエスト単位の相関ID
  sessionId: z.string().optional(),
  requestId: z.string().optional(),
});

type UxMetricEventPayload = z.infer<typeof UxMetricEventSchema>;

/**
 * POST /api/ux-metrics
 * UX計測イベント受信（モバイルアプリから送信）
 */
router.post('/ux-metrics', async (req, res) => {
  try {
    // Zodバリデーション
    const validationResult = UxMetricEventSchema.safeParse(req.body);

    if (!validationResult.success) {
      console.error('❌ UX Metrics validation failed:', validationResult.error);
      return res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Invalid UX metric event payload',
        details: validationResult.error.issues,
      });
    }

    const payload = validationResult.data;

    // Prismaで保存
    const uxEvent = await prisma.uxMetricEvent.create({
      data: {
        projectId: payload.projectId ?? null,
        tenantId: payload.tenantId ?? null,
        eventType: payload.eventType,
        result: payload.result,
        failReason: payload.failReason ?? null,
        brightnessScore: payload.brightnessScore ?? null,
        sharpnessScore: payload.sharpnessScore ?? null,
        deviceModel: payload.deviceModel ?? null,
        os: payload.os ?? null,
        osVersion: payload.osVersion ?? null,
        appVersion: payload.appVersion ?? null,
        buildId: payload.buildId ?? null,
        runtimeVersion: payload.runtimeVersion ?? null,
        apiRoute: payload.apiRoute,
        faceApiBaseUrl: payload.faceApiBaseUrl ?? null,
        gsApiBaseUrl: payload.gsApiBaseUrl ?? null,
        durationMs: payload.durationMs ?? null,
        httpStatus: payload.httpStatus ?? null,
        errorMessage: payload.errorMessage ?? null,
        sessionId: payload.sessionId ?? null,
        requestId: payload.requestId ?? null,
      },
    });

    console.log(`✅ UX Metric event created: ${uxEvent.id} (${payload.eventType}/${payload.result})`);

    res.status(201).json({
      success: true,
      id: uxEvent.id,
      message: 'UX metric event received successfully',
    });
  } catch (error: any) {
    console.error('Error in POST /api/ux-metrics:', error);
    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: error.message || 'Failed to create UX metric event',
    });
  }
});

/**
 * GET /api/ux-metrics/stats
 * UX計測統計取得（24h失敗率、分布など）
 */
router.get('/ux-metrics/stats', async (req, res) => {
  try {
    const { projectId, hours = '24' } = req.query;

    const hoursNum = Math.min(168, Math.max(1, Number(hours) || 24)); // 最大7日間
    const since = new Date(Date.now() - hoursNum * 60 * 60 * 1000);

    // 失敗理由の分布
    const failDistribution = await prisma.uxMetricEvent.groupBy({
      by: ['failReason'],
      where: {
        projectId: projectId as string | undefined,
        result: 'fail',
        createdAt: { gte: since },
      },
      _count: {
        id: true,
      },
    });

    // イベントタイプ別の成功/失敗数
    const eventTypeStats = await prisma.uxMetricEvent.groupBy({
      by: ['eventType', 'result'],
      where: {
        projectId: projectId as string | undefined,
        createdAt: { gte: since },
      },
      _count: {
        id: true,
      },
    });

    // 品質スコアの統計（p50, p90）
    const brightnessScores = await prisma.uxMetricEvent.findMany({
      where: {
        projectId: projectId as string | undefined,
        brightnessScore: { not: null },
        createdAt: { gte: since },
      },
      select: { brightnessScore: true },
      orderBy: { brightnessScore: 'asc' },
    });

    const sharpnessScores = await prisma.uxMetricEvent.findMany({
      where: {
        projectId: projectId as string | undefined,
        sharpnessScore: { not: null },
        createdAt: { gte: since },
      },
      select: { sharpnessScore: true },
      orderBy: { sharpnessScore: 'asc' },
    });

    // パーセンタイル計算
    const calculatePercentile = (values: number[], percentile: number): number | null => {
      if (values.length === 0) return null;
      const index = Math.floor(values.length * (percentile / 100));
      return values[index];
    };

    const brightnessValues = brightnessScores
      .map((s) => s.brightnessScore)
      .filter((v): v is number => v !== null);
    const sharpnessValues = sharpnessScores
      .map((s) => s.sharpnessScore)
      .filter((v): v is number => v !== null);

    res.json({
      period: {
        hours: hoursNum,
        since: since.toISOString(),
      },
      failDistribution: failDistribution.map((item) => ({
        failReason: item.failReason,
        count: item._count.id,
      })),
      eventTypeStats: eventTypeStats.map((item) => ({
        eventType: item.eventType,
        result: item.result,
        count: item._count.id,
      })),
      qualityScores: {
        brightness: {
          p50: calculatePercentile(brightnessValues, 50),
          p90: calculatePercentile(brightnessValues, 90),
          count: brightnessValues.length,
        },
        sharpness: {
          p50: calculatePercentile(sharpnessValues, 50),
          p90: calculatePercentile(sharpnessValues, 90),
          count: sharpnessValues.length,
        },
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/ux-metrics/stats:', error);
    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: error.message || 'Failed to fetch UX metric stats',
    });
  }
});

export default router;
