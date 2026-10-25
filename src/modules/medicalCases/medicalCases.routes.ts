import { Router } from 'express';
import multer from 'multer';
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
  uploadReportFromFile,
  getPatientReportsByPhone,
  getPrescriptionDetails,
} from './medicalCases.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB max file size
});

const router = Router();

router.use(authenticate);

// Patient history tracking by mobile number (CORE FEATURE)
router.get('/patient-history/:phone', getPatientHistoryByPhone);

// General report upload (JSON/Base64 or multipart device file upload)
router.post('/reports/upload', uploadGeneralPatientReport);
router.post('/reports/upload-file', upload.single('file'), uploadReportFromFile);
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
