import { Router } from 'express';
import {
  autocompleteMedicine,
  generateClinicalAdvice,
  parseHospitalReport,
  quickDiagnose,
} from './ai.controller';
import { optionalAuthenticate } from '../../middlewares/auth.middleware';

const router = Router();

router.post('/medicine-autocomplete', optionalAuthenticate, autocompleteMedicine);
router.post('/clinical-notes-autocomplete', optionalAuthenticate, generateClinicalAdvice);
router.post('/quick-diagnose', optionalAuthenticate, quickDiagnose);
router.post('/parse-report-prescription', optionalAuthenticate, parseHospitalReport);

export default router;
