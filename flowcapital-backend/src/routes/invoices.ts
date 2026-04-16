import { Router } from 'express';
import { 
  createInvoice, 
  getInvoices, 
  getInvoiceById, 
  tokenizeInvoice, 
  getSMEAnalytics, 
  deleteInvoice, 
  acceptInvoice,
  declineInvoice,
  getAdminPendingInvoices,
  adminVerifyInvoice
} from '../controllers/invoices';
import { upload, scanInvoice, uploadAndCreateInvoice } from '../controllers/upload';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// ── File upload routes (with multer) ─────────────────────────────────────────
router.post('/scan', requireRole(['SME', 'ENTERPRISE', 'ADMIN']), upload.single('file'), scanInvoice);
router.post('/upload', requireRole(['SME', 'ENTERPRISE', 'ADMIN']), upload.single('file'), uploadAndCreateInvoice);

// ── Admin-only routes — MUST be before /:id to avoid route collision ──────────
router.get('/admin/pending', requireRole(['ADMIN']), getAdminPendingInvoices);
router.post('/admin/verify', requireRole(['ADMIN']), adminVerifyInvoice);

// ── Standard CRUD routes ──────────────────────────────────────────────────────
router.post('/', requireRole(['SME', 'ADMIN', 'ENTERPRISE']), createInvoice);
router.get('/', getInvoices);
router.get('/analytics', requireRole(['SME']), getSMEAnalytics);

// ── Dynamic :id routes — must come last ──────────────────────────────────────
router.get('/:id', getInvoiceById);
router.post('/:id/tokenize', requireRole(['ENTERPRISE']), tokenizeInvoice);
router.post('/:id/accept', requireRole(['ENTERPRISE', 'ADMIN']), acceptInvoice);
router.post('/:id/decline', requireRole(['ENTERPRISE', 'ADMIN']), declineInvoice);
router.delete('/:id', requireRole(['SME', 'ENTERPRISE', 'ADMIN']), deleteInvoice);

export default router;
