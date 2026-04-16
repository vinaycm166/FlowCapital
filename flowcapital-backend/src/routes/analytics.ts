import { Router } from 'express';
import { getAnalytics, getBlockchainLogs } from '../controllers/analytics';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);
router.get('/', getAnalytics);
router.get('/blockchain', getBlockchainLogs);
export default router;
