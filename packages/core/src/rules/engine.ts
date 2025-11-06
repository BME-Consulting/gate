// ==========================================
// MCD3 通門管理 ルールエンジン
// ==========================================

import type {
  WorkerInfo,
  CheckConfig,
  RuleResult,
  RuleAction,
} from "../types/index.js";

// ==========================================
// ルールエンジン
// ==========================================
export class RuleEngine {
  constructor(private checkConfig: CheckConfig) {}

  /**
   * 技能者情報をチェックしてルール結果を返す
   */
  evaluate(worker: WorkerInfo): RuleResult {
    const messages: string[] = [];
    let action: RuleAction = "allow";
    let sendToCcus = true;
    let includeInGs = true;

    // ==========================================
    // Rule 1: CCUS技能者ID未登録チェック
    // ==========================================
    if (this.checkConfig.ccusIdCheck && !worker.ccusRegistered) {
      action = "block";
      sendToCcus = false;
      includeInGs = false;
      messages.push("msg.ccus.unregistered");
    } else if (!worker.ccusRegistered) {
      // チェックOFF時は警告のみ、CCUS送信はするがGS集計には含めない
      if (action === "allow") action = "warn";
      messages.push("msg.ccus.unregistered.warn");
      sendToCcus = true;
      includeInGs = false;
    }

    // ==========================================
    // Rule 2: 在留期限・就労可否チェック
    // ==========================================
    if (this.checkConfig.residencyCheck && worker.residencyStatus) {
      const { expiryDate, workPermit } = worker.residencyStatus;

      // 就労不可
      if (!workPermit) {
        action = "block";
        sendToCcus = false;
        includeInGs = false;
        messages.push("msg.residency.workPermitInvalid");
      }

      // 在留期限切れ
      if (expiryDate) {
        const expiry = new Date(expiryDate);
        const now = new Date();
        if (expiry < now) {
          action = "block";
          sendToCcus = false;
          includeInGs = false;
          messages.push("msg.residency.expired");
        }
      }
    }

    // ブロックされている場合、以降のチェックはスキップ
    if (action === "block") {
      return { action, messages, sendToCcus, includeInGs };
    }

    // ==========================================
    // Rule 3: 社会保険未加入チェック
    // ==========================================
    if (this.checkConfig.socialInsuranceCheck && !worker.socialInsurance) {
      if (action === "allow") action = "warn";
      messages.push("msg.socialInsurance.none");
      // 送信○、集計○（警告のみ）
    }

    // ==========================================
    // Rule 4: 年齢チェック（年少者/高齢者）
    // ==========================================
    if (this.checkConfig.ageCheck && worker.age !== undefined) {
      if (worker.age < 18) {
        if (action === "allow") action = "warn";
        messages.push("msg.age.minor");
      } else if (worker.age >= 65) {
        if (action === "allow") action = "warn";
        messages.push("msg.age.senior");
      }
    }

    // ==========================================
    // Rule 5: 健康注意フラグ
    // ==========================================
    if (
      this.checkConfig.healthCheck &&
      worker.healthFlags &&
      worker.healthFlags.length > 0
    ) {
      if (action === "allow") action = "warn";
      messages.push("msg.health.notice");
    }

    // ==========================================
    // Rule 6: 一人親方
    // ==========================================
    if (this.checkConfig.soleProprietorCheck && worker.isSoleProprietor) {
      if (action === "allow") action = "warn";
      messages.push("msg.soleProprietor");
    }

    return {
      action,
      messages,
      sendToCcus,
      includeInGs,
    };
  }

  /**
   * チェック設定を更新
   */
  updateConfig(config: Partial<CheckConfig>): void {
    this.checkConfig = { ...this.checkConfig, ...config };
  }
}
