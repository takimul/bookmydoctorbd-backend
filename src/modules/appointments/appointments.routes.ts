import { Router } from 'express';
import {
  bookAppointment,
  getDoctorAppointments,
  getPatientAppointments,
  updateAppointmentStatus,
} from './appointments.controller';
import { authenticate, optionalAuthenticate } from '../../middlewares/auth.middleware';

const router = Router();

// Guest or logged-in booking
router.post('/book', optionalAuthenticate, bookAppointment);

// Doctor appointments
router.get('/doctor', authenticate, getDoctorAppointments);

// Patient appointments
router.get('/patient', authenticate, getPatientAppointments);

// Update status (Doctor or Admin)
router.patch('/:id/status', authenticate, updateAppointmentStatus);

export default router;

