import { Router } from 'express';
import {
  getMedicalCases,
  getMedicalCaseById,
  issuePrescription,
  orderInvestigations,
  uploadReport,
  requestDigitalFollowUp,
  payDigitalFollowUp,
  provideDigitalAdvice,
  getPatientHistoryByPhone,
  uploadGeneralPatientReport,
  getPatientReportsByPhone,
  getPrescriptionDetails,
} from './medicalCases.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// Patient history tracking by mobile number (CORE FEATURE)
router.get('/patient-history/:phone', getPatientHistoryByPhone);

// General report upload and listing
router.post('/reports/upload', uploadGeneralPatientReport);
router.get('/reports/by-phone/:phone', getPatientReportsByPhone);

// Specific prescription view/print
router.get('/prescriptions/:prescriptionId', getPrescriptionDetails);

// Cases
router.get('/', getMedicalCases);
router.get('/:id', getMedicalCaseById);
router.post('/:id/prescriptions', issuePrescription);
router.post('/:id/investigations', orderInvestigations);
router.post('/:id/reports', uploadReport);
router.post('/:id/digital-followup', requestDigitalFollowUp);
router.post('/digital-followup/pay', payDigitalFollowUp);
router.post('/digital-followup/advice', provideDigitalAdvice);

export default router;
