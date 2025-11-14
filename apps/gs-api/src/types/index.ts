// ==========================================
// Worker型定義（モバイルアプリと完全互換）
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
  faceEmbedding?: number[];
  faceImageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// ScanEvent型定義（モバイルアプリと完全互換）
// ==========================================
export interface ScanEvent {
  id: string;
  projectId: string;
  personId: string;
  method: 'QR' | 'CARD' | 'FACE';
  gateMode: 'IN' | 'OUT';
  decidedMode: 'IN' | 'OUT';
  occurredAt: string;
  ruleResult: RuleResult;
  transport: TransportStatus;
}

export interface RuleResult {
  action: 'allow' | 'warn' | 'block';
  messages: string[];
  sendToCcus: boolean;
  includeInGs: boolean;
}

export interface TransportStatus {
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  lastError?: string;
  idempotencyKey: string;
}

// ==========================================
// Stats型定義
// ==========================================
export interface Stats {
  todayIn: number;
  todayOut: number;
  currentInSite: number;
}

// ==========================================
// API Response型定義
// ==========================================
export interface WorkersResponse {
  workers: Worker[];
  total: number;
  updatedAt: string;
}

export interface EventResponse {
  success: boolean;
  id: string;
  message: string;
}

export interface ErrorResponse {
  error: string;
  message: string;
  details?: any;
}
