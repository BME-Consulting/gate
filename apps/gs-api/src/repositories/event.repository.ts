import { PrismaClient, ScanEvent } from '@prisma/client';
import type { ScanEvent as ScanEventDTO } from '../types';
import { toJsonValue } from '../types/prisma';

export class EventRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * イベントを作成
   */
  async create(event: ScanEventDTO): Promise<ScanEvent> {
    return this.prisma.scanEvent.create({
      data: {
        id: event.id,
        projectId: event.projectId,
        personId: event.personId,
        method: event.method,
        gateMode: event.gateMode,
        decidedMode: event.decidedMode,
        occurredAt: new Date(event.occurredAt),
        ruleResult: toJsonValue(event.ruleResult),
        transportStatus: event.transport.status,
        transportAttempts: event.transport.attempts,
        transportLastError: event.transport.lastError,
        transportIdempotencyKey: event.transport.idempotencyKey,
      },
    });
  }

  /**
   * 冪等キーでイベントを検索
   */
  async findByIdempotencyKey(key: string): Promise<ScanEvent | null> {
    return this.prisma.scanEvent.findUnique({
      where: { transportIdempotencyKey: key },
    });
  }

  /**
   * プロジェクトのイベント履歴を取得
   */
  async findByProject(
    projectId: string,
    filters: {
      dateFrom?: string;
      dateTo?: string;
      decidedMode?: string;
      limit: number;
      offset: number;
    }
  ): Promise<{ events: ScanEvent[]; total: number }> {
    const where: any = { projectId };

    if (filters.dateFrom) {
      where.occurredAt = { ...where.occurredAt, gte: new Date(filters.dateFrom) };
    }

    if (filters.dateTo) {
      where.occurredAt = { ...where.occurredAt, lte: new Date(filters.dateTo) };
    }

    if (filters.decidedMode) {
      where.decidedMode = filters.decidedMode;
    }

    const [events, total] = await Promise.all([
      this.prisma.scanEvent.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        take: filters.limit,
        skip: filters.offset,
      }),
      this.prisma.scanEvent.count({ where }),
    ]);

    return { events, total };
  }

  /**
   * 統計情報を取得
   */
  async getStats(
    projectId: string,
    date: Date
  ): Promise<{
    todayIn: number;
    todayOut: number;
    currentInSite: number;
  }> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const stats = await this.prisma.scanEvent.groupBy({
      by: ['decidedMode'],
      where: {
        projectId,
        occurredAt: { gte: startOfDay },
        transportStatus: 'sent',
      },
      _count: { id: true },
    });

    let todayIn = 0;
    let todayOut = 0;

    stats.forEach((stat) => {
      if (stat.decidedMode === 'IN') todayIn = stat._count.id;
      if (stat.decidedMode === 'OUT') todayOut = stat._count.id;
    });

    return {
      todayIn,
      todayOut,
      currentInSite: Math.max(0, todayIn - todayOut),
    };
  }

  /**
   * 最新イベントを取得
   */
  async getLatestEvent(projectId: string): Promise<ScanEvent | null> {
    return this.prisma.scanEvent.findFirst({
      where: { projectId, transportStatus: 'sent' },
      orderBy: { occurredAt: 'desc' },
    });
  }
}
