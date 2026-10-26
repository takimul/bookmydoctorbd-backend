import { Router } from 'express';
import {
  createDoctorManually,
  getAllDoctorsAdmin,
  updateDoctorVerification,
  assignDoctorSubscription,
  getAdminAnalytics,
  getAllUsersAdmin,
  toggleUserStatusAdmin,
  changeUserRoleAdmin,
  resetUserPasswordAdmin,
  getAllAppointmentsAdmin,
  updateAppointmentStatusAdmin,
  deleteDoctorAdmin,
} from './admin.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireRoles } from '../../middlewares/role.middleware';
import { Role } from '@prisma/client';

const router = Router();

// Only Super Admin & Admin can access admin routes
router.use(authenticate, requireRoles(Role.SUPER_ADMIN, Role.ADMIN));

// Analytics overview
router.get('/analytics', getAdminAnalytics);

// Doctor management
router.post('/doctors/create', createDoctorManually);
router.get('/doctors', getAllDoctorsAdmin);
router.patch('/doctors/:id/verify', updateDoctorVerification);
router.post('/doctors/:id/assign-subscription', assignDoctorSubscription);
router.delete('/doctors/:id', deleteDoctorAdmin);

// User & Role oversight
router.get('/users', getAllUsersAdmin);
router.patch('/users/:id/status', toggleUserStatusAdmin);
router.patch('/users/:id/role', changeUserRoleAdmin);
router.post('/users/:id/reset-password', resetUserPasswordAdmin);

// Platform appointments oversight
router.get('/appointments', getAllAppointmentsAdmin);
router.patch('/appointments/:id/status', updateAppointmentStatusAdmin);

export default router;
