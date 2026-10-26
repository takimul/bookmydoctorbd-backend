import { Router } from 'express';
import {
  searchMedicines,
  autocompleteMedicine,
  seedMedicinesDatabase,
} from './medicines.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireRoles } from '../../middlewares/role.middleware';
import { Role } from '@prisma/client';

const router = Router();

router.get('/search', searchMedicines);
router.post('/autocomplete', autocompleteMedicine);

// Seed database restricted to Super Admin and Admin only
router.post('/seed', authenticate, requireRoles(Role.SUPER_ADMIN, Role.ADMIN), seedMedicinesDatabase);

export default router;
