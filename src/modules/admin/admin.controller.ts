import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Role, DoctorVerificationStatus, SubscriptionStatus, AppointmentStatus } from '@prisma/client';
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

// ============================================================================
// SUPER ADMIN SUPERCHARGED EXTENSIONS
// ============================================================================

// 1. Super Admin: List all platform users with rich filtering
export const getAllUsersAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { role, search, status, limit = 50, page = 1 } = req.query;

    const where: any = {};
    if (role && Object.values(Role).includes(role as Role)) {
      where.role = role as Role;
    }

    if (status !== undefined && status !== '') {
      where.isActive = status === 'true';
    }

    if (search) {
      const searchStr = (search as string).trim();
      where.OR = [
        { name: { contains: searchStr, mode: 'insensitive' } },
        { phone: { contains: searchStr, mode: 'insensitive' } },
        { email: { contains: searchStr, mode: 'insensitive' } },
      ];
    }

    const take = Math.min(parseInt(limit as any, 10) || 50, 100);
    const skip = (Math.max(parseInt(page as any, 10) || 1, 1) - 1) * take;

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          isPhoneVerified: true,
          createdAt: true,
          updatedAt: true,
          doctorProfile: {
            select: {
              id: true,
              bmdcRegNumber: true,
              verificationStatus: true,
              specialties: true,
            },
          },
          patientProfile: {
            select: {
              id: true,
              bloodGroup: true,
              gender: true,
            },
          },
          _count: {
            select: {
              appointmentsAsPatient: true,
              medicalCases: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
    ]);

    res.json({
      success: true,
      total,
      page: Math.max(parseInt(page as any, 10) || 1, 1),
      totalPages: Math.ceil(total / take),
      users,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Super Admin: Toggle User Active Status (Freeze / Unfreeze account)
export const toggleUserStatusAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { isActive } = req.body;

    if (isActive === undefined) {
      res.status(400).json({ success: false, message: 'isActive boolean flag is required.' });
      return;
    }

    if (req.user?.id === id) {
      res.status(400).json({ success: false, message: 'You cannot deactivate your own Super Admin account.' });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { isActive: Boolean(isActive) },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
      },
    });

    res.json({
      success: true,
      message: `Account for ${updatedUser.name} has been ${updatedUser.isActive ? 'activated' : 'suspended/deactivated'}.`,
      user: updatedUser,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. Super Admin: Change User Role (e.g. Promote to Admin or Doctor)
export const changeUserRoleAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { role } = req.body;

    if (!role || !Object.values(Role).includes(role)) {
      res.status(400).json({
        success: false,
        message: `Invalid role. Allowed roles: ${Object.values(Role).join(', ')}.`,
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id },
      include: { doctorProfile: true, patientProfile: true },
    });

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }

    // If upgrading to DOCTOR and no doctor profile exists, create minimal shell
    if (role === Role.DOCTOR && !user.doctorProfile) {
      await prisma.doctorProfile.create({
        data: {
          userId: user.id,
          bmdcRegNumber: `BMDC-TMP-${Math.floor(10000 + Math.random() * 90000)}`,
          specialties: ['General Medicine'],
          degrees: ['MBBS'],
          verificationStatus: DoctorVerificationStatus.VERIFIED,
          verifiedAt: new Date(),
        },
      });
    }

    // If upgrading to PATIENT and no patient profile exists, create shell
    if (role === Role.PATIENT && !user.patientProfile) {
      await prisma.patientProfile.create({
        data: { userId: user.id },
      });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, name: true, phone: true, email: true, role: true },
    });

    res.json({
      success: true,
      message: `User ${updated.name} role changed to ${updated.role}.`,
      user: updated,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 4. Super Admin: Manually Reset Any User Password
export const resetUserPasswordAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({
        success: false,
        message: 'New password is required and must be at least 6 characters long.',
      });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    const user = await prisma.user.update({
      where: { id },
      data: { passwordHash },
      select: { id: true, name: true, phone: true, email: true, role: true },
    });

    res.json({
      success: true,
      message: `Password reset successfully for ${user.name} (${user.email || user.phone}).`,
      user,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 5. Super Admin: Inspect platform-wide appointments across all doctors/chambers
export const getAllAppointmentsAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, search, doctorId, limit = 50, page = 1 } = req.query;

    const where: any = {};
    if (status && Object.values(AppointmentStatus).includes(status as any)) {
      where.status = status as AppointmentStatus;
    }

    if (doctorId) {
      where.doctorId = doctorId as string;
    }

    if (search) {
      const searchStr = (search as string).trim();
      where.OR = [
        { patientName: { contains: searchStr, mode: 'insensitive' } },
        { patientPhone: { contains: searchStr, mode: 'insensitive' } },
        { appointmentNumber: { contains: searchStr, mode: 'insensitive' } },
        { doctor: { user: { name: { contains: searchStr, mode: 'insensitive' } } } },
      ];
    }

    const take = Math.min(parseInt(limit as any, 10) || 50, 100);
    const skip = (Math.max(parseInt(page as any, 10) || 1, 1) - 1) * take;

    const [total, appointments] = await Promise.all([
      prisma.appointment.count({ where }),
      prisma.appointment.findMany({
        where,
        include: {
          doctor: {
            include: {
              user: { select: { name: true, phone: true, email: true } },
            },
          },
          chamber: true,
          patientUser: {
            select: { name: true, phone: true, email: true },
          },
        },
        orderBy: { appointmentDate: 'desc' },
        take,
        skip,
      }),
    ]);

    res.json({
      success: true,
      total,
      page: Math.max(parseInt(page as any, 10) || 1, 1),
      totalPages: Math.ceil(total / take),
      appointments,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 6. Super Admin: Force Update Appointment Status
export const updateAppointmentStatusAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { status } = req.body;

    if (!status || !Object.values(AppointmentStatus).includes(status)) {
      res.status(400).json({
        success: false,
        message: `Invalid appointment status. Allowed: ${Object.values(AppointmentStatus).join(', ')}.`,
      });
      return;
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: { status },
      include: {
        chamber: true,
        doctor: { include: { user: { select: { name: true } } } },
      },
    });

    res.json({
      success: true,
      message: `Appointment ${updated.appointmentNumber} status updated to ${status}.`,
      appointment: updated,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 7. Super Admin: Delete / Archive Doctor Account
export const deleteDoctorAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string; // doctorProfileId

    const doctor = await prisma.doctorProfile.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!doctor) {
      res.status(404).json({ success: false, message: 'Doctor profile not found.' });
      return;
    }

    // Cascade delete via User deletes DoctorProfile, chambers, subscriptions
    await prisma.user.delete({
      where: { id: doctor.userId },
    });

    res.json({
      success: true,
      message: `Doctor Dr. ${doctor.user.name} and associated profile have been permanently deleted.`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

