import { Router } from 'express';
import {
  bookAppointment,
  bookAppointmentByDoctor,
  getDoctorAppointments,
  getPatientAppointments,
  updateAppointmentStatus,
  getChamberSlots,
} from './appointments.controller';
import { authenticate, optionalAuthenticate } from '../../middlewares/auth.middleware';
import { requireRoles } from '../../middlewares/role.middleware';
import { Role } from '@prisma/client';

const router = Router();

// Public: Get available slots with capacity for a specific chamber and date
router.get('/chamber/:chamberId/slots', optionalAuthenticate, getChamberSlots);

// Public / Guest or logged-in patient booking
router.post('/book', optionalAuthenticate, bookAppointment);

// Doctor booking for walk-in/chamber patient
router.post('/doctor-book', authenticate, requireRoles(Role.DOCTOR), bookAppointmentByDoctor);

// Doctor-only appointments list
router.get('/doctor', authenticate, requireRoles(Role.DOCTOR), getDoctorAppointments);

// Patient-only appointments list
router.get('/patient', authenticate, requireRoles(Role.PATIENT, Role.GUEST), getPatientAppointments);

// Update status (Doctor, Admin, or Super Admin)
router.patch('/:id/status', authenticate, requireRoles(Role.DOCTOR, Role.ADMIN, Role.SUPER_ADMIN), updateAppointmentStatus);

export default router;
