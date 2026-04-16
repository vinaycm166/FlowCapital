import { Router } from 'express';
import { getProfile, updateProfile, changePassword, getEnterprises, inviteCorporate } from '../controllers/user';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/profile', getProfile);
router.patch('/profile', updateProfile);
router.post('/change-password', changePassword);

// Corporate discovery & invite routes (used by SME invoice form)
router.get('/enterprises', getEnterprises);
router.post('/invite', inviteCorporate);

export default router;
