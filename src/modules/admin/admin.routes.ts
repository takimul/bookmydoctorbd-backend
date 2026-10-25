import { Router } from 'express';
import {
  createDoctorManually,
  getAllDoctorsAdmin,
  updateDoctorVerification,
  assignDoctorSubscription,
  getAdminAnalytics,
} from './admin.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireRoles } from '../../middlewares/role.middleware';
import { Role } from '@prisma/client';

const router = Router();

// Only Super Admin & Admin can access admin routes
router.use(authenticate, requireRoles(Role.SUPER_ADMIN, Role.ADMIN));

router.post('/doctors/create', createDoctorManually);
router.get('/doctors', getAllDoctorsAdmin);
router.patch('/doctors/:id/verify', updateDoctorVerification);
router.post('/doctors/:id/assign-subscription', assignDoctorSubscription);
router.get('/analytics', getAdminAnalytics);

export default router;

