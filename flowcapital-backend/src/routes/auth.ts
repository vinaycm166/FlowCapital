import { Router } from 'express';
import { signup, login, getWallet } from '../controllers/auth';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/signup', signup);
router.post('/login', login);
router.get('/wallet', authenticate, getWallet);

export default router;
