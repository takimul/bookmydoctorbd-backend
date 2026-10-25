import { Router } from 'express';
import {
  searchMedicines,
  autocompleteMedicine,
  seedMedicinesDatabase,
} from './medicines.controller';

const router = Router();

router.get('/search', searchMedicines);
router.post('/autocomplete', autocompleteMedicine);
router.post('/seed', seedMedicinesDatabase);

export default router;

