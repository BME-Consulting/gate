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

    console.log(`[Face Register] Request received for personId: ${personId}`);
    console.log(`[Face Register] Image data length: ${imageData?.length || 0} bytes`);

    // バリデーション
    if (!personId || typeof personId !== 'string') {
      console.log('[Face Register] Error: personId missing or invalid');
      return res.status(400).json({
        success: false,
        error: 'personId is required and must be a string',
      });
    }

    if (!imageData || typeof imageData !== 'string') {
      console.log('[Face Register] Error: imageData missing or invalid');
      return res.status(400).json({
        success: false,
        error: 'imageData is required and must be a base64 string',
      });
    }

    // 作業員が存在するか確認
    const worker = getWorkerById(personId);
    if (!worker) {
      console.log(`[Face Register] Error: Worker ${personId} not found in database`);
      return res.status(404).json({
        success: false,
        error: `Worker with personId '${personId}' not found`,
      });
    }

    console.log(`[Face Register] Worker found: ${worker.name} (${worker.company})`);
    console.log('[Face Register] Extracting face embedding...');

    // 顔エンコーディングを抽出
    const embedding = await extractFaceEmbedding(imageData);

    if (!embedding) {
      console.log('[Face Register] Error: No face detected in the image');
      return res.status(400).json({
        success: false,
        error: 'No face detected in the image',
      });
    }

    console.log(`[Face Register] Face embedding extracted: ${embedding.length} dimensions`);

    // データベースに保存
    updateFaceEmbedding(personId, embedding);

    console.log(`[Face Register] ✅ Success: Face registered for ${personId}`);

    res.json({
      success: true,
      person_id: personId,  // モバイルアプリはsnake_caseを期待
      embedding_dimensions: embedding.length,
    });
  } catch (error: any) {
    console.error('Error in /register:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
});

// POST /api/face/verify - 顔認証（1:1 Verify）
router.post('/verify', async (req, res) => {
  try {
    const { personId, imageData } = req.body;

    console.log(`[Face Verify] Request received for personId: ${personId}`);
    console.log(`[Face Verify] Image data length: ${imageData?.length || 0} bytes`);

    // バリデーション
    if (!personId || typeof personId !== 'string') {
      console.log('[Face Verify] Error: personId missing or invalid');
      return res.status(400).json({
        success: false,
        error_code: 'INVALID_PERSON_ID',
        error_message: 'personId is required and must be a string',
      });
    }

    if (!imageData || typeof imageData !== 'string') {
      console.log('[Face Verify] Error: imageData missing or invalid');
      return res.status(400).json({
        success: false,
        error_code: 'INVALID_IMAGE_DATA',
        error_message: 'imageData is required and must be a base64 string',
      });
    }

    // 作業員が存在するか確認
    const worker = getWorkerById(personId);
    if (!worker) {
      console.log(`[Face Verify] Error: Worker ${personId} not found in database`);
      return res.status(404).json({
        success: false,
        error_code: 'WORKER_NOT_FOUND',
        error_message: `Worker with person_id '${personId}' not found`,
      });
    }

    console.log(`[Face Verify] Worker found: ${worker.name} (${worker.company})`);

    // 既存の顔エンベディングがあるか確認
    if (!worker.faceEmbedding || worker.faceEmbedding.length === 0) {
      console.log(`[Face Verify] Error: Face embedding not registered for ${personId}`);
      return res.status(404).json({
        success: false,
        error_code: 'FACE_EMBEDDING_NOT_FOUND',
        error_message: `Face embedding for person_id '${personId}' not found`,
      });
    }

    console.log(`[Face Verify] Stored embedding dimensions: ${worker.faceEmbedding.length}`);
    console.log('[Face Verify] Extracting face embedding from input image...');

    // 入力画像から顔エンベディングを抽出
    const inputEmbedding = await extractFaceEmbedding(imageData);

    if (!inputEmbedding) {
      console.log('[Face Verify] Error: No face detected in the input image');
      return res.status(400).json({
        success: false,
        error_code: 'FACE_NOT_DETECTED',
        error_message: 'No face detected in the image',
      });
    }

    console.log(`[Face Verify] Input embedding extracted: ${inputEmbedding.length} dimensions`);

    // 距離計算
    const distance = calculateDistance(worker.faceEmbedding, inputEmbedding);

    // 閾値（環境変数 FACE_VERIFY_THRESHOLD または FACE_THRESHOLD）
    const threshold = parseFloat(process.env.FACE_VERIFY_THRESHOLD || process.env.FACE_THRESHOLD || '0.6');
    const matched = isSamePerson(distance, threshold);

    console.log(
      `[Face Verify] person_id=${personId} distance=${distance.toFixed(4)} threshold=${threshold} matched=${matched}`
    );

    // レスポンス（snake_case）
    res.json({
      success: true,
      mode: 'verify',
      person_id: personId,
      distance: parseFloat(distance.toFixed(4)),
      threshold,
      matched,
      embedding_dimensions: inputEmbedding.length,
      model_version: 'face-api.js:v1',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error in /verify:', error);
    res.status(500).json({
      success: false,
      error_code: 'INTERNAL_SERVER_ERROR',
      error_message: error.message || 'Internal server error',
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
