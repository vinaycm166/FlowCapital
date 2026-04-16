import { Router } from 'express';
import { syncQuickBooks, syncXero } from '../controllers/erp';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.post('/quickbooks/sync', syncQuickBooks);
router.post('/xero/sync', syncXero);

export default router;
