import { Router } from 'express';
import {
  bookAppointment,
  bookAppointmentByDoctor,
  getDoctorAppointments,
  getPatientAppointments,
  updateAppointmentStatus,
} from './appointments.controller';
import { authenticate, optionalAuthenticate } from '../../middlewares/auth.middleware';
import { requireRoles } from '../../middlewares/role.middleware';
import { Role } from '@prisma/client';

const router = Router();

// Guest or logged-in booking
router.post('/book', optionalAuthenticate, bookAppointment);

// Doctor booking for walk-in/chamber patient
router.post('/doctor-book', authenticate, requireRoles(Role.DOCTOR), bookAppointmentByDoctor);

// Doctor appointments
router.get('/doctor', authenticate, getDoctorAppointments);

// Patient appointments
router.get('/patient', authenticate, getPatientAppointments);

// Update status (Doctor or Admin)
router.patch('/:id/status', authenticate, updateAppointmentStatus);

export default router;
