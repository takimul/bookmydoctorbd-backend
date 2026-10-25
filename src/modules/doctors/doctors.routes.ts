import { Router } from 'express';
import {
  searchDoctors,
  getDoctorById,
  getSpecialtiesList,
  getLocationsList,
  updateDoctorProfile,
  addOrUpdateChamber,
  addDoctorLeave,
} from './doctors.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireRoles } from '../../middlewares/role.middleware';
import { Role } from '@prisma/client';

const router = Router();

// Public routes
router.get('/', searchDoctors);
router.get('/specialties/list', getSpecialtiesList);
router.get('/locations/list', getLocationsList);
router.get('/:id', getDoctorById);

// Protected Doctor routes
router.patch('/profile', authenticate, requireRoles(Role.DOCTOR), updateDoctorProfile);
router.post('/chambers', authenticate, requireRoles(Role.DOCTOR), addOrUpdateChamber);
router.post('/leaves', authenticate, requireRoles(Role.DOCTOR), addDoctorLeave);

export default router;
