import { Router } from 'express';
import { tokenizeInvoice, getMarketplace, invest } from '../controllers/marketplace';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.post('/tokenize', requireRole(['SME', 'ADMIN']), tokenizeInvoice);
router.get('/', getMarketplace);
router.post('/invest', requireRole(['INVESTOR', 'ADMIN']), invest);

export default router;
