import { Request, Response } from 'express';
import prisma from '../../config/database';
import { CaseStatus } from '@prisma/client';

export const getMedicalCases = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { role, id } = req.user;
    let where: any = {};

    if (role === 'DOCTOR') {
      const doctor = await prisma.doctorProfile.findUnique({ where: { userId: id } });
      if (!doctor) {
        res.status(404).json({ success: false, message: 'Doctor profile not found.' });
        return;
      }
      where.doctorId = doctor.id;
    } else if (role === 'PATIENT' || role === 'GUEST') {
      where.patientUserId = id;
    }
    // SUPER_ADMIN and ADMIN see all or can filter

    const cases = await prisma.medicalCase.findMany({
      where,
      include: {
        appointment: {
          include: { chamber: true },
        },
        doctor: {
          include: {
            user: { select: { name: true, phone: true } },
          },
        },
        patientUser: { select: { name: true, phone: true, email: true } },
        familyMember: true,
        petProfile: true,
        prescriptions: {
          include: { items: true },
          orderBy: { issuedAt: 'desc' },
        },
        investigationOrders: {
          include: { reports: true },
        },
        patientReports: true,
        digitalFollowUps: {
          orderBy: { createdAt: 'desc' },
        },
        timeline: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ success: true, count: cases.length, cases });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMedicalCaseById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const medicalCase = await prisma.medicalCase.findUnique({
      where: { id },
      include: {
        appointment: {
          include: { chamber: true },
        },
        doctor: {
          include: {
            user: { select: { name: true, phone: true, email: true } },
            medicinePreferences: true,
          },
        },
        patientUser: {
          select: { id: true, name: true, phone: true, email: true },
        },
        familyMember: true,
        petProfile: true,
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
    });

    if (!medicalCase) {
      res.status(404).json({ success: false, message: 'Medical case not found.' });
      return;
    }

    res.json({ success: true, medicalCase });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Doctor issues or updates prescription for the case
export const issuePrescription = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string; // medicalCaseId
    const { vitals, advice, dietaryAdvice, nextVisitDate, items, clinicalNotes, diagnosis } = req.body;

    const medCase = await prisma.medicalCase.findUnique({
      where: { id },
      include: { doctor: true, patientUser: true },
    });

    if (!medCase) {
      res.status(404).json({ success: false, message: 'Medical case not found.' });
      return;
    }

    const rxDateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prescriptionNumber = `RX-${rxDateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Create prescription with medicine items
    const prescription = await prisma.prescription.create({
      data: {
        medicalCaseId: id,
        doctorId: medCase.doctorId,
        prescriptionNumber,
        chiefComplaints: req.body.chiefComplaints || null,
        clinicalFindings: req.body.clinicalFindings || null,
        diagnosis: diagnosis || null,
        vitals: vitals || null,
        advice: advice || null,
        dietaryAdvice: dietaryAdvice || null,
        nextVisitDate: nextVisitDate ? new Date(nextVisitDate) : null,
        items: {
          create: (items || []).map((it: any) => ({
            brandName: it.brandName,
            genericName: it.genericName || it.brandName,
            dosageForm: it.dosageForm || 'Tablet',
            strength: it.strength || '',
            dosageInstruction: it.dosageInstruction || '1+0+1',
            timing: it.timing || 'After meal',
            durationDays: parseInt(it.durationDays || '7', 10),
            specialInstructions: it.specialInstructions || null,
          })),
        },
      },
      include: { items: true },
    });

    // Update case diagnosis and clinical notes if provided
    if (diagnosis || clinicalNotes) {
      await prisma.medicalCase.update({
        where: { id },
        data: {
          ...(diagnosis && { diagnosis }),
          ...(clinicalNotes && { clinicalNotes }),
          updatedAt: new Date(),
        },
      });
    }

    // Record on Timeline
    await prisma.medicalCaseTimeline.create({
      data: {
        medicalCaseId: id,
        eventType: 'PRESCRIPTION_ISSUED',
        title: 'Prescription & Clinical Advice Issued',
        description: `Prescribed ${items?.length || 0} medication(s). Follow-up scheduled.`,
        metadata: { prescriptionId: prescription.id, itemCount: items?.length || 0 },
      },
    });

    // Automatically learn/update doctor medicine preferences for fast autocomplete
    if (items && Array.isArray(items)) {
      for (const item of items) {
        if (item.brandName) {
          await prisma.doctorMedicinePreference.upsert({
            where: {
              doctorId_brandName: {
                doctorId: medCase.doctorId,
                brandName: item.brandName,
              },
            },
            create: {
              doctorId: medCase.doctorId,
              brandName: item.brandName,
              genericName: item.genericName || item.brandName,
              dosageForm: item.dosageForm || 'Tablet',
              strength: item.strength || '',
              defaultDose: item.dosageInstruction || '1+0+1',
              defaultTiming: item.timing || 'After meal',
              defaultDuration: parseInt(item.durationDays || '7', 10),
              diagnosis: diagnosis || null,
              frequencyCount: 1,
            },
            update: {
              frequencyCount: { increment: 1 },
              defaultDose: item.dosageInstruction || '1+0+1',
              defaultTiming: item.timing || 'After meal',
            },
          });
        }
      }
    }

    res.status(201).json({
      success: true,
      message: 'Prescription issued and timeline updated.',
      prescription,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Doctor orders diagnostic investigations
export const orderInvestigations = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string; // medicalCaseId
    const { tests } = req.body; // array of { testName, instructions, urgency }

    if (!tests || !Array.isArray(tests) || tests.length === 0) {
      res.status(400).json({ success: false, message: 'At least one test name is required.' });
      return;
    }

    const createdOrders = [];
    for (const t of tests) {
      const order = await prisma.investigationOrder.create({
        data: {
          medicalCaseId: id,
          testName: t.testName,
          instructions: t.instructions || null,
          urgency: t.urgency || 'NORMAL',
        },
      });
      createdOrders.push(order);
    }

    // Timeline event
    await prisma.medicalCaseTimeline.create({
      data: {
        medicalCaseId: id,
        eventType: 'TESTS_ORDERED',
        title: 'Diagnostic Investigations Ordered',
        description: `Doctor requested ${tests.map((t: any) => t.testName).join(', ')}.`,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Diagnostic investigations recorded.',
      orders: createdOrders,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Patient uploads test report
export const uploadReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string; // medicalCaseId
    const { testName, fileUrl, fileType, hospitalClinicName, reportDate, investigationOrderId, aiSummary } = req.body;

    if (!testName || !fileUrl) {
      res.status(400).json({ success: false, message: 'Test name and report file URL are required.' });
      return;
    }

    const report = await prisma.patientReport.create({
      data: {
        medicalCaseId: id,
        investigationOrderId: investigationOrderId || null,
        testName,
        fileUrl,
        fileType: fileType || 'image/jpeg',
        hospitalClinicName: hospitalClinicName || null,
        reportDate: reportDate ? new Date(reportDate) : new Date(),
        aiSummary: aiSummary || null,
      },
    });

    // Timeline event
    await prisma.medicalCaseTimeline.create({
      data: {
        medicalCaseId: id,
        eventType: 'REPORT_UPLOADED',
        title: 'Investigation Report Uploaded',
        description: `${testName} report uploaded (${hospitalClinicName || 'Diagnostic Lab'}).`,
        metadata: { reportId: report.id },
      },
    });

    res.status(201).json({
      success: true,
      message: 'Report uploaded successfully.',
      report,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Digital Follow-up: Patient submits query for doctor review
export const requestDigitalFollowUp = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string; // medicalCaseId
    const { patientQuery } = req.body;

    if (!patientQuery) {
      res.status(400).json({ success: false, message: 'Please describe your query or report findings.' });
      return;
    }

    const medCase = await prisma.medicalCase.findUnique({
      where: { id },
      include: { doctor: true },
    });

    if (!medCase) {
      res.status(404).json({ success: false, message: 'Medical case not found.' });
      return;
    }

    const digitalFollowUpFee = medCase.doctor.digitalFollowUpFee || 200;

    const followUp = await prisma.digitalFollowUp.create({
      data: {
        medicalCaseId: id,
        patientQuery,
        paymentAmount: digitalFollowUpFee,
        status: 'PENDING_PAYMENT',
        paymentStatus: 'PENDING',
      },
    });

    res.status(201).json({
      success: true,
      message: 'Digital follow-up initiated. Payment required.',
      followUp,
      fee: digitalFollowUpFee,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Patient pays for digital follow-up (bKash/Nagad/SSLCommerz gateway simulation)
export const payDigitalFollowUp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { followUpId } = req.body;
    const { paymentMethod = 'bKash' } = req.body;

    const followUp = await prisma.digitalFollowUp.findUnique({
      where: { id: followUpId },
      include: {
        medicalCase: {
          include: { doctor: { include: { user: true } } },
        },
      },
    });

    if (!followUp) {
      res.status(404).json({ success: false, message: 'Follow-up request not found.' });
      return;
    }

    const txnId = `TXN-${paymentMethod.toUpperCase()}-${Math.floor(10000000 + Math.random() * 90000000)}`;

    const updated = await prisma.digitalFollowUp.update({
      where: { id: followUpId },
      data: {
        status: 'PAID',
        paymentStatus: 'COMPLETED',
        paymentTxnId: txnId,
      },
    });

    // Timeline event
    await prisma.medicalCaseTimeline.create({
      data: {
        medicalCaseId: followUp.medicalCaseId,
        eventType: 'DIGITAL_FOLLOWUP_PAID',
        title: 'Digital Follow-up Payment Confirmed',
        description: `Payment of ${followUp.paymentAmount} BDT received via ${paymentMethod} (${txnId}). Doctor notified for review.`,
      },
    });

    // Notify doctor
    await prisma.notification.create({
      data: {
        userId: followUp.medicalCase.doctor.userId,
        title: 'Digital Follow-up Review Requested',
        message: `Patient requested digital review for case ${followUp.medicalCase.caseNumber}. Payment received.`,
        type: 'IN_APP',
      },
    });

    res.json({
      success: true,
      message: 'Payment completed successfully. Doctor notified to review reports.',
      followUp: updated,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Doctor reviews reports and gives final digital advice
export const provideDigitalAdvice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { followUpId, doctorAdvice } = req.body;

    if (!doctorAdvice) {
      res.status(400).json({ success: false, message: 'Doctor advice message is required.' });
      return;
    }

    const followUp = await prisma.digitalFollowUp.findUnique({
      where: { id: followUpId },
      include: {
        medicalCase: {
          include: { patientUser: true },
        },
      },
    });

    if (!followUp) {
      res.status(404).json({ success: false, message: 'Follow-up request not found.' });
      return;
    }

    const updated = await prisma.digitalFollowUp.update({
      where: { id: followUpId },
      data: {
        doctorAdvice,
        status: 'COMPLETED',
        reviewedAt: new Date(),
      },
    });

    // Timeline event
    await prisma.medicalCaseTimeline.create({
      data: {
        medicalCaseId: followUp.medicalCaseId,
        eventType: 'DOCTOR_ADVICE_GIVEN',
        title: 'Doctor Digital Follow-up Advice Issued',
        description: `Doctor provided consultation advice on uploaded reports.`,
      },
    });

    // Notify patient
    if (followUp.medicalCase.patientUserId) {
      await prisma.notification.create({
        data: {
          userId: followUp.medicalCase.patientUserId,
          title: 'Doctor Reviewed Your Reports',
          message: `Your doctor has provided advice for case ${followUp.medicalCase.caseNumber}. Click to view details.`,
          type: 'IN_APP',
        },
      });
    }

    res.json({
      success: true,
      message: 'Advice sent to patient successfully.',
      followUp: updated,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// -------------------------------------------------------------
// MAIN CORE FEATURE: Patient History Tracking by Mobile Number
// -------------------------------------------------------------
export const getPatientHistoryByPhone = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawPhone = String(req.params.phone || '').trim();
    if (!rawPhone || rawPhone.length < 5) {
      res.status(400).json({ success: false, message: 'Valid mobile number is required.' });
      return;
    }

    // Generate phone variations (with and without +88 / 88)
    const digitsOnly = rawPhone.replace(/[^0-9]/g, '');
    const nationalNumber = digitsOnly.startsWith('880') ? digitsOnly.slice(2) : digitsOnly.startsWith('0') ? digitsOnly : '0' + digitsOnly;
    const internationalNumber = '+88' + (nationalNumber.startsWith('0') ? nationalNumber : '0' + nationalNumber);

    const phoneVariants = Array.from(new Set([
      rawPhone,
      nationalNumber,
      internationalNumber,
      digitsOnly,
    ]));

    // 1. Find User & Patient Profile
    const patientUser = await prisma.user.findFirst({
      where: {
        phone: { in: phoneVariants },
      },
      include: {
        patientProfile: {
          include: {
            familyMembers: true,
            pets: true,
          },
        },
      },
    });

    // 2. Find All Appointments for this patient
    const appointments = await prisma.appointment.findMany({
      where: {
        OR: [
          { patientPhone: { in: phoneVariants } },
          ...(patientUser ? [{ patientUserId: patientUser.id }] : []),
        ],
      },
      include: {
        chamber: true,
        doctor: {
          include: {
            user: { select: { name: true, phone: true } },
          },
        },
        medicalCase: {
          include: {
            prescriptions: {
              include: { items: true },
              orderBy: { issuedAt: 'desc' },
            },
            investigationOrders: {
              include: { reports: true },
            },
            patientReports: true,
          },
        },
      },
      orderBy: { appointmentDate: 'desc' },
    });

    // 3. Find All Medical Cases linked to this patient
    const medicalCases = await prisma.medicalCase.findMany({
      where: {
        OR: [
          { appointment: { patientPhone: { in: phoneVariants } } },
          ...(patientUser ? [{ patientUserId: patientUser.id }] : []),
        ],
      },
      include: {
        appointment: { include: { chamber: true } },
        doctor: {
          include: {
            user: { select: { name: true, phone: true } },
          },
        },
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
        timeline: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 4. Find All Reports (both case-linked and standalone)
    const reports = await prisma.patientReport.findMany({
      where: {
        OR: [
          { patientPhone: { in: phoneVariants } },
          { medicalCase: { appointment: { patientPhone: { in: phoneVariants } } } },
          ...(patientUser ? [{ medicalCase: { patientUserId: patientUser.id } }] : []),
        ],
      },
      include: {
        investigationOrder: true,
        medicalCase: {
          select: {
            caseNumber: true,
            diagnosis: true,
            doctor: { select: { user: { select: { name: true } } } },
          },
        },
      },
      orderBy: { uploadedAt: 'desc' },
    });

    // 5. Aggregate Vitals Trend over Time
    const vitalsHistory: any[] = [];
    medicalCases.forEach((mc) => {
      mc.prescriptions.forEach((rx) => {
        if (rx.vitals && typeof rx.vitals === 'object') {
          vitalsHistory.push({
            date: rx.issuedAt,
            caseNumber: mc.caseNumber,
            doctorName: mc.doctor?.user?.name,
            vitals: rx.vitals,
          });
        }
      });
    });

    // 6. Aggregate All Previously Prescribed Medications (History)
    const pastMedicinesMap = new Map<string, any>();
    medicalCases.forEach((mc) => {
      mc.prescriptions.forEach((rx) => {
        rx.items.forEach((item) => {
          const key = item.brandName.toLowerCase();
          if (!pastMedicinesMap.has(key)) {
            pastMedicinesMap.set(key, {
              brandName: item.brandName,
              genericName: item.genericName,
              dosageForm: item.dosageForm,
              strength: item.strength,
              dosageInstruction: item.dosageInstruction,
              timing: item.timing,
              durationDays: item.durationDays,
              lastPrescribedDate: rx.issuedAt,
              doctorName: mc.doctor?.user?.name,
              diagnosis: mc.diagnosis,
              timesPrescribed: 1,
            });
          } else {
            const existing = pastMedicinesMap.get(key);
            existing.timesPrescribed += 1;
            if (new Date(rx.issuedAt) > new Date(existing.lastPrescribedDate)) {
              existing.lastPrescribedDate = rx.issuedAt;
              existing.doctorName = mc.doctor?.user?.name;
              existing.diagnosis = mc.diagnosis;
              existing.dosageInstruction = item.dosageInstruction;
            }
          }
        });
      });
    });

    // 7. Formulate Instant Clinical AI Summary for the Doctor
    const uniqueDiagnoses = Array.from(new Set(medicalCases.map((m) => m.diagnosis).filter(Boolean)));
    const activeAllergies = patientUser?.patientProfile?.allergies || [];
    const chronicDiseases = patientUser?.patientProfile?.chronicConditions || [];

    const aiBrief = {
      patientIdentified: Boolean(patientUser || appointments.length > 0),
      displayName: patientUser?.name || appointments[0]?.patientName || 'Patient',
      phone: nationalNumber,
      totalVisits: appointments.length,
      knownAllergies: activeAllergies,
      chronicConditions: chronicDiseases,
      bloodGroup: patientUser?.patientProfile?.bloodGroup || 'Not Recorded',
      pastDiagnoses: uniqueDiagnoses,
      frequentlyPrescribedMedicines: Array.from(pastMedicinesMap.values()).sort((a, b) => b.timesPrescribed - a.timesPrescribed).slice(0, 8),
      clinicalAlerts: [
        ...(activeAllergies.length > 0 ? [`Allergy Contraindication Warning: Patient is allergic to ${activeAllergies.join(', ')}.`] : []),
        ...(chronicDiseases.length > 0 ? [`Underlying Chronic Conditions: ${chronicDiseases.join(', ')}.`] : []),
        ...(vitalsHistory.length > 0 && vitalsHistory[0].vitals?.bp ? [`Last Recorded Blood Pressure: ${vitalsHistory[0].vitals.bp} (${new Date(vitalsHistory[0].date).toLocaleDateString()})`] : []),
      ],
    };

    res.json({
      success: true,
      patientUser,
      appointmentsCount: appointments.length,
      appointments,
      medicalCases,
      reports,
      vitalsHistory,
      pastMedicines: Array.from(pastMedicinesMap.values()),
      aiBrief,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Direct patient report upload (Doctor or Patient)
export const uploadGeneralPatientReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      patientPhone,
      patientName,
      medicalCaseId,
      investigationOrderId,
      testName,
      fileUrl,
      fileType,
      hospitalClinicName,
      reportDate,
      notes,
      aiSummary,
    } = req.body;

    if (!testName || !fileUrl) {
      res.status(400).json({ success: false, message: 'Test name and report file URL or image are required.' });
      return;
    }

    const report = await prisma.patientReport.create({
      data: {
        medicalCaseId: medicalCaseId || null,
        investigationOrderId: investigationOrderId || null,
        patientPhone: patientPhone || null,
        patientName: patientName || null,
        testName,
        fileUrl,
        fileType: fileType || 'image/jpeg',
        hospitalClinicName: hospitalClinicName || 'Diagnostic Lab',
        reportDate: reportDate ? new Date(reportDate) : new Date(),
        notes: notes || null,
        doctorId: req.user?.role === 'DOCTOR' ? req.user.id : null,
        aiSummary: aiSummary || null,
      },
    });

    if (medicalCaseId) {
      await prisma.medicalCaseTimeline.create({
        data: {
          medicalCaseId,
          eventType: 'REPORT_UPLOADED',
          title: 'Investigation Report Uploaded',
          description: `${testName} report uploaded (${hospitalClinicName || 'Diagnostic Lab'}).`,
          metadata: { reportId: report.id },
        },
      });
    }

    res.status(201).json({
      success: true,
      message: 'Medical report uploaded and indexed successfully.',
      report,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Fetch reports by phone
export const getPatientReportsByPhone = async (req: Request, res: Response): Promise<void> => {
  try {
    const phone = String(req.params.phone || '');
    const reports = await prisma.patientReport.findMany({
      where: {
        OR: [
          { patientPhone: phone },
          { patientPhone: phone.replace('+88', '') },
          { patientPhone: `+88${phone.replace('+88', '')}` },
        ],
      },
      orderBy: { uploadedAt: 'desc' },
    });

    res.json({ success: true, count: reports.length, reports });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single prescription details for view / print
export const getPrescriptionDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const prescriptionId = String(req.params.prescriptionId || '');

    const prescription = await prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: {
        items: true,
        medicalCase: {
          include: {
            appointment: {
              include: { chamber: true },
            },
            doctor: {
              include: {
                user: { select: { name: true, phone: true, email: true } },
                chambers: true,
              },
            },
            patientUser: {
              include: { patientProfile: true },
            },
            investigationOrders: true,
          },
        },
      },
    });

    if (!prescription) {
      res.status(404).json({ success: false, message: 'Prescription not found.' });
      return;
    }

    res.json({ success: true, prescription });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
