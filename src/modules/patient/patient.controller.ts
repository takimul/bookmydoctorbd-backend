import { Request, Response } from 'express';
import prisma from '../../config/database';
import { normalizeBdPhone } from '../../utils/phoneUtils';

// 1. Get complete patient health dashboard & timeline
export const getPatientDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const patientProfile = await prisma.patientProfile.findUnique({
      where: { userId: req.user.id },
      include: {
        familyMembers: {
          include: {
            appointments: { take: 5, orderBy: { appointmentDate: 'desc' } },
            medicalCases: { take: 5, orderBy: { createdAt: 'desc' } },
          },
        },
        pets: {
          include: {
            vaccinations: { orderBy: { dueDate: 'asc' } },
            medicalCases: { take: 5, orderBy: { createdAt: 'desc' } },
          },
        },
        favorites: {
          include: {
            doctor: {
              include: {
                user: { select: { name: true, phone: true, email: true } },
                chambers: true,
              },
            },
          },
        },
      },
    });

    const [appointments, medicalCases, recommendations, notifications] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          OR: [{ patientUserId: req.user.id }, { patientPhone: req.user.phone }],
        },
        include: {
          doctor: { include: { user: { select: { name: true, phone: true } } } },
          chamber: true,
          medicalCase: { select: { id: true, caseNumber: true, status: true } },
        },
        orderBy: { appointmentDate: 'desc' },
      }),
      prisma.medicalCase.findMany({
        where: { patientUserId: req.user.id },
        include: {
          doctor: { include: { user: { select: { name: true } } } },
          prescriptions: { include: { items: true } },
          patientReports: true,
          digitalFollowUps: true,
          timeline: { orderBy: { createdAt: 'desc' } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.healthRecommendation.findMany({
        where: { patientUserId: req.user.id, isDismissed: false },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    res.json({
      success: true,
      patientProfile,
      appointments,
      medicalCases,
      recommendations,
      notifications,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Add / Edit Family Member
export const upsertFamilyMember = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const patientProfile = await prisma.patientProfile.findUnique({
      where: { userId: req.user.id },
    });

    if (!patientProfile) {
      res.status(404).json({ success: false, message: 'Patient profile not found.' });
      return;
    }

    const { id, name, relationship, dateOfBirth, gender, bloodGroup, allergies, notes } = req.body;

    if (!name || !relationship) {
      res.status(400).json({ success: false, message: 'Name and relationship are required.' });
      return;
    }

    let member;
    if (id) {
      member = await prisma.familyMember.update({
        where: { id },
        data: {
          name,
          relationship,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          gender,
          bloodGroup,
          allergies: allergies || [],
          notes,
        },
      });
    } else {
      member = await prisma.familyMember.create({
        data: {
          patientProfileId: patientProfile.id,
          name,
          relationship,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          gender,
          bloodGroup,
          allergies: allergies || [],
          notes,
        },
      });
    }

    res.status(200).json({ success: true, member });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. Add / Edit Pet Profile (Veterinary - Cat First)
export const upsertPetProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const patientProfile = await prisma.patientProfile.findUnique({
      where: { userId: req.user.id },
    });

    if (!patientProfile) {
      res.status(404).json({ success: false, message: 'Patient profile not found.' });
      return;
    }

    const { id, name, species = 'Cat', breed, gender, dateOfBirth, weightKg, microchipNumber, isNeutered, notes } = req.body;

    if (!name) {
      res.status(400).json({ success: false, message: 'Pet name is required.' });
      return;
    }

    let pet;
    if (id) {
      pet = await prisma.petProfile.update({
        where: { id },
        data: {
          name,
          species,
          breed,
          gender,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          weightKg: weightKg ? parseFloat(weightKg) : null,
          microchipNumber,
          isNeutered: Boolean(isNeutered),
          notes,
        },
        include: { vaccinations: true },
      });
    } else {
      pet = await prisma.petProfile.create({
        data: {
          patientProfileId: patientProfile.id,
          name,
          species,
          breed,
          gender,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          weightKg: weightKg ? parseFloat(weightKg) : null,
          microchipNumber,
          isNeutered: Boolean(isNeutered),
          notes,
        },
        include: { vaccinations: true },
      });
    }

    res.status(200).json({ success: true, pet });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 4. Record Pet Vaccination Schedule
export const addPetVaccination = async (req: Request, res: Response): Promise<void> => {
  try {
    const { petProfileId, vaccineName, administeredDate, dueDate, administeredBy, isCompleted, notes } = req.body;

    if (!petProfileId || !vaccineName || !dueDate) {
      res.status(400).json({ success: false, message: 'Pet ID, vaccine name, and due date are required.' });
      return;
    }

    const record = await prisma.petVaccination.create({
      data: {
        petProfileId,
        vaccineName,
        administeredDate: administeredDate ? new Date(administeredDate) : new Date(),
        dueDate: new Date(dueDate),
        administeredBy,
        isCompleted: Boolean(isCompleted),
        notes,
      },
    });

    res.status(201).json({ success: true, record });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 5. Toggle Doctor Favorite
export const toggleDoctorFavorite = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { doctorId } = req.body;
    const patientProfile = await prisma.patientProfile.findUnique({
      where: { userId: req.user.id },
    });

    if (!patientProfile) {
      res.status(404).json({ success: false, message: 'Patient profile not found.' });
      return;
    }

    const existing = await prisma.doctorFavorite.findUnique({
      where: {
        patientProfileId_doctorId: {
          patientProfileId: patientProfile.id,
          doctorId,
        },
      },
    });

    if (existing) {
      await prisma.doctorFavorite.delete({ where: { id: existing.id } });
      res.json({ success: true, isFavorite: false, message: 'Removed from favorites.' });
    } else {
      await prisma.doctorFavorite.create({
        data: {
          patientProfileId: patientProfile.id,
          doctorId,
        },
      });
      res.json({ success: true, isFavorite: true, message: 'Doctor saved to favorites.' });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 6. Update Patient Health Profile (Emergency contacts, blood group, allergies, chronic conditions)
export const updatePatientProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const {
      name,
      dateOfBirth,
      gender,
      bloodGroup,
      allergies,
      chronicConditions,
      emergencyContactName,
      emergencyContactPhone,
      emergencyContactRelation,
      emergencyContact,
      address,
      consentHealthRecommendations,
    } = req.body;

    // Build structured emergency contact string
    let formattedEmergencyContact = emergencyContact || '';
    if (emergencyContactName || emergencyContactPhone) {
      let contactPhoneFormatted = emergencyContactPhone;
      if (emergencyContactPhone) {
        const check = normalizeBdPhone(emergencyContactPhone);
        if (check.isValid) contactPhoneFormatted = check.normalized;
      }
      formattedEmergencyContact = `${emergencyContactName || 'Emergency Contact'} (${emergencyContactRelation || 'Relation'}) - ${contactPhoneFormatted || 'N/A'}`;
    }

    // Update user's name if modified
    if (name && name.trim()) {
      await prisma.user.update({
        where: { id: req.user.id },
        data: { name: name.trim() },
      });
    }

    // Format allergies and chronic conditions safely
    let allergiesArr: string[] | undefined = undefined;
    if (allergies !== undefined) {
      allergiesArr = Array.isArray(allergies)
        ? allergies.map((a: any) => String(a).trim()).filter(Boolean)
        : typeof allergies === 'string'
        ? allergies.split(',').map((a) => a.trim()).filter(Boolean)
        : [];
    }

    let conditionsArr: string[] | undefined = undefined;
    if (chronicConditions !== undefined) {
      conditionsArr = Array.isArray(chronicConditions)
        ? chronicConditions.map((c: any) => String(c).trim()).filter(Boolean)
        : typeof chronicConditions === 'string'
        ? chronicConditions.split(',').map((c) => c.trim()).filter(Boolean)
        : [];
    }

    const profile = await prisma.patientProfile.upsert({
      where: { userId: req.user.id },
      create: {
        userId: req.user.id,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender: gender || null,
        bloodGroup: bloodGroup || null,
        allergies: allergiesArr || [],
        chronicConditions: conditionsArr || [],
        emergencyContact: formattedEmergencyContact || null,
        address: address || null,
        consentHealthRecommendations: consentHealthRecommendations !== undefined ? Boolean(consentHealthRecommendations) : true,
      },
      update: {
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        gender: gender !== undefined ? gender : undefined,
        bloodGroup: bloodGroup !== undefined ? bloodGroup : undefined,
        allergies: allergiesArr !== undefined ? allergiesArr : undefined,
        chronicConditions: conditionsArr !== undefined ? conditionsArr : undefined,
        emergencyContact: formattedEmergencyContact ? formattedEmergencyContact : undefined,
        address: address !== undefined ? address : undefined,
        consentHealthRecommendations: consentHealthRecommendations !== undefined ? Boolean(consentHealthRecommendations) : undefined,
      },
      include: {
        user: { select: { id: true, name: true, phone: true, email: true } },
        familyMembers: true,
        pets: true,
      },
    });

    res.json({
      success: true,
      message: 'Health profile updated successfully.',
      profile,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to update profile.' });
  }
};


