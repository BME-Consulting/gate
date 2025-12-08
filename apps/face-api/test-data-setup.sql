-- E2Eテスト用テストデータ
-- シナリオ1: allow（正常入場） - Aさん
INSERT OR REPLACE INTO workers (person_id, name, company, ccus_id, ccus_registered, social_insurance, residency_expiry, age, is_sole_proprietor, created_at, updated_at)
VALUES ('E2E_ALLOW', 'E2E太郎（正常）', 'テスト建設株式会社', 'CCUS-A001', 1, 1, '2025-12-31T00:00:00.000Z', 30, 0, datetime('now'), datetime('now'));

-- シナリオ2: warn（警告付き入場） - Bさん（社会保険未加入）
INSERT OR REPLACE INTO workers (person_id, name, company, ccus_id, ccus_registered, social_insurance, residency_expiry, age, is_sole_proprietor, created_at, updated_at)
VALUES ('E2E_WARN', 'E2E次郎（警告）', 'テスト建設株式会社', 'CCUS-B001', 1, 0, '2025-12-31T00:00:00.000Z', 30, 0, datetime('now'), datetime('now'));

-- シナリオ3: block（入場不可） - Cさん（CCUS未登録）
INSERT OR REPLACE INTO workers (person_id, name, company, ccus_id, ccus_registered, social_insurance, residency_expiry, age, is_sole_proprietor, created_at, updated_at)
VALUES ('E2E_BLOCK', 'E2E三郎（ブロック）', 'テスト建設株式会社', NULL, 0, 1, '2025-12-31T00:00:00.000Z', 30, 0, datetime('now'), datetime('now'));

-- 確認用クエリ
SELECT person_id, name, ccus_registered, social_insurance, age FROM workers WHERE person_id LIKE 'E2E_%';
