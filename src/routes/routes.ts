import { Router } from 'express';
const router = Router();

// Placeholder for routes endpoints
router.get('/', (req, res) => {
  res.json({
    success: true,
    data: { routes: [] }
  });
});

export default router;