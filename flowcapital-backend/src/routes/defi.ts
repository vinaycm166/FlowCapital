import { Router } from 'express';
import { depositLiquidity, getPools } from '../controllers/defi';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.post('/deposit', requireRole(['INVESTOR']), depositLiquidity);
router.get('/pools', getPools);

export default router;
