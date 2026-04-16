import { Router } from 'express';
import { invest, settleInvoice, getInvestments, depositFunds, withdrawFunds, getTransactions, adminVerifyDeposit, getPendingDeposits, createRazorpayOrder, uploadProof } from '../controllers/payment';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();
router.use(authenticate);
router.post('/invest', requireRole(['INVESTOR']), invest);
router.get('/investments', requireRole(['INVESTOR']), getInvestments);
router.post('/deposit', requireRole(['INVESTOR']), depositFunds);
router.post('/withdraw', requireRole(['INVESTOR']), withdrawFunds);
router.get('/transactions', getTransactions);
router.post('/settle', requireRole(['ADMIN']), settleInvoice);
router.get('/admin/pending-deposits', requireRole(['ADMIN']), getPendingDeposits);
router.post('/verify-deposit', requireRole(['ADMIN']), adminVerifyDeposit);
router.post('/create-razorpay-order', requireRole(['INVESTOR']), createRazorpayOrder);
router.post('/upload-proof', requireRole(['INVESTOR']), uploadProof);
export default router;
