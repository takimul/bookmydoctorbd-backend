import { Role, DoctorVerificationStatus, SubscriptionStatus, AppointmentStatus, CaseStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import prisma from '../config/database';

async function main() {
  console.log('Seeding BookMyDoctorBD Database...');

  // Clean existing data
  await prisma.medicalCaseTimeline.deleteMany();
  await prisma.digitalFollowUp.deleteMany();
  await prisma.patientReport.deleteMany();
  await prisma.investigationOrder.deleteMany();
  await prisma.prescriptionItem.deleteMany();
  await prisma.prescription.deleteMany();
  await prisma.medicalCase.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.chamberSchedule.deleteMany();
  await prisma.chamber.deleteMany();
  await prisma.doctorLeave.deleteMany();
  await prisma.doctorSubscription.deleteMany();
  await prisma.subscriptionPlan.deleteMany();
  await prisma.doctorMedicinePreference.deleteMany();
  await prisma.doctorFavorite.deleteMany();
  await prisma.doctorReview.deleteMany();
  await prisma.petVaccination.deleteMany();
  await prisma.petProfile.deleteMany();
  await prisma.familyMember.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.doctorProfile.deleteMany();
  await prisma.adminProfile.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.healthRecommendation.deleteMany();
  await prisma.user.deleteMany();

  const defaultPasswordHash = await bcrypt.hash('Password@123', 10);
  const adminPasswordHash = await bcrypt.hash('Admin@123456', 10);

  // 1. Subscription Plans
  const plans = await Promise.all([
    prisma.subscriptionPlan.create({
      data: {
        code: 'BASIC',
        name: 'Basic Doctor Plan',
        priceBDT: 999,
        billingCycleDays: 30,
        maxChambers: 1,
        isSponsoredEligible: false,
        features: ['1 Chamber Management', 'Digital Appointment Booking', 'Medical Cases & Prescriptions', 'Basic SMS Alerts'],
      },
    }),
    prisma.subscriptionPlan.create({
      data: {
        code: 'PRO',
        name: 'Professional Doctor Plan',
        priceBDT: 2499,
        billingCycleDays: 30,
        maxChambers: 3,
        isSponsoredEligible: false,
        features: ['Up to 3 Chambers', 'AI Clinical Autocomplete', 'Digital Follow-up Payments', 'Priority Directory Placement'],
      },
    }),
    prisma.subscriptionPlan.create({
      data: {
        code: 'PREMIUM',
        name: 'Premium Specialist Plan',
        priceBDT: 4999,
        billingCycleDays: 30,
        maxChambers: 10,
        isSponsoredEligible: true,
        features: ['Unlimited Chambers', 'Sponsored Search Listing Placement', 'AI Prescription Intelligence', 'Full Analytics & Priority Support'],
      },
    }),
    prisma.subscriptionPlan.create({
      data: {
        code: 'TRIAL',
        name: 'Super Admin 14-Day Free Trial',
        priceBDT: 0,
        billingCycleDays: 14,
        maxChambers: 2,
        isSponsoredEligible: false,
        features: ['All Pro Features for 14 Days', 'Full Evaluation Access'],
      },
    }),
  ]);

  const basicPlan = plans[0];
  const proPlan = plans[1];
  const premiumPlan = plans[2];

  // 2. Super Admin User
  const superAdmin = await prisma.user.create({
    data: {
      name: 'Super Admin BD',
      email: 'superadmin@bookmydoctor.bd',
      phone: '+8801700000000',
      passwordHash: adminPasswordHash,
      role: Role.SUPER_ADMIN,
      isPhoneVerified: true,
      adminProfile: {
        create: {
          department: 'Executive Administration',
          permissions: ['ALL_PERMISSIONS', 'MANAGE_DOCTORS', 'MANAGE_SUBSCRIPTIONS', 'MANAGE_USERS', 'VIEW_FINANCES'],
        },
      },
    },
  });
  console.log(`Created Super Admin: ${superAdmin.email}`);

  // 3. Verified Doctor 1 (Cardiologist, Dhaka)
  const doc1User = await prisma.user.create({
    data: {
      name: 'Prof. Dr. Tanvir Ahmed',
      email: 'dr.tanvir@bookmydoctor.bd',
      phone: '+8801711223344',
      passwordHash: defaultPasswordHash,
      role: Role.DOCTOR,
      isPhoneVerified: true,
      doctorProfile: {
        create: {
          bmdcRegNumber: 'A-42195',
          gender: 'Male',
          specialties: ['Cardiology', 'Internal Medicine', 'Hypertension'],
          degrees: ['MBBS (DMC)', 'FCPS (Medicine)', 'MD (Cardiology)'],
          experienceYears: 16,
          aboutBio: 'Senior Consultant Interventional Cardiologist with extensive clinical expertise in ischemic heart disease, hypertension management, and coronary care.',
          languages: ['Bangla', 'English'],
          verificationStatus: DoctorVerificationStatus.VERIFIED,
          verifiedAt: new Date(),
          profileScore: 98,
          rating: 4.9,
          totalReviews: 84,
          baseConsultationFee: 1200,
          followUpFee: 700,
          digitalFollowUpFee: 400,
          isSponsored: true,
          sponsoredExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          subscription: {
            create: {
              planId: premiumPlan.id,
              status: SubscriptionStatus.ACTIVE,
              startDate: new Date(),
              endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
              assignedBySuperAdmin: true,
            },
          },
          chambers: {
            create: [
              {
                name: 'Popular Diagnostic Centre - Dhanmondi Branch',
                division: 'Dhaka',
                district: 'Dhaka',
                upazilaThana: 'Dhanmondi',
                address: 'House 16, Road 2, Dhanmondi R/A, Dhaka-1205',
                contactPhone: '+8801711000111',
                consultationFee: 1200,
                followUpFee: 700,
                schedules: {
                  create: [
                    { dayOfWeek: 0, startTime: '17:00', endTime: '21:00', slotDurationMinutes: 15, maxPatientsPerShift: 16 },
                    { dayOfWeek: 1, startTime: '17:00', endTime: '21:00', slotDurationMinutes: 15, maxPatientsPerShift: 16 },
                    { dayOfWeek: 2, startTime: '17:00', endTime: '21:00', slotDurationMinutes: 15, maxPatientsPerShift: 16 },
                    { dayOfWeek: 3, startTime: '17:00', endTime: '21:00', slotDurationMinutes: 15, maxPatientsPerShift: 16 },
                    { dayOfWeek: 6, startTime: '17:00', endTime: '21:00', slotDurationMinutes: 15, maxPatientsPerShift: 16 },
                  ],
                },
              },
              {
                name: 'Square Hospitals Consultation Chambers',
                division: 'Dhaka',
                district: 'Dhaka',
                upazilaThana: 'Panthapath',
                address: '18/F, Bir Uttam Qazi Nuruzzaman Sarak, West Panthapath, Dhaka',
                contactPhone: '+8801711000222',
                consultationFee: 1500,
                followUpFee: 800,
                schedules: {
                  create: [
                    { dayOfWeek: 4, startTime: '10:00', endTime: '14:00', slotDurationMinutes: 20, maxPatientsPerShift: 12 },
                    { dayOfWeek: 5, startTime: '10:00', endTime: '14:00', slotDurationMinutes: 20, maxPatientsPerShift: 12 },
                  ],
                },
              },
            ],
          },
          medicinePreferences: {
            create: [
              { brandName: 'Napa Extend', genericName: 'Paracetamol', dosageForm: 'Tablet', strength: '665mg', defaultDose: '1+0+1', defaultTiming: 'After meal', defaultDuration: 5 },
              { brandName: 'Angilock 50', genericName: 'Losartan Potassium', dosageForm: 'Tablet', strength: '50mg', defaultDose: '0+0+1', defaultTiming: 'At night', defaultDuration: 30 },
              { brandName: 'Rosuva 10', genericName: 'Rosuvastatin', dosageForm: 'Tablet', strength: '10mg', defaultDose: '0+0+1', defaultTiming: 'At bedtime', defaultDuration: 30 },
              { brandName: 'Ecoprin 75', genericName: 'Aspirin', dosageForm: 'Tablet', strength: '75mg', defaultDose: '0+1+0', defaultTiming: 'After lunch', defaultDuration: 30 },
              { brandName: 'Seclo 20', genericName: 'Omeprazole', dosageForm: 'Capsule', strength: '20mg', defaultDose: '1+0+1', defaultTiming: '30 mins before meal', defaultDuration: 14 },
            ],
          },
        },
      },
    },
    include: { doctorProfile: { include: { chambers: true } } },
  });

  // 4. Doctor 2: Gynecologist, Chittagong
  const doc2User = await prisma.user.create({
    data: {
      name: 'Dr. Nusrat Jahan Chowdhury',
      email: 'dr.nusrat@bookmydoctor.bd',
      phone: '+8801811223355',
      passwordHash: defaultPasswordHash,
      role: Role.DOCTOR,
      isPhoneVerified: true,
      doctorProfile: {
        create: {
          bmdcRegNumber: 'A-56812',
          gender: 'Female',
          specialties: ['Gynecology & Obstetrics', 'Infertility Specialist'],
          degrees: ['MBBS (CMC)', 'FCPS (OBGYN)', 'Fellowship in Reproductive Medicine'],
          experienceYears: 11,
          aboutBio: 'Dedicated gynecologist and high-risk pregnancy specialist focusing on maternal health, gestational diabetes, and antenatal counseling.',
          languages: ['Bangla', 'English', 'Chittagonian'],
          verificationStatus: DoctorVerificationStatus.VERIFIED,
          verifiedAt: new Date(),
          profileScore: 92,
          rating: 4.85,
          totalReviews: 62,
          baseConsultationFee: 1000,
          followUpFee: 600,
          digitalFollowUpFee: 300,
          subscription: {
            create: {
              planId: proPlan.id,
              status: SubscriptionStatus.ACTIVE,
              startDate: new Date(),
              endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
            },
          },
          chambers: {
            create: [
              {
                name: 'Epic Health Care Consultation Suites',
                division: 'Chittagong',
                district: 'Chattogram',
                upazilaThana: 'Panchlaish',
                address: '19 K.B. Fazlul Kader Road, Panchlaish, Chittagong',
                contactPhone: '+8801819000111',
                consultationFee: 1000,
                followUpFee: 600,
                schedules: {
                  create: [
                    { dayOfWeek: 0, startTime: '16:00', endTime: '20:00', slotDurationMinutes: 15, maxPatientsPerShift: 15 },
                    { dayOfWeek: 1, startTime: '16:00', endTime: '20:00', slotDurationMinutes: 15, maxPatientsPerShift: 15 },
                    { dayOfWeek: 2, startTime: '16:00', endTime: '20:00', slotDurationMinutes: 15, maxPatientsPerShift: 15 },
                    { dayOfWeek: 3, startTime: '16:00', endTime: '20:00', slotDurationMinutes: 15, maxPatientsPerShift: 15 },
                  ],
                },
              },
            ],
          },
        },
      },
    },
    include: { doctorProfile: { include: { chambers: true } } },
  });

  // 5. Doctor 3: Pediatrician, Dhaka Mirpur
  const doc3User = await prisma.user.create({
    data: {
      name: 'Dr. Ashfaqur Rahman',
      email: 'dr.ashfaq@bookmydoctor.bd',
      phone: '+8801911223366',
      passwordHash: defaultPasswordHash,
      role: Role.DOCTOR,
      isPhoneVerified: true,
      doctorProfile: {
        create: {
          bmdcRegNumber: 'A-39904',
          gender: 'Male',
          specialties: ['Pediatrics', 'Child Nutrition', 'Neonatology'],
          degrees: ['MBBS', 'DCH', 'FCPS (Pediatrics)'],
          experienceYears: 14,
          aboutBio: 'Child healthcare and neonatal care specialist with 14 years of caring for infants, toddlers, and young adolescents.',
          languages: ['Bangla', 'English'],
          verificationStatus: DoctorVerificationStatus.VERIFIED,
          verifiedAt: new Date(),
          profileScore: 90,
          rating: 4.95,
          totalReviews: 110,
          baseConsultationFee: 800,
          followUpFee: 500,
          digitalFollowUpFee: 300,
          subscription: {
            create: {
              planId: basicPlan.id,
              status: SubscriptionStatus.ACTIVE,
              startDate: new Date(),
              endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          },
          chambers: {
            create: [
              {
                name: 'Ibn Sina Diagnostic & Consultation Center - Mirpur',
                division: 'Dhaka',
                district: 'Dhaka',
                upazilaThana: 'Mirpur',
                address: 'Plot 11, Avenue 1, Block D, Section 11, Mirpur, Dhaka',
                contactPhone: '+8801911000333',
                consultationFee: 800,
                followUpFee: 500,
                schedules: {
                  create: [
                    { dayOfWeek: 0, startTime: '18:00', endTime: '21:30', slotDurationMinutes: 15, maxPatientsPerShift: 14 },
                    { dayOfWeek: 1, startTime: '18:00', endTime: '21:30', slotDurationMinutes: 15, maxPatientsPerShift: 14 },
                    { dayOfWeek: 2, startTime: '18:00', endTime: '21:30', slotDurationMinutes: 15, maxPatientsPerShift: 14 },
                    { dayOfWeek: 4, startTime: '18:00', endTime: '21:30', slotDurationMinutes: 15, maxPatientsPerShift: 14 },
                  ],
                },
              },
            ],
          },
        },
      },
    },
    include: { doctorProfile: { include: { chambers: true } } },
  });

  // 6. Doctor 4: Veterinary Specialist (Cat-First & Small Animals)
  const vetDocUser = await prisma.user.create({
    data: {
      name: 'Dr. Rafiqul Islam (Vet)',
      email: 'dr.rafiq.vet@bookmydoctor.bd',
      phone: '+8801733445566',
      passwordHash: defaultPasswordHash,
      role: Role.DOCTOR,
      isPhoneVerified: true,
      doctorProfile: {
        create: {
          bmdcRegNumber: 'VET-BD-1092',
          gender: 'Male',
          specialties: ['Veterinary Medicine', 'Feline Specialist (Cat-First)', 'Pet Surgery & Vaccinations'],
          isVeterinary: true,
          degrees: ['DVM (BAU)', 'MS in Small Animal Medicine (BAU)'],
          experienceYears: 8,
          aboutBio: 'Compassionate cat-first veterinary practitioner dedicated to feline viral infections, feline nutrition, microchipping, and routine immunizations.',
          languages: ['Bangla', 'English'],
          verificationStatus: DoctorVerificationStatus.VERIFIED,
          verifiedAt: new Date(),
          profileScore: 94,
          rating: 4.9,
          totalReviews: 48,
          baseConsultationFee: 700,
          followUpFee: 400,
          digitalFollowUpFee: 250,
          subscription: {
            create: {
              planId: proPlan.id,
              status: SubscriptionStatus.ACTIVE,
              startDate: new Date(),
              endDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
            },
          },
          chambers: {
            create: [
              {
                name: 'Gulshan Pet Clinic & Feline Care',
                division: 'Dhaka',
                district: 'Dhaka',
                upazilaThana: 'Gulshan',
                address: 'Road 123, House 4A, Gulshan-1, Dhaka',
                contactPhone: '+8801733000444',
                consultationFee: 700,
                followUpFee: 400,
                schedules: {
                  create: [
                    { dayOfWeek: 0, startTime: '11:00', endTime: '18:00', slotDurationMinutes: 20, maxPatientsPerShift: 18 },
                    { dayOfWeek: 2, startTime: '11:00', endTime: '18:00', slotDurationMinutes: 20, maxPatientsPerShift: 18 },
                    { dayOfWeek: 4, startTime: '11:00', endTime: '18:00', slotDurationMinutes: 20, maxPatientsPerShift: 18 },
                    { dayOfWeek: 6, startTime: '11:00', endTime: '18:00', slotDurationMinutes: 20, maxPatientsPerShift: 18 },
                  ],
                },
              },
            ],
          },
        },
      },
    },
    include: { doctorProfile: { include: { chambers: true } } },
  });

  // 7. Pending Doctor (for Super Admin approval testing)
  await prisma.user.create({
    data: {
      name: 'Dr. Farhana Sultana',
      email: 'dr.farhana@bookmydoctor.bd',
      phone: '+8801611223377',
      passwordHash: defaultPasswordHash,
      role: Role.DOCTOR,
      isPhoneVerified: true,
      doctorProfile: {
        create: {
          bmdcRegNumber: 'A-67180',
          gender: 'Female',
          specialties: ['Dermatology & Venereology', 'Cosmetology'],
          degrees: ['MBBS (SSMC)', 'DDV (BSMMU)'],
          experienceYears: 6,
          aboutBio: 'Specialist in clinical dermatology, acne scarring, eczema, and skin allergy diagnostics.',
          languages: ['Bangla', 'English'],
          verificationStatus: DoctorVerificationStatus.PENDING,
          profileScore: 70,
          rating: 0,
          totalReviews: 0,
          baseConsultationFee: 800,
          followUpFee: 500,
          digitalFollowUpFee: 300,
          chambers: {
            create: [
              {
                name: 'Laser & Skin Care Centre Sylhet',
                division: 'Sylhet',
                district: 'Sylhet',
                upazilaThana: 'Zindabazar',
                address: 'Al-Hamra Shopping City, Level 5, Zindabazar, Sylhet',
                consultationFee: 800,
                followUpFee: 500,
              },
            ],
          },
        },
      },
    },
  });

  // 8. Registered Patient with Profile, Family Members & Pet Profile
  const patientUser = await prisma.user.create({
    data: {
      name: 'Rahim Uddin',
      email: 'rahim@gmail.com',
      phone: '+8801811112222',
      passwordHash: defaultPasswordHash,
      role: Role.PATIENT,
      isPhoneVerified: true,
      patientProfile: {
        create: {
          gender: 'Male',
          bloodGroup: 'B+',
          allergies: ['Penicillin', 'Dust'],
          chronicConditions: ['Mild Hypertension'],
          emergencyContact: '+8801811113333 (Wife)',
          address: 'Block C, Lalmatia, Dhaka',
          consentHealthRecommendations: true,
          familyMembers: {
            create: [
              {
                name: 'Khadija Begum',
                relationship: 'Mother',
                gender: 'Female',
                bloodGroup: 'O+',
                allergies: ['Sulfonamides'],
                notes: 'Type 2 Diabetic on oral hypoglycemics.',
              },
              {
                name: 'Aayan Uddin',
                relationship: 'Child',
                gender: 'Male',
                bloodGroup: 'B+',
                notes: 'Age 5, routine childhood immunizations up-to-date.',
              },
            ],
          },
          pets: {
            create: [
              {
                name: 'Mimi',
                species: 'Cat',
                breed: 'Persian Longhair',
                gender: 'Female',
                weightKg: 3.8,
                isNeutered: true,
                notes: 'Very gentle indoor cat. Regular brushing needed.',
                vaccinations: {
                  create: [
                    {
                      vaccineName: 'Rabies Feline Vaccine',
                      administeredDate: new Date('2026-01-10'),
                      dueDate: new Date('2027-01-10'),
                      administeredBy: 'Dr. Rafiqul Islam (Vet)',
                      isCompleted: true,
                    },
                    {
                      vaccineName: 'FVRCP Tri-cat Core Booster',
                      administeredDate: new Date('2026-02-15'),
                      dueDate: new Date('2026-11-20'),
                      administeredBy: 'Dr. Rafiqul Islam (Vet)',
                      isCompleted: false,
                    },
                  ],
                },
              },
            ],
          },
        },
      },
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
  console.log(`Created Patient: ${patientUser.email}`);

  // 9. Create a Completed Appointment and its corresponding Medical Case
  const doc1 = doc1User.doctorProfile!;
  const doc1Chamber = doc1.chambers[0];

  const completedAppt = await prisma.appointment.create({
    data: {
      appointmentNumber: 'BMD-20261020-001',
      doctorId: doc1.id,
      chamberId: doc1Chamber.id,
      patientUserId: patientUser.id,
      patientName: patientUser.name,
      patientPhone: patientUser.phone,
      patientEmail: patientUser.email,
      appointmentDate: new Date('2026-10-20'),
      timeSlot: '17:30 - 17:45',
      serialNumber: 3,
      status: AppointmentStatus.COMPLETED,
      problemDescription: 'High blood pressure readings for last 2 weeks and mild morning dizziness.',
      otpVerified: true,
    },
  });

  // Now create the Medical Case for this completed appointment
  const medCase = await prisma.medicalCase.create({
    data: {
      caseNumber: 'MC-2026-DH-1092',
      appointmentId: completedAppt.id,
      doctorId: doc1.id,
      patientUserId: patientUser.id,
      title: 'Essential Hypertension Grade 1 & Hyperlipidemia Evaluation',
      diagnosis: 'Primary Hypertension (Grade 1), Dyslipidemia suspected.',
      clinicalNotes: 'Patient presented with BP 150/95 mmHg sitting. Heart sounds normal. Advised lifestyle modifications, low sodium diet, and ordered routine baseline labs.',
      status: CaseStatus.OPEN,
      requireFollowUp: true,
      followUpDueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      prescriptions: {
        create: {
          doctorId: doc1.id,
          vitals: { bp: '150/95 mmHg', pulse: '78 bpm', weight: '74 kg', bmi: '25.6' },
          advice: 'Restricted dietary sodium (<2g/day). 30 minutes brisk walking daily. Monitor home BP chart daily for 7 days.',
          dietaryAdvice: 'Avoid fatty beef, fried snacks, extra table salt, and tobacco.',
          nextVisitDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          items: {
            create: [
              {
                brandName: 'Angilock 50',
                genericName: 'Losartan Potassium',
                dosageForm: 'Tablet',
                strength: '50mg',
                dosageInstruction: '0+0+1',
                timing: 'At night before sleep',
                durationDays: 30,
                specialInstructions: 'Continue regularly without skipping.',
              },
              {
                brandName: 'Seclo 20',
                genericName: 'Omeprazole',
                dosageForm: 'Capsule',
                strength: '20mg',
                dosageInstruction: '1+0+0',
                timing: '30 minutes before breakfast',
                durationDays: 14,
              },
            ],
          },
        },
      },
      investigationOrders: {
        create: [
          { testName: 'Lipid Profile (Fasting 12 hours)', instructions: 'Fasting 10-12 hours required' },
          { testName: 'Serum Creatinine', instructions: 'Routine blood sample' },
          { testName: 'ECG (12 Leads)', instructions: 'Chamber resting ECG' },
        ],
      },
      patientReports: {
        create: [
          {
            testName: 'Lipid Profile Report',
            fileUrl: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=80',
            fileType: 'image/jpeg',
            hospitalClinicName: 'Popular Diagnostic Centre, Dhanmondi',
            reportDate: new Date('2026-10-21'),
            aiSummary: 'Total Cholesterol: 235 mg/dL (Elevated), LDL: 155 mg/dL (Borderline High), Triglycerides: 190 mg/dL, HDL: 42 mg/dL.',
          },
        ],
      },
      digitalFollowUps: {
        create: {
          patientQuery: 'Doctor, I have uploaded my lipid profile report as advised. My LDL is 155. Should I start any additional cholesterol medicine now?',
          doctorAdvice: 'Reviewed lipid profile. Total cholesterol is mildly elevated. Continue Losartan 50mg. We will add Rosuva 10mg (Rosuvastatin) 0+0+1 at bedtime for 3 months. Repeat lipid profile in 12 weeks.',
          status: 'REVIEWED',
          paymentAmount: 400,
          paymentStatus: 'COMPLETED',
          paymentTxnId: 'TXN-BKASH-89214710',
          reviewedAt: new Date('2026-10-22'),
        },
      },
      timeline: {
        create: [
          {
            eventType: 'APPOINTMENT_BOOKED',
            title: 'Chamber Appointment Booked',
            description: 'Patient booked appointment at Popular Diagnostic Centre Dhanmondi.',
          },
          {
            eventType: 'CONSULTATION_COMPLETED',
            title: 'Physical Consultation Completed',
            description: 'Doctor concluded chamber visit. Medical Case opened.',
          },
          {
            eventType: 'PRESCRIPTION_ISSUED',
            title: 'Prescription & Advice Generated',
            description: 'Prescribed Losartan 50mg and requested baseline metabolic tests.',
          },
          {
            eventType: 'REPORT_UPLOADED',
            title: 'Patient Uploaded Investigation Report',
            description: 'Lipid Profile report from Popular Diagnostic uploaded.',
          },
          {
            eventType: 'DIGITAL_FOLLOWUP_REQUESTED',
            title: 'Digital Follow-up Requested & Paid',
            description: 'Patient requested digital report review (400 BDT paid via bKash).',
          },
          {
            eventType: 'DOCTOR_ADVICE_GIVEN',
            title: 'Doctor Reviewed Reports & Advised',
            description: 'Doctor reviewed Lipid Profile and added Rosuvastatin 10mg advice.',
          },
        ],
      },
    },
  });

  // 10. Doctor Reviews
  await prisma.doctorReview.create({
    data: {
      doctorId: doc1.id,
      patientUserId: patientUser.id,
      rating: 5,
      comment: 'Prof. Tanvir explained everything calmly and gave very practical lifestyle advice. Highly recommended cardiologist!',
      isVerifiedConsultation: true,
    },
  });

  // 11. Health Recommendations
  await prisma.healthRecommendation.create({
    data: {
      patientUserId: patientUser.id,
      recommendationType: 'DIABETIC_FOLLOWUP',
      title: 'Family Health Alert: Khadija Begum (Mother)',
      message: 'Based on your family health record, routine HbA1c test is recommended every 3-6 months for diabetic care.',
      suggestedSpecialty: 'Endocrinology / Diabetology',
    },
  });

  await prisma.healthRecommendation.create({
    data: {
      patientUserId: patientUser.id,
      recommendationType: 'PET_DEWORMING',
      title: 'Pet Care Alert: Mimi (Cat)',
      message: 'FVRCP Tri-cat Core Booster is due soon. Protect Mimi against feline viral rhinotracheitis and panleukopenia.',
      suggestedSpecialty: 'Veterinary Medicine',
      suggestedDoctorId: vetDocUser.doctorProfile?.id,
    },
  });

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
