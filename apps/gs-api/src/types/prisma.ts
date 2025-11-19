import type { Prisma } from '@prisma/client';

/**
 * Prisma InputJsonValue型のエイリアス
 * JSON型のデータを安全に扱うための型定義
 */
export type JsonValue = Prisma.InputJsonValue;

/**
 * RuleResultをInputJsonValueに変換するヘルパー
 */
export function toJsonValue<T>(value: T): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

/**
 * Prisma CreateInput型のヘルパー
 * createdAtとupdatedAtを除外した型を作成
 */
export type CreateInput<T> = Omit<T, 'createdAt' | 'updatedAt'>;

/**
 * Prisma UpdateInput型のヘルパー
 * id, createdAt, updatedAtを除外した型を作成
 */
export type UpdateInput<T, K extends string = 'id'> = Partial<Omit<T, K | 'createdAt' | 'updatedAt'>>;
