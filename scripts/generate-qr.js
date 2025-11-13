#!/usr/bin/env node
// ==========================================
// QRコード生成スクリプト（M1フォーマット対応）
// ==========================================

const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

// サンプルデータ
const sampleWorkers = [
  {
    id: 'P001',
    name: '山田太郎',
    company: '株式会社ABC',
    ccusId: 'C12345',
    socialInsurance: true,
    residencyExpiry: '',
    age: 35,
    isSoleProprietor: false,
  },
  {
    id: 'P002',
    name: '佐藤次郎',
    company: '株式会社DEF',
    ccusId: '',  // CCUS未登録
    socialInsurance: true,
    residencyExpiry: '',
    age: 42,
    isSoleProprietor: false,
  },
  {
    id: 'P003',
    name: 'John Smith',
    company: '株式会社GHI',
    ccusId: 'C67890',
    socialInsurance: true,
    residencyExpiry: '2025-12-31',  // 外国人労働者
    age: 28,
    isSoleProprietor: false,
  },
  {
    id: 'P004',
    name: '鈴木三郎',
    company: '鈴木工務店',
    ccusId: 'C11111',
    socialInsurance: false,
    residencyExpiry: '',
    age: 55,
    isSoleProprietor: true,  // 一人親方
  },
  {
    id: 'P005',
    name: '田中四郎',
    company: '田中建設',
    ccusId: '',  // CCUS未登録
    socialInsurance: false,  // 社会保険未加入
    residencyExpiry: '',
    age: 48,
    isSoleProprietor: false,
  },
];

/**
 * M1フォーマットのQRコード文字列を生成
 */
function generateM1Format(worker) {
  return [
    'M1',
    worker.id,
    worker.name,
    worker.company,
    worker.ccusId,
    worker.socialInsurance ? '1' : '0',
    worker.residencyExpiry,
    worker.age ? String(worker.age) : '',
    worker.isSoleProprietor ? '1' : '0',
  ].join('|');
}

/**
 * QRコードを生成してファイルに保存
 */
async function generateQRCode(data, filename) {
  try {
    await QRCode.toFile(filename, data, {
      width: 300,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
    console.log(`✅ Generated: ${filename}`);
  } catch (error) {
    console.error(`❌ Error generating ${filename}:`, error.message);
  }
}

/**
 * シンプルフォーマット（personIdのみ）のQRコード生成
 */
async function generateSimpleQRCode(personId, filename) {
  try {
    await QRCode.toFile(filename, personId, {
      width: 300,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
    console.log(`✅ Generated: ${filename}`);
  } catch (error) {
    console.error(`❌ Error generating ${filename}:`, error.message);
  }
}

/**
 * メイン処理
 */
async function main() {
  const outputDir = path.join(__dirname, '../qr-codes');

  // 出力ディレクトリ作成
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('🔧 Generating QR codes...\n');

  // M1フォーマット（完全版）
  console.log('📋 M1 Format (Full Data):');
  for (const worker of sampleWorkers) {
    const data = generateM1Format(worker);
    const filename = path.join(outputDir, `${worker.id}_m1.png`);
    await generateQRCode(data, filename);
    console.log(`   Data: ${data}\n`);
  }

  // シンプルフォーマット（personIdのみ）
  console.log('\n📋 Simple Format (ID Only):');
  for (const worker of sampleWorkers) {
    const filename = path.join(outputDir, `${worker.id}_simple.png`);
    await generateSimpleQRCode(worker.id, filename);
    console.log(`   Data: ${worker.id}\n`);
  }

  console.log(`\n✅ All QR codes generated in: ${outputDir}`);
  console.log('\n📊 Summary:');
  console.log(`   - M1 format: ${sampleWorkers.length} files`);
  console.log(`   - Simple format: ${sampleWorkers.length} files`);
  console.log(`   - Total: ${sampleWorkers.length * 2} files`);
}

// 実行
main().catch(console.error);
