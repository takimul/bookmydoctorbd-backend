import { Router } from 'express';
import { autocompleteMedicine, generateClinicalAdvice, parseHospitalReport } from './ai.controller';
import { optionalAuthenticate } from '../../middlewares/auth.middleware';

const router = Router();

router.post('/medicine-autocomplete', optionalAuthenticate, autocompleteMedicine);
router.post('/clinical-notes-autocomplete', optionalAuthenticate, generateClinicalAdvice);
router.post('/parse-report-prescription', optionalAuthenticate, parseHospitalReport);

export default router;

