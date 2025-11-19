import { PrismaClient, Worker, Prisma } from '@prisma/client';
import { toJsonValue } from '../types/prisma';

export class WorkerRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * すべての作業員を取得
   */
  async findAll(): Promise<Worker[]> {
    return this.prisma.worker.findMany({
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * 作業員IDで検索
   */
  async findById(personId: string): Promise<Worker | null> {
    return this.prisma.worker.findUnique({
      where: { personId },
    });
  }

  /**
   * CCUS IDで検索
   */
  async findByCcusId(ccusId: string): Promise<Worker | null> {
    return this.prisma.worker.findUnique({
      where: { ccusId },
    });
  }

  /**
   * 作業員を作成
   */
  async create(data: Omit<Worker, 'createdAt' | 'updatedAt'>): Promise<Worker> {
    const createData: Prisma.WorkerCreateInput = {
      personId: data.personId,
      name: data.name,
      company: data.company,
      ccusId: data.ccusId,
      ccusRegistered: data.ccusRegistered,
      socialInsurance: data.socialInsurance,
      residencyExpiry: data.residencyExpiry,
      age: data.age,
      isSoleProprietor: data.isSoleProprietor,
      faceEmbedding: data.faceEmbedding ? toJsonValue(data.faceEmbedding) : Prisma.JsonNull,
      faceImageUrl: data.faceImageUrl,
    };

    return this.prisma.worker.create({
      data: createData,
    });
  }

  /**
   * 作業員を更新
   */
  async update(personId: string, data: Partial<Omit<Worker, 'personId' | 'createdAt' | 'updatedAt'>>): Promise<Worker> {
    const updateData: Prisma.WorkerUpdateInput = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.company !== undefined) updateData.company = data.company;
    if (data.ccusId !== undefined) updateData.ccusId = data.ccusId;
    if (data.ccusRegistered !== undefined) updateData.ccusRegistered = data.ccusRegistered;
    if (data.socialInsurance !== undefined) updateData.socialInsurance = data.socialInsurance;
    if (data.residencyExpiry !== undefined) updateData.residencyExpiry = data.residencyExpiry;
    if (data.age !== undefined) updateData.age = data.age;
    if (data.isSoleProprietor !== undefined) updateData.isSoleProprietor = data.isSoleProprietor;
    if (data.faceEmbedding !== undefined) updateData.faceEmbedding = data.faceEmbedding ? toJsonValue(data.faceEmbedding) : Prisma.JsonNull;
    if (data.faceImageUrl !== undefined) updateData.faceImageUrl = data.faceImageUrl;

    return this.prisma.worker.update({
      where: { personId },
      data: updateData,
    });
  }

  /**
   * 最終更新日時を取得
   */
  async getLastUpdatedAt(): Promise<Date | null> {
    const worker = await this.prisma.worker.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    });

    return worker?.updatedAt || null;
  }
}
