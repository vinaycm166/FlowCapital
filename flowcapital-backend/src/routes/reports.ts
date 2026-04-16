import { Router } from 'express';
import { investorPortfolioReport, enterpriseInvoiceReport } from '../controllers/reports';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/portfolio', requireRole(['INVESTOR']), investorPortfolioReport);
router.get('/invoices', requireRole(['ENTERPRISE', 'ADMIN']), enterpriseInvoiceReport);

export default router;
