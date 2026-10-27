import { Request, Response } from 'express';
import prisma from '../../config/database';
import { logAuditEvent } from '../../utils/auditLogger';
import { AppointmentStatus, CaseStatus } from '@prisma/client';
import { normalizeBdPhone } from '../../utils/phoneUtils';

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

    // Normalize Bangladeshi phone
    const phoneCheck = normalizeBdPhone(patientPhone);
    const normalizedPhone = phoneCheck.isValid ? phoneCheck.normalized : patientPhone.trim();

    // Guest booking requires verified mobile number
    if (isGuestBooking && !otpVerified) {
      res.status(400).json({
        success: false,
        message: 'Guest booking requires mobile number OTP verification.',
      });
      return;
    }

    // Try finding existing user by phone if req.user is null
    let linkedUserId = req.user?.id || null;
    if (!linkedUserId && phoneCheck.isValid) {
      const matchUser = await prisma.user.findFirst({
        where: {
          OR: [{ phone: phoneCheck.normalized }, { phone: phoneCheck.national }],
        },
        select: { id: true },
      });
      if (matchUser) {
        linkedUserId = matchUser.id;
      }
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

    
    // Check doctor slot capacity limit if timeSlot is provided
    const dayOfWeek = apptDate.getDay();
    const schedules = await prisma.chamberSchedule.findMany({
      where: {
        chamberId,
        dayOfWeek,
        isActive: true,
      },
    });

    if (timeSlot && schedules.length > 0) {
      const matchingSchedule = schedules.find(
        (s) => (s.slotTitle && s.slotTitle.includes(timeSlot)) || timeSlot.includes(s.startTime) || `${s.startTime} - ${s.endTime}` === timeSlot
      ) || schedules[0];

      if (matchingSchedule) {
        const slotBookedCount = await prisma.appointment.count({
          where: {
            chamberId,
            appointmentDate: { gte: dayStart, lte: dayEnd },
            timeSlot,
            status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.REJECTED] },
          },
        });

        if (slotBookedCount >= matchingSchedule.maxPatientsPerShift) {
          res.status(400).json({
            success: false,
            message: `Selected slot (${timeSlot}) has reached its limit of ${matchingSchedule.maxPatientsPerShift} patients. Please choose another slot.`,
          });
          return;
        }
      }
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
        patientUserId: linkedUserId,
        familyMemberId: familyMemberId || null,
        petProfileId: petProfileId || null,
        patientName,
        patientPhone: normalizedPhone,
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
        medicalCase: {
          include: {
            prescriptions: {
              include: { items: true },
              orderBy: { issuedAt: 'desc' },
            },
            investigationOrders: {
              include: { reports: true },
            },
            patientReports: {
              orderBy: { uploadedAt: 'desc' },
            },
            digitalFollowUps: {
              orderBy: { createdAt: 'desc' },
            },
            timeline: {
              orderBy: { createdAt: 'desc' },
            },
          },
        },
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
          include: {
            prescriptions: {
              include: { items: true },
              orderBy: { issuedAt: 'desc' },
            },
            investigationOrders: {
              include: { reports: true },
            },
            patientReports: {
              orderBy: { uploadedAt: 'desc' },
            },
            digitalFollowUps: {
              orderBy: { createdAt: 'desc' },
            },
            timeline: {
              orderBy: { createdAt: 'desc' },
            },
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

export const bookAppointmentByDoctor = async (req: Request, res: Response): Promise<void> => {
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

    const {
      chamberId,
      appointmentDate,
      timeSlot,
      patientName,
      patientPhone,
      patientEmail,
      problemDescription,
      age,
      gender,
      status: requestedStatus,
    } = req.body;

    if (!chamberId || !appointmentDate || !patientName || !patientPhone) {
      res.status(400).json({
        success: false,
        message: 'Chamber, appointment date, patient name, and mobile number are required.',
      });
      return;
    }

    const apptDate = new Date(appointmentDate);
    const dayStart = new Date(apptDate.getFullYear(), apptDate.getMonth(), apptDate.getDate(), 0, 0, 0);
    const dayEnd = new Date(apptDate.getFullYear(), apptDate.getMonth(), apptDate.getDate(), 23, 59, 59);

    // Look for existing registered user by phone with strict BD normalization
    const phoneCheck = normalizeBdPhone(patientPhone);
    const normalizedDocPatientPhone = phoneCheck.isValid ? phoneCheck.normalized : patientPhone.trim();
    const nationalDocPatientPhone = phoneCheck.isValid ? phoneCheck.national : patientPhone.trim();

    let existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: normalizedDocPatientPhone },
          { phone: nationalDocPatientPhone },
          { phone: patientPhone.trim() },
        ],
      },
    });

    const existingCount = await prisma.appointment.count({
      where: {
        doctorId: doctor.id,
        chamberId,
        appointmentDate: { gte: dayStart, lte: dayEnd },
        status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.REJECTED] },
      },
    });

    const serialNumber = existingCount + 1;
    const dateStr = apptDate.toISOString().slice(0, 10).replace(/-/g, '');
    const appointmentNumber = `BMD-${dateStr}-${Math.floor(100 + Math.random() * 900)}-#${serialNumber}`;

    const appointmentStatus =
      requestedStatus && Object.values(AppointmentStatus).includes(requestedStatus as any)
        ? (requestedStatus as AppointmentStatus)
        : AppointmentStatus.CONFIRMED;

    const appointment = await prisma.appointment.create({
      data: {
        appointmentNumber,
        doctorId: doctor.id,
        chamberId,
        patientUserId: existingUser?.id || null,
        patientName,
        patientPhone: normalizedDocPatientPhone,
        patientEmail: patientEmail || null,
        appointmentDate: apptDate,
        timeSlot: timeSlot || `Serial #${serialNumber}`,
        serialNumber,
        status: appointmentStatus,
        problemDescription: problemDescription || (age && gender ? `Age: ${age}, Gender: ${gender}` : null),
        isGuestBooking: !existingUser,
        otpVerified: true,
      },
      include: {
        chamber: true,
        patientUser: {
          include: {
            patientProfile: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: `Appointment #${serialNumber} confirmed for ${patientName}.`,
      appointment,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get live slot availability with capacity counting for a chamber on a given date
export const getChamberSlots = async (req: Request, res: Response): Promise<void> => {
  try {
    const chamberId = req.params.chamberId as string;
    const dateParam = (req.query.date as string) || new Date().toISOString().slice(0, 10);

    const chamber = await prisma.chamber.findUnique({
      where: { id: chamberId },
      include: {
        doctor: {
          include: {
            user: { select: { name: true, phone: true } },
            leaves: true,
          },
        },
        schedules: {
          where: { isActive: true },
          orderBy: { startTime: 'asc' },
        },
      },
    });

    if (!chamber) {
      res.status(404).json({ success: false, message: 'Chamber not found.' });
      return;
    }

    const targetDate = new Date(dateParam);
    if (isNaN(targetDate.getTime())) {
      res.status(400).json({ success: false, message: 'Invalid date parameter. Use YYYY-MM-DD format.' });
      return;
    }

    const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0);
    const dayEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59);
    const dayOfWeek = targetDate.getDay();

    // Check if doctor is on leave on this date
    const doctorLeave = chamber.doctor.leaves.find((l) => {
      const lStart = new Date(l.startDate);
      const lEnd = new Date(l.endDate);
      return lStart <= dayEnd && lEnd >= dayStart;
    });

    // Match schedules for this day of week, or fallback to all active schedules
    let matchingSchedules = chamber.schedules.filter((s) => s.dayOfWeek === dayOfWeek);
    if (matchingSchedules.length === 0 && chamber.schedules.length > 0) {
      matchingSchedules = chamber.schedules;
    }

    // Default slot if none set up yet
    if (matchingSchedules.length === 0) {
      matchingSchedules = [
        {
          id: `default_${chamber.id}`,
          chamberId: chamber.id,
          dayOfWeek,
          startTime: '18:00',
          endTime: '21:00',
          slotDurationMinutes: 15,
          slotTitle: 'General Chamber Slot (6:00 PM - 9:00 PM)',
          maxPatientsPerShift: 15,
          isActive: true,
        } as any,
      ];
    }

    // Fetch existing active bookings for this chamber & date
    const bookedAppointments = await prisma.appointment.findMany({
      where: {
        chamberId,
        appointmentDate: { gte: dayStart, lte: dayEnd },
        status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.REJECTED] },
      },
      select: {
        id: true,
        timeSlot: true,
        serialNumber: true,
      },
    });

    // Compute live remaining capacity for each slot
    const slots = matchingSchedules.map((sched) => {
      const slotIdentifier = sched.slotTitle || `${sched.startTime} - ${sched.endTime}`;
      const maxCapacity = sched.maxPatientsPerShift || 10;

      const bookedCount = bookedAppointments.filter((appt) => {
        if (!appt.timeSlot) return false;
        return (
          appt.timeSlot === slotIdentifier ||
          appt.timeSlot.includes(sched.startTime) ||
          (sched.slotTitle && appt.timeSlot === sched.slotTitle)
        );
      }).length;

      const availableCount = doctorLeave ? 0 : Math.max(0, maxCapacity - bookedCount);
      const isFull = doctorLeave ? true : bookedCount >= maxCapacity;

      return {
        id: sched.id,
        chamberId: sched.chamberId,
        dayOfWeek: sched.dayOfWeek,
        startTime: sched.startTime,
        endTime: sched.endTime,
        slotTitle: slotIdentifier,
        slotDurationMinutes: sched.slotDurationMinutes,
        maxCapacity,
        bookedCount,
        availableCount,
        isFull,
      };
    });

    res.json({
      success: true,
      chamber: {
        id: chamber.id,
        name: chamber.name,
        address: chamber.address,
        consultationFee: chamber.consultationFee,
        doctorName: chamber.doctor.user.name,
      },
      date: dateParam,
      dayOfWeek,
      isDoctorOnLeave: Boolean(doctorLeave),
      leaveReason: doctorLeave?.reason || null,
      totalSlots: slots.length,
      availableSlotsCount: slots.filter((s) => !s.isFull).length,
      slots,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Upload Printed Report (Photo JPG/PNG or PDF) directly attached to Appointment ID
export const uploadAppointmentReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const appointmentId = req.params.id as string;
    const { testName, fileUrl, fileType, hospitalClinicName, notes, reportDate } = req.body;

    if (!fileUrl || !testName) {
      res.status(400).json({ success: false, message: 'Test name and file (photo or PDF) are required.' });
      return;
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { medicalCase: true, doctor: { include: { user: true } } },
    });

    if (!appointment) {
      res.status(404).json({ success: false, message: 'Appointment record not found.' });
      return;
    }

    // Ensure MedicalCase exists for this physical or digital consultation
    let caseId = appointment.medicalCase?.id;
    if (!caseId) {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const newCase = await prisma.medicalCase.create({
        data: {
          caseNumber: `CASE-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`,
          appointmentId: appointment.id,
          doctorId: appointment.doctorId,
          patientUserId: appointment.patientUserId,
          title: `Clinical Consultation - ${appointment.patientName}`,
          diagnosis: appointment.problemDescription || 'Consultation Record',
        },
      });
      caseId = newCase.id;
    }

    const report = await prisma.patientReport.create({
      data: {
        medicalCaseId: caseId,
        testName: testName.trim(),
        fileUrl,
        fileType: fileType || 'image/jpeg',
        hospitalClinicName: hospitalClinicName ? hospitalClinicName.trim() : null,
        patientPhone: appointment.patientPhone,
        patientName: appointment.patientName,
        doctorId: appointment.doctorId,
        notes: notes ? notes.trim() : null,
        reportDate: reportDate ? new Date(reportDate) : new Date(),
      },
    });

    // Create a timeline event
    await prisma.medicalCaseTimeline.create({
      data: {
        medicalCaseId: caseId,
        eventType: 'REPORT_UPLOADED',
        title: `Report Uploaded: ${testName}`,
        description: `Printed report uploaded by ${req.user?.name || 'User'} (${req.user?.role || 'PATIENT'}) from ${hospitalClinicName || 'Diagnostic Center'}.`,
      },
    });

    // Record audit event
    await logAuditEvent({
      actorUserId: req.user?.id,
      actorName: req.user?.name,
      actorRole: req.user?.role,
      action: 'REPORT_UPLOADED',
      targetType: 'APPOINTMENT',
      targetId: appointment.id,
      details: `Report "${testName}" linked to appointment ${appointment.appointmentNumber}.`,
    });

    res.status(201).json({
      success: true,
      message: 'Printed report successfully attached to appointment and medical case.',
      report,
      medicalCaseId: caseId,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all uploaded reports for an appointment ID
export const getAppointmentReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const appointmentId = req.params.id as string;

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        medicalCase: {
          include: {
            patientReports: {
              orderBy: { uploadedAt: 'desc' },
            },
          },
        },
      },
    });

    if (!appointment) {
      res.status(404).json({ success: false, message: 'Appointment not found.' });
      return;
    }

    const reports = appointment.medicalCase?.patientReports || [];
    res.json({ success: true, count: reports.length, reports });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
