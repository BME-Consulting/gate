#!/usr/bin/env ts-node

/**
 * テスト用作業員データ（W001-W030）を Face API DBに登録するスクリプト
 */

const API_URL = 'http://192.168.1.4:8101/api/workers';
const API_KEY = 'development-api-key-12345';

interface Worker {
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

const companies = ['大成建設', '鹿島建設', '清水建設', '竹中工務店', '大林組'];
const lastNames = ['田中', '佐藤', '鈴木', '高橋', '渡辺', '伊藤', '山本', '中村', '小林', '加藤'];
const firstNames = ['太郎', '次郎', '三郎', '一郎', '健太', '大輔', '翔太', '拓也', '直樹', '和也'];

function randomChoice<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function generateWorker(index: number): Worker {
  const personId = `W${String(index + 1).padStart(3, '0')}`;
  const lastName = randomChoice(lastNames);
  const firstName = randomChoice(firstNames);
  const name = `${lastName} ${firstName}`;
  const ccusId = `CCUS${String(index + 1).padStart(6, '0')}`;
  const company = companies[index % companies.length];

  return {
    personId,
    name,
    company,
    ccusId,
    ccusRegistered: Math.random() > 0.1, // 90%はCCUS登録済み
    socialInsurance: Math.random() > 0.1, // 90%は社会保険加入
    residencyExpiry: '2025-12-31T00:00:00.000Z',
    age: 25 + Math.floor(Math.random() * 40), // 25〜64歳
    isSoleProprietor: Math.random() > 0.8, // 20%は一人親方
    faceEmbedding: undefined,
    faceImageUrl: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function registerWorker(worker: Worker): Promise<boolean> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify(worker),
    });

    if (!response.ok) {
      const errorData = await response.json();

      // 409 Conflict (既に存在する) はスキップ
      if (response.status === 409) {
        console.log(`⏭  ${worker.personId} - Already exists (skipping)`);
        return true;
      }

      console.error(`❌ ${worker.personId} - Error: ${errorData.error}`);
      return false;
    }

    console.log(`✅ ${worker.personId} - ${worker.name} (${worker.company})`);
    return true;
  } catch (error: any) {
    console.error(`❌ ${worker.personId} - Network error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 Starting worker registration...\n');
  console.log(`API URL: ${API_URL}`);
  console.log(`API Key: ${API_KEY}\n`);

  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < 30; i++) {
    const worker = generateWorker(i);
    const success = await registerWorker(worker);

    if (success) {
      successCount++;
    } else {
      failureCount++;
    }

    // API負荷軽減のため100ms待機
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n' + '='.repeat(50));
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Failure: ${failureCount}`);
  console.log(`⏭  Skipped: ${skippedCount}`);
  console.log('='.repeat(50));

  if (failureCount > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
