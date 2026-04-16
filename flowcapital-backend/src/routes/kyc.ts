import { Router } from 'express';
import { submitKYC } from '../controllers/kyc';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.post('/submit', submitKYC);

export default router;
