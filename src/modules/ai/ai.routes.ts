import { Router } from 'express';
import {
  autocompleteMedicine,
  generateClinicalAdvice,
  parseHospitalReport,
  quickDiagnose,
  autocompleteLabTests,
} from './ai.controller';
import { optionalAuthenticate } from '../../middlewares/auth.middleware';
import { aiLimiter } from '../../middlewares/rateLimit.middleware';

const router = Router();

// Apply AI rate limiter to protect against scraping / DoS
router.use(aiLimiter);

router.post('/medicine-autocomplete', optionalAuthenticate, autocompleteMedicine);
router.post('/clinical-notes-autocomplete', optionalAuthenticate, generateClinicalAdvice);
router.post('/quick-diagnose', optionalAuthenticate, quickDiagnose);
router.post('/parse-report-prescription', optionalAuthenticate, parseHospitalReport);

// Lab test autocomplete (supports both GET and POST)
router.get('/lab-tests', optionalAuthenticate, autocompleteLabTests);
router.post('/lab-tests', optionalAuthenticate, autocompleteLabTests);

export default router;
