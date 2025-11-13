import express from 'express';
const router = express.Router();

// POST /api/face/register - 顔登録
router.post('/register', async (req, res) => {
  // TODO: 後で実装
  res.json({ success: true });
});

// POST /api/face/recognize - 顔認識
router.post('/recognize', async (req, res) => {
  // TODO: 後で実装
  res.json({ personId: null, confidence: 0 });
});

export default router;
