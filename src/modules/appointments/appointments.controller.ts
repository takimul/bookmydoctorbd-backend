import { Request, Response } from 'express';
import prisma from '../../config/database';
import { AppointmentStatus, CaseStatus } from '@prisma/client';

export const bookAppointment = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      doctorId,
      chamberId,
      appointmentDate,
      timeSlot,
      patientName,
      patientPhone,
      patientEmail,
      familyMemberId,
      petProfileId,
      problemDescription,
      isGuestBooking = false,
      otpVerified = false,
    } = req.body;

    if (!doctorId || !chamberId || !appointmentDate || !patientName || !patientPhone) {
      res.status(400).json({
        success: false,
        message: 'Doctor, chamber, appointment date, patient name, and phone number are required.',
      });
      return;
    }

    // Guest booking requires verified mobile number
    if (isGuestBooking && !otpVerified) {
      res.status(400).json({
        success: false,
        message: 'Guest booking requires mobile number OTP verification.',
      });
      return;
    }

    const apptDate = new Date(appointmentDate);
    // Start of day and end of day
    const dayStart = new Date(apptDate.getFullYear(), apptDate.getMonth(), apptDate.getDate(), 0, 0, 0);
    const dayEnd = new Date(apptDate.getFullYear(), apptDate.getMonth(), apptDate.getDate(), 23, 59, 59);

    // Check doctor leave on this day
    const onLeave = await prisma.doctorLeave.findFirst({
      where: {
        doctorId,
        startDate: { lte: dayEnd },
        endDate: { gte: dayStart },
      },
    });

    if (onLeave) {
      res.status(400).json({
        success: false,
        message: `Doctor is on leave on ${apptDate.toDateString()}${onLeave.reason ? `: ${onLeave.reason}` : ''}. Please select another date.`,
      });
      return;
    }

    // Count existing bookings for this chamber & date to assign next serial number
    const existingCount = await prisma.appointment.count({
      where: {
        doctorId,
        chamberId,
        appointmentDate: {
          gte: dayStart,
          lte: dayEnd,
        },
        status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.REJECTED] },
      },
    });

    const serialNumber = existingCount + 1;
    const dateStr = apptDate.toISOString().slice(0, 10).replace(/-/g, '');
    const appointmentNumber = `BMD-${dateStr}-${Math.floor(100 + Math.random() * 900)}-#${serialNumber}`;

    const appointment = await prisma.appointment.create({
      data: {
        appointmentNumber,
        doctorId,
        chamberId,
        patientUserId: req.user?.id || null,
        familyMemberId: familyMemberId || null,
        petProfileId: petProfileId || null,
        patientName,
        patientPhone,
        patientEmail: patientEmail || null,
        appointmentDate: apptDate,
        timeSlot: timeSlot || `Serial #${serialNumber}`,
        serialNumber,
        status: AppointmentStatus.REQUESTED,
        problemDescription,
        isGuestBooking: Boolean(isGuestBooking),
        otpVerified: Boolean(otpVerified || req.user?.isPhoneVerified),
      },
      include: {
        doctor: {
          include: {
            user: { select: { name: true, phone: true } },
          },
        },
        chamber: true,
      },
    });

    // Create In-App notification for the doctor
    const doctorUser = await prisma.doctorProfile.findUnique({
      where: { id: doctorId },
      select: { userId: true },
    });

    if (doctorUser) {
      await prisma.notification.create({
        data: {
          userId: doctorUser.userId,
          title: 'New Appointment Booking Request',
          message: `New booking request from ${patientName} (${patientPhone}) for ${apptDate.toDateString()} at ${appointment.chamber.name}. Serial #${serialNumber}.`,
          type: 'IN_APP',
        },
      });
    }

    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully.',
      appointment,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to book appointment.' });
  }
};

