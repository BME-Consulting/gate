// ==========================================
// MCD3 通門管理 コア型定義
// ==========================================

/// <reference path="./global.d.ts" />

export type PersonId = string;
export type ProjectId = string;
export type UUID = string;

// ==========================================
// 読取方式
// ==========================================
export type ScanMethod = "QR" | "CARD" | "FACE";

// ==========================================
// 入退場モード
// ==========================================
// NOTE: AUTOモードはスコープアウト（アンチパスバック不要のため）
export type GateMode = "IN" | "OUT";
export type DecidedMode = "IN" | "OUT";

// ==========================================
// ルールアクション
// ==========================================
export type RuleAction = "block" | "warn" | "allow";

// ==========================================
// ルール結果
// ==========================================
export interface RuleResult {
  action: RuleAction;
  messages: string[];       // メッセージID配列
  sendToCcus: boolean;      // CCUS送信可否
  includeInGs: boolean;     // GS集計可否
}

// ==========================================
// スキャンイベント
// ==========================================
export interface ScanEvent {
  id: UUID;
  projectId: ProjectId;
  personId: PersonId;
  method: ScanMethod;
  gateMode: GateMode;
  decidedMode: DecidedMode;
  occurredAt: string;       // ISO8601
  ruleResult: RuleResult;
  transport: TransportStatus;
}

// ==========================================
// 送信ステータス
// ==========================================
export interface TransportStatus {
  status: "pending" | "sent" | "failed";
  attempts: number;
  lastError?: string;
  idempotencyKey: string;
}

// ==========================================
// 技能者情報（QR/CCUS共通）
// ==========================================
export interface WorkerInfo {
  personId: PersonId;
  name: string;
  company: string;
  ccusId?: string;                  // CCUS技能者ID
  ccusRegistered: boolean;          // CCUS登録状況
  socialInsurance: boolean;         // 社会保険加入
  residencyStatus?: ResidencyStatus; // 在留資格
  age?: number;
  healthFlags?: string[];           // 健康注意フラグ
  isSoleProprietor: boolean;        // 一人親方
}

// ==========================================
// 在留資格
// ==========================================
export interface ResidencyStatus {
  expiryDate?: string;  // ISO8601
  workPermit: boolean;  // 就労可否
}

// ==========================================
// チェック設定
// ==========================================
export interface CheckConfig {
  ccusIdCheck: boolean;         // CCUS技能者IDチェック ON/OFF
  socialInsuranceCheck: boolean; // 社会保険チェック ON/OFF
  residencyCheck: boolean;       // 在留期限チェック ON/OFF
  ageCheck: boolean;             // 年齢チェック ON/OFF
  healthCheck: boolean;          // 健康チェック ON/OFF
  soleProprietorCheck: boolean;  // 一人親方チェック ON/OFF
}

// ==========================================
// プロジェクト設定
// ==========================================
export interface ProjectConfig {
  projectId: ProjectId;
  name: string;
  gateMode: GateMode;           // 現在の入退場モード
  scanMethodLock?: ScanMethod;  // null = 切替可
  gateModeLock?: GateMode;      // null = 切替可
  checkConfig: CheckConfig;
  serverLock: boolean;          // サーバロック
}

// ==========================================
// メッセージマスター
// ==========================================
export type MessageId = string;
export type MessageMap = Record<MessageId, string>;

// ==========================================
// 作業員マスタ
// ==========================================
export interface Worker {
  personId: string;
  name: string;
  company: string;
  ccusId?: string;
  ccusRegistered: boolean;
  socialInsurance: boolean;
  residencyExpiry?: string;
  age?: number;
  isSoleProprietor: boolean;
  faceEmbedding?: number[]; // 512次元ベクトル
  faceImageUrl?: string;
  createdAt: string;
  updatedAt: string;
}
