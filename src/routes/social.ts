import { Router } from 'express';
const router = Router();

// Placeholder for social endpoints
router.get('/posts', (req, res) => {
  res.json({
    success: true,
    data: { posts: [] }
  });
});

export default router;