export const getDoctorAppointments = async (req: Request, res: Response): Promise<void> => {
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

    const { status, date, chamberId } = req.query;

    const where: any = { doctorId: doctor.id };

    if (status) {
      where.status = status as AppointmentStatus;
    }

    if (chamberId) {
      where.chamberId = chamberId as string;
    }

    if (date) {
      const targetDate = new Date(date as string);
      const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0);
      const dayEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59);
      where.appointmentDate = { gte: dayStart, lte: dayEnd };
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        chamber: true,
        patientUser: { select: { id: true, name: true, phone: true, email: true } },
        familyMember: true,
        petProfile: true,
        medicalCase: { select: { id: true, caseNumber: true, status: true } },
      },
      orderBy: [{ appointmentDate: 'desc' }, { serialNumber: 'asc' }],
    });

    res.json({ success: true, count: appointments.length, appointments });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPatientAppointments = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const appointments = await prisma.appointment.findMany({
      where: {
        OR: [{ patientUserId: req.user.id }, { patientPhone: req.user.phone }],
      },
      include: {
        doctor: {
          include: {
            user: { select: { name: true, phone: true } },
          },
        },
        chamber: true,
        medicalCase: {
          select: {
            id: true,
            caseNumber: true,
            status: true,
            prescriptions: { select: { id: true, issuedAt: true } },
          },
        },
      },
      orderBy: { appointmentDate: 'desc' },
    });

    res.json({ success: true, count: appointments.length, appointments });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateAppointmentStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { status, diagnosis, clinicalNotes, initialAdvice } = req.body;

    if (!Object.values(AppointmentStatus).includes(status)) {
      res.status(400).json({ success: false, message: 'Invalid appointment status.' });
      return;
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        doctor: { include: { user: true } },
        chamber: true,
        medicalCase: true,
      },
    });

    if (!appointment) {
      res.status(404).json({ success: false, message: 'Appointment not found.' });
      return;
    }

    // Verify authorized doctor or admin
    if (req.user?.role !== 'SUPER_ADMIN' && req.user?.role !== 'ADMIN') {
      if (appointment.doctor.userId !== req.user?.id) {
        res.status(403).json({ success: false, message: 'Not authorized to manage this appointment.' });
        return;
      }
    }

    // Update appointment status
    const updatedAppointment = await prisma.appointment.update({
      where: { id },
      data: { status },
      include: {
        doctor: { include: { user: true } },
        chamber: true,
        medicalCase: true,
      },
    });

    // ARCHITECTURE RULE:
    // Medical Case is created ONLY after a completed physical consultation.
    // One appointment creates at most one Medical Case.
    // Cancelled / Rejected / No-show do NOT create Medical Cases.
    let createdCase = null;
    if (status === AppointmentStatus.COMPLETED && !appointment.medicalCase) {
      const caseNumber = `MC-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
      createdCase = await prisma.medicalCase.create({
        data: {
          caseNumber,
          appointmentId: appointment.id,
          doctorId: appointment.doctorId,
          patientUserId: appointment.patientUserId,
          familyMemberId: appointment.familyMemberId,
          petProfileId: appointment.petProfileId,
          title: `${appointment.doctor.specialties[0] || 'Clinical'} Consultation - ${appointment.patientName}`,
          diagnosis: diagnosis || 'Under Evaluation',
          clinicalNotes: clinicalNotes || initialAdvice || 'Physical consultation concluded.',
          status: CaseStatus.OPEN,
          requireFollowUp: true,
          timeline: {
            create: [
              {
                eventType: 'CONSULTATION_COMPLETED',
                title: 'Physical Consultation Concluded',
                description: `Consultation completed at ${appointment.chamber.name}. Medical case opened.`,
              },
            ],
          },
        },
        include: {
          timeline: true,
        },
      });

      // Notify patient
      if (appointment.patientUserId) {
        await prisma.notification.create({
          data: {
            userId: appointment.patientUserId,
            title: 'Medical Case Opened',
            message: `Your consultation with ${appointment.doctor.user.name} is complete. Your Medical Case ${caseNumber} is now active.`,
            type: 'IN_APP',
          },
        });
      }
    }

    res.json({
      success: true,
      message: `Appointment marked as ${status}.${createdCase ? ' Medical Case created.' : ''}`,
      appointment: updatedAppointment,
      medicalCase: createdCase || appointment.medicalCase,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
