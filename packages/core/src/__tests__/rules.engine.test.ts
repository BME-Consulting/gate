// ==========================================
// RuleEngine ユニットテスト（ホワイトボックス・全網羅）
// ==========================================

import { RuleEngine } from "../rules/engine";
import type { WorkerInfo, CheckConfig } from "../types/index";

describe("RuleEngine", () => {
  // ==========================================
  // テストヘルパー: デフォルト設定
  // ==========================================
  const defaultConfig: CheckConfig = {
    ccusIdCheck: true,
    socialInsuranceCheck: true,
    residencyCheck: true,
    ageCheck: true,
    healthCheck: true,
    soleProprietorCheck: true,
  };

  // ==========================================
  // テストヘルパー: 正常な技能者データ
  // ==========================================
  const validWorker: WorkerInfo = {
    personId: "W001",
    name: "山田太郎",
    company: "テスト建設株式会社",
    ccusRegistered: true,
    socialInsurance: true,
    age: 35,
    isSoleProprietor: false,
  };

  // ==========================================
  // Rule 1: CCUS技能者ID未登録チェック
  // ==========================================
  describe("Rule 1: CCUS登録チェック", () => {
    it("✅ 【正常系】CCUS登録済み → allow", () => {
      const engine = new RuleEngine(defaultConfig);
      const result = engine.evaluate(validWorker);

      expect(result.action).toBe("allow");
      expect(result.messages).not.toContain("msg.ccus.unregistered");
      expect(result.sendToCcus).toBe(true);
      expect(result.includeInGs).toBe(true);
    });

    it("❌ 【異常系】CCUS未登録 + チェックON → block", () => {
      const engine = new RuleEngine(defaultConfig);
      const worker: WorkerInfo = {
        ...validWorker,
        ccusRegistered: false,
      };

      const result = engine.evaluate(worker);

      expect(result.action).toBe("block");
      expect(result.messages).toContain("msg.ccus.unregistered");
      expect(result.sendToCcus).toBe(false);
      expect(result.includeInGs).toBe(false);
    });

    it("⚠️ 【警告系】CCUS未登録 + チェックOFF → warn", () => {
      const config: CheckConfig = {
        ...defaultConfig,
        ccusIdCheck: false,
      };
      const engine = new RuleEngine(config);
      const worker: WorkerInfo = {
        ...validWorker,
        ccusRegistered: false,
      };

      const result = engine.evaluate(worker);

      expect(result.action).toBe("warn");
      expect(result.messages).toContain("msg.ccus.unregistered.warn");
      expect(result.sendToCcus).toBe(true);
      expect(result.includeInGs).toBe(false);
    });
  });

  // ==========================================
  // Rule 2: 在留期限・就労可否チェック
  // ==========================================
  describe("Rule 2: 在留資格チェック", () => {
    it("✅ 【正常系】在留資格なし（日本人） → allow", () => {
      const engine = new RuleEngine(defaultConfig);
      const worker: WorkerInfo = {
        ...validWorker,
        residencyStatus: undefined,
      };

      const result = engine.evaluate(worker);

      expect(result.action).toBe("allow");
      expect(result.sendToCcus).toBe(true);
      expect(result.includeInGs).toBe(true);
    });

    it("✅ 【正常系】在留資格OK + 就労可 + 有効期限内 → allow", () => {
      const engine = new RuleEngine(defaultConfig);
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const worker: WorkerInfo = {
        ...validWorker,
        residencyStatus: {
          expiryDate: futureDate.toISOString(),
          workPermit: true,
        },
      };

      const result = engine.evaluate(worker);

      expect(result.action).toBe("allow");
      expect(result.sendToCcus).toBe(true);
      expect(result.includeInGs).toBe(true);
    });

    it("❌ 【異常系】就労不可 → block", () => {
      const engine = new RuleEngine(defaultConfig);
      const worker: WorkerInfo = {
        ...validWorker,
        residencyStatus: {
          expiryDate: "2030-12-31",
          workPermit: false,
        },
      };

      const result = engine.evaluate(worker);

      expect(result.action).toBe("block");
      expect(result.messages).toContain("msg.residency.workPermitInvalid");
      expect(result.sendToCcus).toBe(false);
      expect(result.includeInGs).toBe(false);
    });

    it("❌ 【異常系】在留期限切れ → block", () => {
      const engine = new RuleEngine(defaultConfig);
      const pastDate = new Date();
      pastDate.setFullYear(pastDate.getFullYear() - 1);

      const worker: WorkerInfo = {
        ...validWorker,
        residencyStatus: {
          expiryDate: pastDate.toISOString(),
          workPermit: true,
        },
      };

      const result = engine.evaluate(worker);

      expect(result.action).toBe("block");
      expect(result.messages).toContain("msg.residency.expired");
      expect(result.sendToCcus).toBe(false);
      expect(result.includeInGs).toBe(false);
    });

    it("✅ 【境界値】チェックOFF + 就労不可 → allow（チェックスキップ）", () => {
      const config: CheckConfig = {
        ...defaultConfig,
        residencyCheck: false,
      };
      const engine = new RuleEngine(config);
      const worker: WorkerInfo = {
        ...validWorker,
        residencyStatus: {
          expiryDate: "2030-12-31",
          workPermit: false,
        },
      };

      const result = engine.evaluate(worker);

      expect(result.action).toBe("allow");
      expect(result.sendToCcus).toBe(true);
      expect(result.includeInGs).toBe(true);
    });
  });

  // ==========================================
  // Rule 3: 社会保険未加入チェック
  // ==========================================
  describe("Rule 3: 社会保険チェック", () => {
    it("✅ 【正常系】社会保険加入済み → allow", () => {
      const engine = new RuleEngine(defaultConfig);
      const result = engine.evaluate(validWorker);

      expect(result.action).toBe("allow");
      expect(result.messages).not.toContain("msg.socialInsurance.none");
    });

    it("⚠️ 【警告系】社会保険未加入 + チェックON → warn", () => {
      const engine = new RuleEngine(defaultConfig);
      const worker: WorkerInfo = {
        ...validWorker,
        socialInsurance: false,
      };

      const result = engine.evaluate(worker);

      expect(result.action).toBe("warn");
      expect(result.messages).toContain("msg.socialInsurance.none");
      expect(result.sendToCcus).toBe(true);
      expect(result.includeInGs).toBe(true);
    });

    it("✅ 【境界値】チェックOFF + 未加入 → allow", () => {
      const config: CheckConfig = {
        ...defaultConfig,
        socialInsuranceCheck: false,
      };
      const engine = new RuleEngine(config);
      const worker: WorkerInfo = {
        ...validWorker,
        socialInsurance: false,
      };

      const result = engine.evaluate(worker);

      expect(result.action).toBe("allow");
      expect(result.messages).not.toContain("msg.socialInsurance.none");
    });
  });

  // ==========================================
  // Rule 4: 年齢チェック
  // ==========================================
  describe("Rule 4: 年齢チェック", () => {
    it("✅ 【正常系】年齢18〜64歳 → allow", () => {
      const engine = new RuleEngine(defaultConfig);
      const result = engine.evaluate(validWorker);

      expect(result.action).toBe("allow");
      expect(result.messages).toHaveLength(0);
    });

    it("⚠️ 【警告系】年齢17歳（年少者） → warn", () => {
      const engine = new RuleEngine(defaultConfig);
      const worker: WorkerInfo = {
        ...validWorker,
        age: 17,
      };

      const result = engine.evaluate(worker);

      expect(result.action).toBe("warn");
      expect(result.messages).toContain("msg.age.minor");
    });

    it("⚠️ 【警告系】年齢65歳（高齢者） → warn", () => {
      const engine = new RuleEngine(defaultConfig);
      const worker: WorkerInfo = {
        ...validWorker,
        age: 65,
      };

      const result = engine.evaluate(worker);

      expect(result.action).toBe("warn");
      expect(result.messages).toContain("msg.age.senior");
    });

    it("⚠️ 【境界値】年齢18歳（境界） → allow", () => {
      const engine = new RuleEngine(defaultConfig);
      const worker: WorkerInfo = {
        ...validWorker,
        age: 18,
      };

      const result = engine.evaluate(worker);

      expect(result.action).toBe("allow");
      expect(result.messages).not.toContain("msg.age.minor");
    });

    it("⚠️ 【境界値】年齢64歳（境界） → allow", () => {
      const engine = new RuleEngine(defaultConfig);
      const worker: WorkerInfo = {
        ...validWorker,
        age: 64,
      };

      const result = engine.evaluate(worker);

      expect(result.action).toBe("allow");
      expect(result.messages).not.toContain("msg.age.senior");
    });

    it("✅ 【境界値】年齢未設定 → allow", () => {
      const engine = new RuleEngine(defaultConfig);
      const worker: WorkerInfo = {
        ...validWorker,
        age: undefined,
      };

      const result = engine.evaluate(worker);

      expect(result.action).toBe("allow");
    });
  });

  // ==========================================
  // Rule 5: 健康注意フラグ
  // ==========================================
  describe("Rule 5: 健康チェック", () => {
    it("✅ 【正常系】健康フラグなし → allow", () => {
      const engine = new RuleEngine(defaultConfig);
      const worker: WorkerInfo = {
        ...validWorker,
        healthFlags: [],
      };

      const result = engine.evaluate(worker);

      expect(result.action).toBe("allow");
      expect(result.messages).not.toContain("msg.health.notice");
    });

    it("⚠️ 【警告系】健康フラグあり → warn", () => {
      const engine = new RuleEngine(defaultConfig);
      const worker: WorkerInfo = {
        ...validWorker,
        healthFlags: ["高血圧"],
      };

      const result = engine.evaluate(worker);

      expect(result.action).toBe("warn");
      expect(result.messages).toContain("msg.health.notice");
    });

    it("✅ 【境界値】チェックOFF + 健康フラグあり → allow", () => {
      const config: CheckConfig = {
        ...defaultConfig,
        healthCheck: false,
      };
      const engine = new RuleEngine(config);
      const worker: WorkerInfo = {
        ...validWorker,
        healthFlags: ["高血圧"],
      };

      const result = engine.evaluate(worker);

      expect(result.action).toBe("allow");
      expect(result.messages).not.toContain("msg.health.notice");
    });
  });

  // ==========================================
  // Rule 6: 一人親方チェック
  // ==========================================
  describe("Rule 6: 一人親方チェック", () => {
    it("✅ 【正常系】一人親方ではない → allow", () => {
      const engine = new RuleEngine(defaultConfig);
      const result = engine.evaluate(validWorker);

      expect(result.action).toBe("allow");
      expect(result.messages).not.toContain("msg.soleProprietor");
    });

    it("⚠️ 【警告系】一人親方 → warn", () => {
      const engine = new RuleEngine(defaultConfig);
      const worker: WorkerInfo = {
        ...validWorker,
        isSoleProprietor: true,
      };

      const result = engine.evaluate(worker);

      expect(result.action).toBe("warn");
      expect(result.messages).toContain("msg.soleProprietor");
    });

    it("✅ 【境界値】チェックOFF + 一人親方 → allow", () => {
      const config: CheckConfig = {
        ...defaultConfig,
        soleProprietorCheck: false,
      };
      const engine = new RuleEngine(config);
      const worker: WorkerInfo = {
        ...validWorker,
        isSoleProprietor: true,
      };

      const result = engine.evaluate(worker);

      expect(result.action).toBe("allow");
      expect(result.messages).not.toContain("msg.soleProprietor");
    });
  });

  // ==========================================
  // 複合ケース
  // ==========================================
  describe("複合ルールケース", () => {
    it("⚠️ 【複合警告】社会保険未加入 + 高齢者 → warn（複数メッセージ）", () => {
      const engine = new RuleEngine(defaultConfig);
      const worker: WorkerInfo = {
        ...validWorker,
        socialInsurance: false,
        age: 65,
      };

      const result = engine.evaluate(worker);

      expect(result.action).toBe("warn");
      expect(result.messages).toContain("msg.socialInsurance.none");
      expect(result.messages).toContain("msg.age.senior");
      expect(result.messages).toHaveLength(2);
    });

    it("❌ 【ブロック優先】CCUS未登録 + 社会保険未加入 → block（早期リターン）", () => {
      const engine = new RuleEngine(defaultConfig);
      const worker: WorkerInfo = {
        ...validWorker,
        ccusRegistered: false,
        socialInsurance: false,
      };

      const result = engine.evaluate(worker);

      expect(result.action).toBe("block");
      expect(result.messages).toContain("msg.ccus.unregistered");
      // 早期リターンにより社会保険チェックはスキップ
      expect(result.messages).not.toContain("msg.socialInsurance.none");
    });

    it("⚠️ 【全警告】社会保険・年齢・健康・一人親方すべて該当 → warn", () => {
      const engine = new RuleEngine(defaultConfig);
      const worker: WorkerInfo = {
        ...validWorker,
        socialInsurance: false,
        age: 17,
        healthFlags: ["高血圧"],
        isSoleProprietor: true,
      };

      const result = engine.evaluate(worker);

      expect(result.action).toBe("warn");
      expect(result.messages).toHaveLength(4);
      expect(result.messages).toContain("msg.socialInsurance.none");
      expect(result.messages).toContain("msg.age.minor");
      expect(result.messages).toContain("msg.health.notice");
      expect(result.messages).toContain("msg.soleProprietor");
    });
  });

  // ==========================================
  // updateConfig() メソッドのテスト
  // ==========================================
  describe("updateConfig() メソッド", () => {
    it("✅ 設定の部分更新ができる", () => {
      const engine = new RuleEngine(defaultConfig);

      engine.updateConfig({ ccusIdCheck: false });

      const worker: WorkerInfo = {
        ...validWorker,
        ccusRegistered: false,
      };

      const result = engine.evaluate(worker);

      expect(result.action).toBe("warn");
      expect(result.messages).toContain("msg.ccus.unregistered.warn");
    });

    it("✅ 複数設定の同時更新ができる", () => {
      const engine = new RuleEngine(defaultConfig);

      engine.updateConfig({
        socialInsuranceCheck: false,
        ageCheck: false,
      });

      const worker: WorkerInfo = {
        ...validWorker,
        socialInsurance: false,
        age: 17,
      };

      const result = engine.evaluate(worker);

      expect(result.action).toBe("allow");
      expect(result.messages).toHaveLength(0);
    });
  });
});
