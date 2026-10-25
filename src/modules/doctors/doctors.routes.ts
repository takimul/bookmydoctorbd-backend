import { Router } from 'express';
import {
  searchDoctors,
  getDoctorById,
  getSpecialtiesList,
  getLocationsList,
  getDoctorMe,
  updateDoctorProfile,
  addOrUpdateChamber,
  deleteChamber,
  addDoctorLeave,
  uploadDoctorMedia,
} from './doctors.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireRoles } from '../../middlewares/role.middleware';
import { Role } from '@prisma/client';

const router = Router();

// Public routes
router.get('/', searchDoctors);
router.get('/specialties/list', getSpecialtiesList);
router.get('/locations/list', getLocationsList);
router.get('/me/profile', authenticate, requireRoles(Role.DOCTOR), getDoctorMe);
router.get('/:id', getDoctorById);

// Protected Doctor routes
router.patch('/profile', authenticate, requireRoles(Role.DOCTOR), updateDoctorProfile);
router.post('/chambers', authenticate, requireRoles(Role.DOCTOR), addOrUpdateChamber);
router.delete('/chambers/:id', authenticate, requireRoles(Role.DOCTOR), deleteChamber);
router.post('/leaves', authenticate, requireRoles(Role.DOCTOR), addDoctorLeave);
router.post('/upload', authenticate, requireRoles(Role.DOCTOR), uploadDoctorMedia);

export default router;
