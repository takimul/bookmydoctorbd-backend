import { Router } from 'express';
import {
  getPatientDashboard,
  upsertFamilyMember,
  upsertPetProfile,
  addPetVaccination,
  toggleDoctorFavorite,
} from './patient.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/dashboard', getPatientDashboard);
router.post('/family-members', upsertFamilyMember);
router.post('/pets', upsertPetProfile);
router.post('/pets/vaccinations', addPetVaccination);
router.post('/favorites/toggle', toggleDoctorFavorite);

export default router;

