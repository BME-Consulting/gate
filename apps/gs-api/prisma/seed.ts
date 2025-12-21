import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ==========================================
  // Seed Projects
  // ==========================================
  const projects = [
    {
      id: 'PRJ001',
      name: '東京建設現場A',
      gateMode: 'IN',
      serverLock: false,
      checkConfig: {
        ccusIdCheck: true,
        socialInsuranceCheck: true,
        residencyCheck: false,
        ageCheck: false,
        healthCheck: false,
        soleProprietorCheck: true,
      },
    },
    {
      id: 'PRJ002',
      name: '大阪建設現場B',
      gateMode: 'OUT',
      serverLock: true,
      checkConfig: {
        ccusIdCheck: false,
        socialInsuranceCheck: true,
        residencyCheck: true,
        ageCheck: true,
        healthCheck: false,
        soleProprietorCheck: false,
      },
    },
    {
      id: 'PRJ003',
      name: '名古屋建設現場C',
      gateMode: 'IN',
      serverLock: false,
      checkConfig: {
        ccusIdCheck: false,
        socialInsuranceCheck: false,
        residencyCheck: false,
        ageCheck: false,
        healthCheck: false,
        soleProprietorCheck: false,
      },
    },
  ];

  for (const projectData of projects) {
    const project = await prisma.project.upsert({
      where: { id: projectData.id },
      update: {
        name: projectData.name,
        gateMode: projectData.gateMode,
        serverLock: projectData.serverLock,
        checkConfig: projectData.checkConfig,
      },
      create: projectData,
    });

    console.log(`✅ Project created: ${project.name} (${project.id})`);
  }

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
  console.log(`   - ${projects.length} projects`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
