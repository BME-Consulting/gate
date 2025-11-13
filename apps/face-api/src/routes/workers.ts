import express from 'express';
const router = express.Router();

// GET /api/workers - 全件取得
router.get('/', async (req, res) => {
  // TODO: 実装
  res.json({ workers: [] });
});

// POST /api/workers - 作業員登録
router.post('/', async (req, res) => {
  // TODO: 実装
  res.json({ success: true });
});

export default router;
