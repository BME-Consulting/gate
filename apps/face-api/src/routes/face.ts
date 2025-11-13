import express from 'express';
import {
  extractFaceEmbedding,
  calculateDistance,
  isSamePerson,
} from '../services/face-detection';
import {
  getWorkerById,
  updateFaceEmbedding,
  findWorkersByFaceEmbedding,
} from '../services/worker-service';

const router = express.Router();

// POST /api/face/register - 顔登録
router.post('/register', async (req, res) => {
  try {
    const { personId, imageData } = req.body;

    // バリデーション
    if (!personId || typeof personId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'personId is required and must be a string',
      });
    }

    if (!imageData || typeof imageData !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'imageData is required and must be a base64 string',
      });
    }

    // 作業員が存在するか確認
    const worker = getWorkerById(personId);
    if (!worker) {
      return res.status(404).json({
        success: false,
        error: `Worker with personId '${personId}' not found`,
      });
    }

    // 顔エンコーディングを抽出
    const embedding = await extractFaceEmbedding(imageData);

    if (!embedding) {
      return res.status(400).json({
        success: false,
        error: 'No face detected in the image',
      });
    }

    // データベースに保存
    updateFaceEmbedding(personId, embedding);

    res.json({
      success: true,
      personId,
      embeddingDimensions: embedding.length,
    });
  } catch (error: any) {
    console.error('Error in /register:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
});

// POST /api/face/recognize - 顔認識
router.post('/recognize', async (req, res) => {
  try {
    const { imageData, threshold } = req.body;

    // バリデーション
    if (!imageData || typeof imageData !== 'string') {
      return res.status(400).json({
        personId: null,
        confidence: 0,
        error: 'imageData is required and must be a base64 string',
      });
    }

    // 顔エンコーディングを抽出
    const inputEmbedding = await extractFaceEmbedding(imageData);

    if (!inputEmbedding) {
      return res.json({
        personId: null,
        confidence: 0,
        error: 'No face detected in the image',
      });
    }

    // 登録済みの作業員を取得
    const workers = findWorkersByFaceEmbedding();

    if (workers.length === 0) {
      return res.json({
        personId: null,
        confidence: 0,
        error: 'No registered workers with face embeddings',
      });
    }

    // 各作業員と距離を計算
    let bestMatch: { personId: string; distance: number; worker: any } | null = null;

    for (const worker of workers) {
      if (!worker.faceEmbedding) continue;

      const distance = calculateDistance(inputEmbedding, worker.faceEmbedding);

      if (bestMatch === null || distance < bestMatch.distance) {
        bestMatch = { personId: worker.personId, distance, worker };
      }
    }

    if (!bestMatch) {
      return res.json({
        personId: null,
        confidence: 0,
        error: 'No match found',
      });
    }

    // 閾値判定（デフォルト: 0.6、リクエストで変更可能）
    const matchThreshold = threshold || 0.6;
    const isMatch = isSamePerson(bestMatch.distance, matchThreshold);

    if (isMatch) {
      // マッチした場合
      res.json({
        personId: bestMatch.personId,
        confidence: 1 - bestMatch.distance, // 距離を信頼度に変換（0〜1）
        distance: bestMatch.distance,
        workerInfo: {
          name: bestMatch.worker.name,
          company: bestMatch.worker.company,
          ccusId: bestMatch.worker.ccusId,
        },
      });
    } else {
      // マッチしなかった場合
      res.json({
        personId: null,
        confidence: 0,
        distance: bestMatch.distance,
        error: `No match found (closest distance: ${bestMatch.distance.toFixed(3)}, threshold: ${matchThreshold})`,
      });
    }
  } catch (error: any) {
    console.error('Error in /recognize:', error);
    res.status(500).json({
      personId: null,
      confidence: 0,
      error: error.message || 'Internal server error',
    });
  }
});

export default router;
