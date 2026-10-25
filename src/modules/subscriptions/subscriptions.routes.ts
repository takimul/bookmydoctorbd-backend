import { Router } from 'express';
import { getSubscriptionPlans, getMySubscription } from './subscriptions.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

router.get('/plans', getSubscriptionPlans);
router.get('/my-status', authenticate, getMySubscription);

export default router;

