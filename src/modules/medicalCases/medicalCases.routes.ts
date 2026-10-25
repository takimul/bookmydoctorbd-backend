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
} from './medicalCases.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getMedicalCases);
router.get('/:id', getMedicalCaseById);
router.post('/:id/prescriptions', issuePrescription);
router.post('/:id/investigations', orderInvestigations);
router.post('/:id/reports', uploadReport);
router.post('/:id/digital-followup', requestDigitalFollowUp);
router.post('/digital-followup/pay', payDigitalFollowUp);
router.post('/digital-followup/advice', provideDigitalAdvice);

export default router;

