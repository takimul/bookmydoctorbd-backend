import { Request, Response } from 'express';
import prisma from '../../config/database';

export const getSubscriptionPlans = async (_req: Request, res: Response): Promise<void> => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: { priceBDT: 'asc' },
    });

    res.json({ success: true, plans });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMySubscription = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const doctor = await prisma.doctorProfile.findUnique({
      where: { userId: req.user.id },
      include: {
        subscription: { include: { plan: true } },
        chambers: true,
      },
    });

    if (!doctor) {
      res.status(404).json({ success: false, message: 'Doctor profile not found.' });
      return;
    }

    res.json({
      success: true,
      subscription: doctor.subscription,
      chambersCount: doctor.chambers.length,
      maxAllowedChambers: doctor.subscription?.plan?.maxChambers || 1,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

