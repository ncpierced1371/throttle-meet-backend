import { Router } from 'express';
const router = Router();

// Placeholder for upload endpoints
router.post('/image', (req, res) => {
  res.json({
    success: true,
    message: 'Upload endpoint ready'
  });
});

export default router;