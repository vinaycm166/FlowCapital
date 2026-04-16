import { Router } from 'express';
import { analyzeRisk } from '../controllers/risk';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.post('/analyze', requireRole(['SME', 'ADMIN']), analyzeRisk);

export default router;
