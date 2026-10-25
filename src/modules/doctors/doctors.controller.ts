import { Request, Response } from 'express';
import prisma from '../../config/database';
import { DoctorVerificationStatus, Role } from '@prisma/client';

// Common Bangladeshi symptom-to-specialty mapping for smart clinical search
const SYMPTOM_SPECIALTY_MAP: Record<string, string[]> = {
  fever: ['General Medicine', 'Internal Medicine', 'Pediatrics'],
  cough: ['General Medicine', 'Pulmonology', 'Pediatrics'],
  'chest pain': ['Cardiology', 'Internal Medicine'],
  palpitation: ['Cardiology'],
  hypertension: ['Cardiology', 'Internal Medicine'],
  headache: ['Neurology', 'Internal Medicine'],
  pregnancy: ['Gynecology & Obstetrics', 'Infertility Specialist'],
  periods: ['Gynecology & Obstetrics'],
  baby: ['Pediatrics', 'Neonatology', 'Child Nutrition'],
  rash: ['Dermatology & Venereology', 'Cosmetology'],
  skin: ['Dermatology & Venereology'],
  cat: ['Veterinary Medicine', 'Feline Specialist (Cat-First)'],
  dog: ['Veterinary Medicine'],
  pet: ['Veterinary Medicine', 'Feline Specialist (Cat-First)'],
  kitten: ['Veterinary Medicine', 'Feline Specialist (Cat-First)'],
  vaccine: ['Pediatrics', 'Veterinary Medicine', 'Internal Medicine'],
  joint: ['Orthopedics', 'Rheumatology'],
  bone: ['Orthopedics'],
  backpain: ['Orthopedics', 'Physical Medicine'],
};

