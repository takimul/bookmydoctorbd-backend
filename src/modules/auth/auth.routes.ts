import { Router } from 'express';
import { register, login, requestGuestOtp, verifyGuestOtp, getMe } from './auth.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/guest-otp/request', requestGuestOtp);
router.post('/guest-otp/verify', verifyGuestOtp);
router.get('/me', authenticate, getMe);

export default router;
