import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Role, DoctorVerificationStatus, SubscriptionStatus } from '@prisma/client';
import prisma from '../../config/database';

// Super Admin manually creates doctor ID & password from dashboard
export const createDoctorManually = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      email,
      phone,
      password,
      bmdcRegNumber,
      specialties,
      degrees,
      experienceYears = 1,
      baseConsultationFee = 500,
      followUpFee = 300,
      digitalFollowUpFee = 200,
      aboutBio = '',
      isVeterinary = false,
      verificationStatus = DoctorVerificationStatus.VERIFIED, // Super Admin can verify directly
      planCode = 'BASIC',
      chamberName,
      chamberDivision = 'Dhaka',
      chamberDistrict = 'Dhaka',
      chamberUpazila = 'Dhanmondi',
      chamberAddress = 'Chamber address',
    } = req.body;

    if (!name || !phone || !password || !bmdcRegNumber) {
      res.status(400).json({
        success: false,
        message: 'Doctor name, phone, password, and BMDC registration number are required.',
      });
      return;
    }

    // Check unique phone or email
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ phone }, ...(email ? [{ email }] : [])],
      },
    });

    if (existingUser) {
      res.status(409).json({ success: false, message: 'User with this phone or email already exists.' });
      return;
    }

    const existingDoctor = await prisma.doctorProfile.findUnique({
      where: { bmdcRegNumber },
    });

    if (existingDoctor) {
      res.status(409).json({ success: false, message: 'Doctor with this BMDC Reg Number already exists.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Fetch subscription plan
    const plan = await prisma.subscriptionPlan.findFirst({
      where: { code: planCode },
    });

    // Create user and doctor profile in transaction
    const user = await prisma.user.create({
      data: {
        name,
        email: email || null,
        phone,
        passwordHash,
        role: Role.DOCTOR,
        isPhoneVerified: true,
        doctorProfile: {
          create: {
            bmdcRegNumber,
            gender: req.body.gender || 'Male',
            specialties: Array.isArray(specialties) ? specialties : [specialties || 'General Medicine'],
            degrees: Array.isArray(degrees) ? degrees : [degrees || 'MBBS'],
            experienceYears: parseInt(experienceYears as any, 10),
            aboutBio,
            isVeterinary: Boolean(isVeterinary),
            verificationStatus,
            verifiedAt: verificationStatus === DoctorVerificationStatus.VERIFIED ? new Date() : null,
            profileScore: 75,
            baseConsultationFee: parseFloat(baseConsultationFee as any),
            followUpFee: parseFloat(followUpFee as any),
            digitalFollowUpFee: parseFloat(digitalFollowUpFee as any),
            ...(plan
              ? {
                  subscription: {
                    create: {
                      planId: plan.id,
                      status: SubscriptionStatus.ACTIVE,
                      startDate: new Date(),
                      endDate: new Date(Date.now() + (plan.billingCycleDays || 30) * 24 * 60 * 60 * 1000),
                      assignedBySuperAdmin: true,
                    },
                  },
                }
              : {}),
            ...(chamberName
              ? {
                  chambers: {
                    create: {
                      name: chamberName,
                      division: chamberDivision,
                      district: chamberDistrict,
                      upazilaThana: chamberUpazila,
                      address: chamberAddress,
                      consultationFee: parseFloat(baseConsultationFee as any),
                      followUpFee: parseFloat(followUpFee as any),
                    },
                  },
                }
              : {}),
          },
        },
      },
      include: {
        doctorProfile: {
          include: {
            subscription: { include: { plan: true } },
            chambers: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: `Doctor account created successfully for Dr. ${name}. Credentials: ID: ${email || phone}, Password: ${password}`,
      doctor: user,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to create doctor account.' });
  }
};

// Super Admin lists all doctors with rich filters
export const getAllDoctorsAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, search } = req.query;

    const where: any = {};
    if (status) {
      where.verificationStatus = status as DoctorVerificationStatus;
    }

    if (search) {
      const searchStr = (search as string).trim();
      where.OR = [
        { user: { name: { contains: searchStr, mode: 'insensitive' } } },
        { user: { phone: { contains: searchStr, mode: 'insensitive' } } },
        { user: { email: { contains: searchStr, mode: 'insensitive' } } },
        { bmdcRegNumber: { contains: searchStr, mode: 'insensitive' } },
      ];
    }

    const doctors = await prisma.doctorProfile.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, isActive: true, createdAt: true } },
        subscription: { include: { plan: true } },
        chambers: true,
        _count: {
          select: {
            appointments: true,
            medicalCases: true,
            reviews: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, count: doctors.length, doctors });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Super Admin controls verification status (Draft, Pending, Verified, Suspended, Expired)
export const updateDoctorVerification = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { verificationStatus, isSponsored, sponsoredDays } = req.body;

    if (!Object.values(DoctorVerificationStatus).includes(verificationStatus)) {
      res.status(400).json({ success: false, message: 'Invalid doctor verification status.' });
      return;
    }

    const updateData: any = {
      verificationStatus,
      ...(verificationStatus === DoctorVerificationStatus.VERIFIED && { verifiedAt: new Date() }),
    };

    if (isSponsored !== undefined) {
      updateData.isSponsored = Boolean(isSponsored);
      if (isSponsored && sponsoredDays) {
        updateData.sponsoredExpiresAt = new Date(Date.now() + parseInt(sponsoredDays, 10) * 24 * 60 * 60 * 1000);
      }
    }

    const updated = await prisma.doctorProfile.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: { name: true, phone: true, email: true } },
        subscription: { include: { plan: true } },
      },
    });

    res.json({
      success: true,
      message: `Doctor status updated to ${verificationStatus}.`,
      doctor: updated,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Super Admin assigns subscription or free trial
export const assignDoctorSubscription = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string; // doctorProfileId
    const { planCode, durationDays = 30, isTrial = false } = req.body;

    const plan = await prisma.subscriptionPlan.findFirst({
      where: { code: isTrial ? 'TRIAL' : planCode },
    });

    if (!plan) {
      res.status(404).json({ success: false, message: 'Subscription plan not found.' });
      return;
    }

    const days = isTrial ? 14 : parseInt(durationDays as any, 10) || plan.billingCycleDays || 30;
    const endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const subscription = await prisma.doctorSubscription.upsert({
      where: { doctorId: id },
      create: {
        doctorId: id,
        planId: plan.id,
        status: isTrial ? SubscriptionStatus.TRIAL : SubscriptionStatus.ACTIVE,
        startDate: new Date(),
        endDate,
        assignedBySuperAdmin: true,
      },
      update: {
        planId: plan.id,
        status: isTrial ? SubscriptionStatus.TRIAL : SubscriptionStatus.ACTIVE,
        startDate: new Date(),
        endDate,
        assignedBySuperAdmin: true,
      },
      include: { plan: true },
    });

    res.json({
      success: true,
      message: `Assigned ${plan.name} to doctor. Valid for ${days} days until ${endDate.toDateString()}.`,
      subscription,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Super Admin high-level analytics & platform oversight
export const getAdminAnalytics = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [
      totalUsers,
      totalDoctors,
      pendingDoctors,
      verifiedDoctors,
      totalAppointments,
      completedConsultations,
      totalMedicalCases,
      totalDigitalFollowUps,
      subscriptionPlans,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.doctorProfile.count(),
      prisma.doctorProfile.count({ where: { verificationStatus: DoctorVerificationStatus.PENDING } }),
      prisma.doctorProfile.count({ where: { verificationStatus: DoctorVerificationStatus.VERIFIED } }),
      prisma.appointment.count(),
      prisma.appointment.count({ where: { status: 'COMPLETED' } }),
      prisma.medicalCase.count(),
      prisma.digitalFollowUp.count({ where: { status: 'COMPLETED' } }),
      prisma.subscriptionPlan.findMany({
        include: {
          _count: { select: { doctorSubscriptions: true } },
        },
      }),
    ]);

    // Calculate simulated doctor subscription MRR + follow-up revenue
    const activeSubs = await prisma.doctorSubscription.findMany({
      where: { status: SubscriptionStatus.ACTIVE },
      include: { plan: true },
    });
    const monthlySubscriptionMRR = activeSubs.reduce((acc, sub) => acc + (sub.plan?.priceBDT || 0), 0);

    const digitalFollowUpRevenue = await prisma.digitalFollowUp.aggregate({
      where: { paymentStatus: 'COMPLETED' },
      _sum: { paymentAmount: true },
    });

    res.json({
      success: true,
      overview: {
        totalUsers,
        totalDoctors,
        pendingDoctors,
        verifiedDoctors,
        totalAppointments,
        completedConsultations,
        totalMedicalCases,
        totalDigitalFollowUps,
        monthlySubscriptionMRR,
        totalFollowUpRevenueBDT: digitalFollowUpRevenue._sum.paymentAmount || 0,
      },
      subscriptionPlans,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
