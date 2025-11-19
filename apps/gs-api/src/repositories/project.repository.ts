import { PrismaClient, Project, Prisma } from '@prisma/client';
import { toJsonValue } from '../types/prisma';

export class ProjectRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * プロジェクトIDで検索
   */
  async findById(id: string): Promise<Project | null> {
    return this.prisma.project.findUnique({
      where: { id },
    });
  }

  /**
   * すべてのプロジェクトを取得
   */
  async findAll(): Promise<Project[]> {
    return this.prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * プロジェクトを作成
   */
  async create(data: Omit<Project, 'createdAt' | 'updatedAt'>): Promise<Project> {
    const createData: Prisma.ProjectCreateInput = {
      id: data.id,
      name: data.name,
      gateMode: data.gateMode,
      scanMethodLock: data.scanMethodLock,
      gateModeLock: data.gateModeLock,
      checkConfig: toJsonValue(data.checkConfig),
      serverLock: data.serverLock,
    };

    return this.prisma.project.create({
      data: createData,
    });
  }

  /**
   * プロジェクトを更新
   */
  async update(id: string, data: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Project> {
    const updateData: Prisma.ProjectUpdateInput = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.gateMode !== undefined) updateData.gateMode = data.gateMode;
    if (data.scanMethodLock !== undefined) updateData.scanMethodLock = data.scanMethodLock;
    if (data.gateModeLock !== undefined) updateData.gateModeLock = data.gateModeLock;
    if (data.checkConfig !== undefined) updateData.checkConfig = toJsonValue(data.checkConfig);
    if (data.serverLock !== undefined) updateData.serverLock = data.serverLock;

    return this.prisma.project.update({
      where: { id },
      data: updateData,
    });
  }
}