export const searchDoctors = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      search,
      specialty,
      symptom,
      division,
      district,
      upazilaThana,
      gender,
      language,
      maxFee,
      isVeterinary,
      dayOfWeek,
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    // Build Prisma where clause
    const whereClause: any = {
      verificationStatus: DoctorVerificationStatus.VERIFIED,
      user: {
        isActive: true,
      },
    };

    if (isVeterinary !== undefined) {
      whereClause.isVeterinary = isVeterinary === 'true';
    }

    if (gender) {
      whereClause.gender = { equals: gender as string, mode: 'insensitive' };
    }

    if (language) {
      whereClause.languages = { has: language as string };
    }

    if (maxFee) {
      whereClause.baseConsultationFee = { lte: parseFloat(maxFee as string) };
    }

    // Chamber location filter
    const chamberFilters: any = { isActive: true };
    if (division) {
      chamberFilters.division = { equals: division as string, mode: 'insensitive' };
    }
    if (district) {
      chamberFilters.district = { equals: district as string, mode: 'insensitive' };
    }
    if (upazilaThana) {
      chamberFilters.upazilaThana = { contains: upazilaThana as string, mode: 'insensitive' };
    }

    if (dayOfWeek !== undefined && dayOfWeek !== '') {
      chamberFilters.schedules = {
        some: {
          dayOfWeek: parseInt(dayOfWeek as string, 10),
          isActive: true,
        },
      };
    }

    if (Object.keys(chamberFilters).length > 1 || dayOfWeek !== undefined) {
      whereClause.chambers = { some: chamberFilters };
    }

    // Specialty & Symptom resolution
    let targetSpecialties: string[] = [];
    if (specialty) {
      targetSpecialties.push(specialty as string);
    }
    if (symptom) {
      const symKey = (symptom as string).toLowerCase().trim();
      for (const [key, specList] of Object.entries(SYMPTOM_SPECIALTY_MAP)) {
        if (key.includes(symKey) || symKey.includes(key)) {
          targetSpecialties.push(...specList);
        }
      }
    }

    if (targetSpecialties.length > 0) {
      whereClause.specialties = { hasSome: Array.from(new Set(targetSpecialties)) };
    }

    // General search text (name, degree, bio, or specialty)
    if (search) {
      const searchStr = (search as string).trim();
      whereClause.OR = [
        { user: { name: { contains: searchStr, mode: 'insensitive' } } },
        { specialties: { hasSome: [searchStr] } },
        { degrees: { hasSome: [searchStr] } },
        { aboutBio: { contains: searchStr, mode: 'insensitive' } },
        {
          chambers: {
            some: {
              OR: [
                { name: { contains: searchStr, mode: 'insensitive' } },
                { upazilaThana: { contains: searchStr, mode: 'insensitive' } },
                { district: { contains: searchStr, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];
    }

    // Fetch doctors matching medical criteria
    const allMatchingDoctors = await prisma.doctorProfile.findMany({
      where: whereClause,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        chambers: {
          where: { isActive: true },
          include: { schedules: { where: { isActive: true } } },
        },
        subscription: { include: { plan: true } },
      },
    });

    // Medical Relevance & Organic Ranking:
    // Rule: Sponsored results appear ONLY among matching specialty/location results.
    // Subscription never overrides medical relevance.
    // Within the matched results:
    // 1. Sponsored active doctors matching criteria
    // 2. High rating, profile score, and total reviews
    const rankedDoctors = allMatchingDoctors.sort((a, b) => {
      // Sponsored active status
      const aIsSponsored = a.isSponsored && a.sponsoredExpiresAt && a.sponsoredExpiresAt > new Date();
      const bIsSponsored = b.isSponsored && b.sponsoredExpiresAt && b.sponsoredExpiresAt > new Date();

      if (aIsSponsored && !bIsSponsored) return -1;
      if (!aIsSponsored && bIsSponsored) return 1;

      // Ranking score formula: rating * 10 + profileScore * 0.2 + log(reviews + 1)
      const aScore = (a.rating || 4.5) * 10 + (a.profileScore || 0) * 0.2 + Math.log(a.totalReviews + 1) * 2;
      const bScore = (b.rating || 4.5) * 10 + (b.profileScore || 0) * 0.2 + Math.log(b.totalReviews + 1) * 2;

      return bScore - aScore;
    });

    const paginatedDoctors = rankedDoctors.slice(skip, skip + limitNum);

    res.json({
      success: true,
      total: rankedDoctors.length,
      page: pageNum,
      totalPages: Math.ceil(rankedDoctors.length / limitNum),
      doctors: paginatedDoctors,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Search failed.' });
  }
};

export const getDoctorById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const doctor = await prisma.doctorProfile.findFirst({
      where: {
        OR: [{ id }, { userId: id }],
      },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        chambers: {
          where: { isActive: true },
          include: { schedules: { where: { isActive: true } } },
        },
        subscription: { include: { plan: true } },
        reviews: {
          include: { patientUser: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        leaves: {
          where: { endDate: { gte: new Date() } },
        },
      },
    });

    if (!doctor) {
      res.status(404).json({ success: false, message: 'Doctor not found.' });
      return;
    }

    res.json({ success: true, doctor });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getSpecialtiesList = async (_req: Request, res: Response): Promise<void> => {
  try {
    const doctors = await prisma.doctorProfile.findMany({
      where: { verificationStatus: DoctorVerificationStatus.VERIFIED },
      select: { specialties: true },
    });

    const specialtySet = new Set<string>();
    doctors.forEach((d) => d.specialties.forEach((s) => specialtySet.add(s)));

    // Standard Bangladeshi popular medical specialties fallback/baseline
    const standardSpecialties = [
      'Cardiology',
      'Gynecology & Obstetrics',
      'Pediatrics',
      'Internal Medicine',
      'Dermatology & Venereology',
      'Orthopedics',
      'Neurology',
      'ENT / Otolaryngology',
      'Gastroenterology',
      'Endocrinology / Diabetology',
      'Psychiatry',
      'General Surgery',
      'Urology',
      'Veterinary Medicine',
      'Feline Specialist (Cat-First)',
    ];

    standardSpecialties.forEach((s) => specialtySet.add(s));

    res.json({
      success: true,
      specialties: Array.from(specialtySet).sort(),
      popularSymptoms: Object.keys(SYMPTOM_SPECIALTY_MAP),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getLocationsList = async (_req: Request, res: Response): Promise<void> => {
  try {
    const chambers = await prisma.chamber.findMany({
      where: { isActive: true },
      select: { division: true, district: true, upazilaThana: true },
    });

    const divisions = Array.from(new Set(chambers.map((c) => c.division))).filter(Boolean);
    const districts = Array.from(new Set(chambers.map((c) => c.district))).filter(Boolean);
    const upazilas = Array.from(new Set(chambers.map((c) => c.upazilaThana))).filter(Boolean);

    res.json({
      success: true,
      divisions: divisions.length > 0 ? divisions : ['Dhaka', 'Chittagong', 'Sylhet', 'Rajshahi', 'Khulna', 'Barisal', 'Rangpur', 'Mymensingh'],
      districts: districts.length > 0 ? districts : ['Dhaka', 'Chattogram', 'Sylhet', 'Gazipur', 'Narayanganj', 'Cumilla'],
      upazilas: upazilas.length > 0 ? upazilas : ['Dhanmondi', 'Gulshan', 'Mirpur', 'Panthapath', 'Uttara', 'Panchlaish', 'Zindabazar'],
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateDoctorProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const {
      gender,
      specialties,
      degrees,
      experienceYears,
      aboutBio,
      languages,
      baseConsultationFee,
      followUpFee,
      digitalFollowUpFee,
      profilePhotoUrl,
    } = req.body;

    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { userId: req.user.id },
    });

    if (!doctorProfile) {
      res.status(404).json({ success: false, message: 'Doctor profile not found.' });
      return;
    }

    // Calculate updated profile score
    let score = 30;
    if (aboutBio && aboutBio.length > 40) score += 20;
    if (degrees && degrees.length > 0) score += 15;
    if (specialties && specialties.length > 0) score += 15;
    if (profilePhotoUrl) score += 10;
    if (languages && languages.length > 1) score += 10;

    const updated = await prisma.doctorProfile.update({
      where: { id: doctorProfile.id },
      data: {
        ...(gender && { gender }),
        ...(specialties && { specialties }),
        ...(degrees && { degrees }),
        ...(experienceYears !== undefined && { experienceYears: parseInt(experienceYears, 10) }),
        ...(aboutBio !== undefined && { aboutBio }),
        ...(languages && { languages }),
        ...(baseConsultationFee !== undefined && { baseConsultationFee: parseFloat(baseConsultationFee) }),
        ...(followUpFee !== undefined && { followUpFee: parseFloat(followUpFee) }),
        ...(digitalFollowUpFee !== undefined && { digitalFollowUpFee: parseFloat(digitalFollowUpFee) }),
        ...(profilePhotoUrl !== undefined && { profilePhotoUrl }),
        profileScore: Math.min(score, 100),
      },
    });

    res.json({ success: true, message: 'Doctor profile updated.', doctor: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const addOrUpdateChamber = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const doctor = await prisma.doctorProfile.findUnique({
      where: { userId: req.user.id },
      include: {
        chambers: true,
        subscription: { include: { plan: true } },
      },
    });

    if (!doctor) {
      res.status(404).json({ success: false, message: 'Doctor profile not found.' });
      return;
    }

    const { id, name, division, district, upazilaThana, address, contactPhone, consultationFee, followUpFee, schedules } = req.body;

    // Check chamber quota if adding a new chamber
    if (!id) {
      const maxAllowed = doctor.subscription?.plan?.maxChambers || 1;
      if (doctor.chambers.length >= maxAllowed) {
        res.status(403).json({
          success: false,
          message: `Your current subscription plan allows a maximum of ${maxAllowed} chamber(s). Please upgrade to add more.`,
        });
        return;
      }
    }

    if (id) {
      // Update existing chamber
      const updatedChamber = await prisma.chamber.update({
        where: { id },
        data: {
          name,
          division,
          district,
          upazilaThana,
          address,
          contactPhone,
          consultationFee: parseFloat(consultationFee || doctor.baseConsultationFee),
          followUpFee: parseFloat(followUpFee || doctor.followUpFee),
        },
      });

      if (schedules && Array.isArray(schedules)) {
        await prisma.chamberSchedule.deleteMany({ where: { chamberId: id } });
        for (const s of schedules) {
          await prisma.chamberSchedule.create({
            data: {
              chamberId: id,
              dayOfWeek: s.dayOfWeek,
              startTime: s.startTime,
              endTime: s.endTime,
              slotDurationMinutes: s.slotDurationMinutes || 15,
              maxPatientsPerShift: s.maxPatientsPerShift || 20,
            },
          });
        }
      }

      res.json({ success: true, message: 'Chamber updated successfully.', chamber: updatedChamber });
    } else {
      // Create new chamber
      const newChamber = await prisma.chamber.create({
        data: {
          doctorId: doctor.id,
          name,
          division,
          district,
          upazilaThana,
          address,
          contactPhone,
          consultationFee: parseFloat(consultationFee || doctor.baseConsultationFee),
          followUpFee: parseFloat(followUpFee || doctor.followUpFee),
          schedules: {
            create: (schedules || []).map((s: any) => ({
              dayOfWeek: s.dayOfWeek,
              startTime: s.startTime,
              endTime: s.endTime,
              slotDurationMinutes: s.slotDurationMinutes || 15,
              maxPatientsPerShift: s.maxPatientsPerShift || 20,
            })),
          },
        },
      });

      res.status(201).json({ success: true, message: 'Chamber added successfully.', chamber: newChamber });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const addDoctorLeave = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const doctor = await prisma.doctorProfile.findUnique({
      where: { userId: req.user.id },
    });

    if (!doctor) {
      res.status(404).json({ success: false, message: 'Doctor profile not found.' });
      return;
    }

    const { startDate, endDate, reason } = req.body;

    const leave = await prisma.doctorLeave.create({
      data: {
        doctorId: doctor.id,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason,
      },
    });

    res.status(201).json({ success: true, message: 'Leave schedule recorded.', leave });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
