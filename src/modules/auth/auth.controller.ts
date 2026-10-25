import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Role, DoctorVerificationStatus } from '@prisma/client';
import prisma from '../../config/database';
import { ENV } from '../../config/env';

// Temporary in-memory OTP cache for guest verification (can also be backed by Redis in production)
const otpStore = new Map<string, { otp: string; expiresAt: number; name?: string }>();

const generateToken = (user: {
  id: string;
  email?: string | null;
  phone: string;
  role: Role;
  name: string;
  isPhoneVerified: boolean;
  isGuest?: boolean;
}) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      name: user.name,
      isPhoneVerified: user.isPhoneVerified,
      isGuest: user.isGuest || false,
    },
    ENV.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, phone, password, role = 'PATIENT', doctorDetails } = req.body;

    if (!name || !phone || !password) {
      res.status(400).json({ success: false, message: 'Name, phone number, and password are required.' });
      return;
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ phone }, ...(email ? [{ email }] : [])],
      },
    });

    if (existingUser) {
      res.status(409).json({ success: false, message: 'User with this phone number or email already exists.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const assignedRole = role === 'DOCTOR' ? Role.DOCTOR : Role.PATIENT;

    const user = await prisma.user.create({
      data: {
        name,
        email: email || null,
        phone,
        passwordHash,
        role: assignedRole,
        isPhoneVerified: true, // In production could require OTP
        ...(assignedRole === Role.PATIENT
          ? {
              patientProfile: {
                create: {
                  consentHealthRecommendations: true,
                },
              },
            }
          : {}),
        ...(assignedRole === Role.DOCTOR && doctorDetails
          ? {
              doctorProfile: {
                create: {
                  bmdcRegNumber: doctorDetails.bmdcRegNumber || `BMDC-TMP-${Date.now().toString().slice(-6)}`,
                  specialties: doctorDetails.specialties || ['General Medicine'],
                  degrees: doctorDetails.degrees || ['MBBS'],
                  experienceYears: doctorDetails.experienceYears || 1,
                  aboutBio: doctorDetails.aboutBio || '',
                  baseConsultationFee: doctorDetails.baseConsultationFee || 500,
                  followUpFee: doctorDetails.followUpFee || 300,
                  verificationStatus: DoctorVerificationStatus.PENDING, // Super Admin approval required
                  profileScore: 40,
                },
              },
            }
          : {}),
      },
      include: {
        doctorProfile: true,
        patientProfile: true,
      },
    });

    const token = generateToken(user);

    res.status(201).json({
      success: true,
      message:
        assignedRole === Role.DOCTOR
          ? 'Doctor registered successfully. Account is pending Super Admin verification.'
          : 'Patient registered successfully.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isPhoneVerified: user.isPhoneVerified,
        doctorProfile: user.doctorProfile,
        patientProfile: user.patientProfile,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Registration failed.' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier, password } = req.body; // identifier can be email or phone

    if (!identifier || !password) {
      res.status(400).json({ success: false, message: 'Email or phone and password are required.' });
      return;
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { phone: identifier }],
      },
      include: {
        doctorProfile: {
          include: {
            subscription: { include: { plan: true } },
            chambers: true,
          },
        },
        patientProfile: true,
        adminProfile: true,
      },
    });

    if (!user || !user.passwordHash) {
      res.status(401).json({ success: false, message: 'Invalid credentials.' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ success: false, message: 'Invalid credentials.' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ success: false, message: 'Account is deactivated. Contact Super Admin.' });
      return;
    }

    const token = generateToken(user);

    res.json({
      success: true,
      message: 'Logged in successfully.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isPhoneVerified: user.isPhoneVerified,
        doctorProfile: user.doctorProfile,
        patientProfile: user.patientProfile,
        adminProfile: user.adminProfile,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Login failed.' });
  }
};

// Guest OTP Request (Allows guests to book with verified mobile number without mandatory registration)
export const requestGuestOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone, name } = req.body;

    if (!phone) {
      res.status(400).json({ success: false, message: 'Phone number is required.' });
      return;
    }

    // 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    otpStore.set(phone, { otp, expiresAt, name });

    // In a live Bangladeshi SMS gateway (e.g. SSL Wireless / Greenweb / Teletalk), an SMS is sent here.
    console.log(`[BookMyDoctorBD SMS Gateway] Sent OTP to ${phone}: ${otp}`);

    res.json({
      success: true,
      message: `OTP sent successfully to ${phone}. (For development/demo, OTP is: ${otp})`,
      devOtp: otp, // Surfaced for instant testing
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to send OTP.' });
  }
};

// Guest OTP Verification
export const verifyGuestOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone, otp, name } = req.body;

    if (!phone || !otp) {
      res.status(400).json({ success: false, message: 'Phone and OTP are required.' });
      return;
    }

    const record = otpStore.get(phone);
    // Allow master test OTP '123456' or generated OTP
    const isValid = (record && record.otp === otp && record.expiresAt > Date.now()) || otp === '123456';

    if (!isValid) {
      res.status(400).json({ success: false, message: 'Invalid or expired OTP. Please try again.' });
      return;
    }

    // Find or create guest user
    let user = await prisma.user.findUnique({
      where: { phone },
      include: { patientProfile: true, doctorProfile: true },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          phone,
          name: name || record?.name || 'Guest Patient',
          role: Role.GUEST,
          isPhoneVerified: true,
          patientProfile: {
            create: {
              consentHealthRecommendations: true,
            },
          },
        },
        include: { patientProfile: true, doctorProfile: true },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { isPhoneVerified: true },
        include: { patientProfile: true, doctorProfile: true },
      });
    }

    otpStore.delete(phone);

    const token = generateToken({ ...user, isGuest: true });

    res.json({
      success: true,
      message: 'Mobile number verified successfully.',
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        isPhoneVerified: true,
        isGuest: true,
        patientProfile: user.patientProfile,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Verification failed.' });
  }
};

export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        doctorProfile: {
          include: {
            subscription: { include: { plan: true } },
            chambers: { include: { schedules: true } },
            leaves: true,
          },
        },
        patientProfile: {
          include: {
            familyMembers: true,
            pets: { include: { vaccinations: true } },
          },
        },
        adminProfile: true,
      },
    });

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }

    res.json({ success: true, user });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
