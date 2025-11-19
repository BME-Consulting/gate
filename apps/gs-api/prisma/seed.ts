import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ==========================================
  // Seed Default Project
  // ==========================================
  const project = await prisma.project.upsert({
    where: { id: 'PRJ001' },
    update: {},
    create: {
      id: 'PRJ001',
      name: 'デフォルトプロジェクト',
      gateMode: 'IN',
      checkConfig: {
        checkCcusRegistration: false,
        checkSocialInsurance: false,
        checkResidencyExpiry: false,
        checkAge: false,
        checkFaceRecognition: false,
      },
    },
  });

  console.log(`✅ Project created: ${project.name} (${project.id})`);

  // ==========================================
  // Seed Dummy Workers
  // ==========================================
  const workers = [
    {
      personId: 'W001',
      name: '山田太郎',
      company: '株式会社サンプル建設',
      ccusId: 'CCUS001',
      ccusRegistered: true,
      socialInsurance: true,
      age: 35,
    },
    {
      personId: 'W002',
      name: '佐藤花子',
      company: '株式会社テスト工務店',
      ccusId: 'CCUS002',
      ccusRegistered: true,
      socialInsurance: true,
      age: 28,
    },
    {
      personId: 'W003',
      name: '鈴木一郎',
      company: '鈴木建設',
      ccusId: null,
      ccusRegistered: false,
      socialInsurance: true,
      age: 42,
    },
    {
      personId: 'W004',
      name: '田中次郎',
      company: '田中工業',
      ccusId: 'CCUS004',
      ccusRegistered: true,
      socialInsurance: false,
      age: 31,
    },
    {
      personId: 'W005',
      name: '高橋三郎',
      company: '高橋建築',
      ccusId: null,
      ccusRegistered: false,
      socialInsurance: false,
      age: 25,
    },
  ];

  for (const workerData of workers) {
    const worker = await prisma.worker.upsert({
      where: { personId: workerData.personId },
      update: {},
      create: {
        ...workerData,
        isSoleProprietor: false,
      },
    });

    console.log(`✅ Worker created: ${worker.name} (${worker.personId})`);
  }

  console.log('');
  console.log('✅ Seeding completed successfully!');
  console.log(`   - ${workers.length} workers`);
  console.log(`   - 1 project`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
