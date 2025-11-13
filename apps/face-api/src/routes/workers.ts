import express from 'express';
import {
  getAllWorkers,
  getWorkerById,
  addWorker,
  type Worker,
} from '../services/worker-service';

const router = express.Router();

// GET /api/workers - 全件取得
router.get('/', async (req, res) => {
  try {
    const workers = getAllWorkers();
    res.json({ workers });
  } catch (error: any) {
    console.error('Error in GET /workers:', error);
    res.status(500).json({
      error: error.message || 'Internal server error',
    });
  }
});

// GET /api/workers/:personId - ID指定取得
router.get('/:personId', async (req, res) => {
  try {
    const { personId } = req.params;
    const worker = getWorkerById(personId);

    if (!worker) {
      return res.status(404).json({
        error: `Worker with personId '${personId}' not found`,
      });
    }

    res.json(worker);
  } catch (error: any) {
    console.error('Error in GET /workers/:personId:', error);
    res.status(500).json({
      error: error.message || 'Internal server error',
    });
  }
});

// POST /api/workers - 作業員登録
router.post('/', async (req, res) => {
  try {
    const workerData: Worker = req.body;

    // 必須項目のバリデーション
    if (!workerData.personId || typeof workerData.personId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'personId is required and must be a string',
      });
    }

    if (!workerData.name || typeof workerData.name !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'name is required and must be a string',
      });
    }

    if (!workerData.company || typeof workerData.company !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'company is required and must be a string',
      });
    }

    // デフォルト値の設定
    const worker: Worker = {
      personId: workerData.personId,
      name: workerData.name,
      company: workerData.company,
      ccusId: workerData.ccusId,
      ccusRegistered: workerData.ccusRegistered ?? false,
      socialInsurance: workerData.socialInsurance ?? false,
      residencyExpiry: workerData.residencyExpiry,
      age: workerData.age,
      isSoleProprietor: workerData.isSoleProprietor ?? false,
      faceEmbedding: workerData.faceEmbedding,
      faceImageUrl: workerData.faceImageUrl,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // データベースに追加
    addWorker(worker);

    res.status(201).json({
      success: true,
      personId: worker.personId,
    });
  } catch (error: any) {
    console.error('Error in POST /workers:', error);

    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({
        success: false,
        error: 'Worker with this personId already exists',
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
});

export default router;
