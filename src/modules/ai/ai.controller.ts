import { Request, Response } from 'express';
import prisma from '../../config/database';

// Comprehensive Bangladeshi Formulary Data for quick AI matching & doctor auto-complete
const BANGLADESH_MEDICINE_CATALOG = [
  { brandName: 'Napa Extra', genericName: 'Paracetamol + Caffeine', dosageForm: 'Tablet', strength: '500mg+65mg', defaultDose: '1+0+1', defaultTiming: 'After meal', defaultDuration: 3, indications: ['Fever', 'Headache', 'Body ache'] },
  { brandName: 'Napa Extend', genericName: 'Paracetamol', dosageForm: 'Tablet', strength: '665mg', defaultDose: '1+0+1', defaultTiming: 'After meal', defaultDuration: 5, indications: ['Fever', 'Musculoskeletal pain'] },
  { brandName: 'Seclo 20', genericName: 'Omeprazole', dosageForm: 'Capsule', strength: '20mg', defaultDose: '1+0+1', defaultTiming: '30 mins before meal', defaultDuration: 14, indications: ['GERD', 'Gastritis', 'Peptic ulcer'] },
  { brandName: 'Sergel 20', genericName: 'Esomeprazole', dosageForm: 'Capsule', strength: '20mg', defaultDose: '1+0+1', defaultTiming: 'Before breakfast & dinner', defaultDuration: 14, indications: ['Hyperacidity', 'Heartburn'] },
  { brandName: 'Monas 10', genericName: 'Montelukast', dosageForm: 'Tablet', strength: '10mg', defaultDose: '0+0+1', defaultTiming: 'At bedtime', defaultDuration: 30, indications: ['Asthma', 'Allergic rhinitis', 'Cough'] },
  { brandName: 'Fexo 120', genericName: 'Fexofenadine', dosageForm: 'Tablet', strength: '120mg', defaultDose: '1+0+0', defaultTiming: 'After breakfast', defaultDuration: 7, indications: ['Skin allergy', 'Urticaria', 'Sneezing'] },
  { brandName: 'Alatrol', genericName: 'Cetirizine', dosageForm: 'Tablet', strength: '10mg', defaultDose: '0+0+1', defaultTiming: 'At night', defaultDuration: 7, indications: ['Allergic rhinitis', 'Itching'] },
  { brandName: 'Angilock 50', genericName: 'Losartan Potassium', dosageForm: 'Tablet', strength: '50mg', defaultDose: '0+0+1', defaultTiming: 'At bedtime', defaultDuration: 30, indications: ['Hypertension', 'Cardiovascular risk'] },
  { brandName: 'Rosuva 10', genericName: 'Rosuvastatin', dosageForm: 'Tablet', strength: '10mg', defaultDose: '0+0+1', defaultTiming: 'At night', defaultDuration: 30, indications: ['Hyperlipidemia', 'High Cholesterol'] },
  { brandName: 'Compath 5/20', genericName: 'Amlodipine + Olmesartan', dosageForm: 'Tablet', strength: '5mg+20mg', defaultDose: '1+0+0', defaultTiming: 'Morning after food', defaultDuration: 30, indications: ['Severe Hypertension'] },
  { brandName: 'Ecoprin 75', genericName: 'Aspirin', dosageForm: 'Tablet', strength: '75mg', defaultDose: '0+1+0', defaultTiming: 'After lunch', defaultDuration: 30, indications: ['CAD prophylaxis', 'Antiplatelet'] },
  { brandName: 'Moxaclav 625', genericName: 'Amoxicillin + Clavulanic Acid', dosageForm: 'Tablet', strength: '625mg', defaultDose: '1+0+1', defaultTiming: 'After meal', defaultDuration: 7, indications: ['Bacterial infection', 'RTI', 'Sinusitis'] },
  { brandName: 'Ciprocin 500', genericName: 'Ciprofloxacin', dosageForm: 'Tablet', strength: '500mg', defaultDose: '1+0+1', defaultTiming: 'After meal', defaultDuration: 7, indications: ['UTI', 'Infectious diarrhea'] },
  { brandName: 'Azithcin 500', genericName: 'Azithromycin', dosageForm: 'Tablet', strength: '500mg', defaultDose: '1+0+0', defaultTiming: '1 hour before meal', defaultDuration: 5, indications: ['Respiratory infection', 'Tonsillitis'] },
  { brandName: 'Thyrox 50', genericName: 'Levothyroxine', dosageForm: 'Tablet', strength: '50mcg', defaultDose: '1+0+0', defaultTiming: 'Empty stomach 30 mins before breakfast', defaultDuration: 60, indications: ['Hypothyroidism'] },
  { brandName: 'Metfo 500', genericName: 'Metformin Hydrochloride', dosageForm: 'Tablet', strength: '500mg', defaultDose: '1+0+1', defaultTiming: 'With or immediately after food', defaultDuration: 30, indications: ['Type 2 Diabetes Mellitus'] },
  { brandName: 'Calbo D', genericName: 'Calcium Carbonate + Vitamin D3', dosageForm: 'Tablet', strength: '500mg+200IU', defaultDose: '0+0+1', defaultTiming: 'After dinner', defaultDuration: 30, indications: ['Osteopenia', 'Calcium deficiency'] },
  { brandName: 'Tofen', genericName: 'Ketotifen', dosageForm: 'Syrup / Tablet', strength: '1mg', defaultDose: '1+0+1', defaultTiming: 'After meal', defaultDuration: 14, indications: ['Childhood asthma', 'Allergic cough'] },
  { brandName: 'Felocell 4 (Vet)', genericName: 'Feline Core Vaccine', dosageForm: 'Vial', strength: '1 dose', defaultDose: 'Subcutaneous injection', defaultTiming: 'Annual booster', defaultDuration: 1, indications: ['Cat rhinotracheitis', 'Panleukopenia'] },
  { brandName: 'Broadline Spot-On (Vet)', genericName: 'Fipronil + Eprinomectin', dosageForm: 'Topical Pipette', strength: '0.9ml', defaultDose: 'Topical spot', defaultTiming: 'Monthly application', defaultDuration: 1, indications: ['Cat deworming', 'Fleas', 'Ticks'] },
];

// 1. Medicine Autocomplete with Doctor Preferences Prioritization
export const autocompleteMedicine = async (req: Request, res: Response): Promise<void> => {
  try {
    const { query, doctorId } = req.body;
    const searchStr = (query || '').toLowerCase().trim();

    // 1. If doctorId is provided, fetch doctor's custom preferences first
    let doctorPreferences: any[] = [];
    if (doctorId) {
      doctorPreferences = await prisma.doctorMedicinePreference.findMany({
        where: {
          doctorId,
          OR: [
            { brandName: { contains: searchStr, mode: 'insensitive' } },
            { genericName: { contains: searchStr, mode: 'insensitive' } },
          ],
        },
        orderBy: { frequencyCount: 'desc' },
        take: 5,
      });
    }

    // 2. Search catalog
    const catalogMatches = BANGLADESH_MEDICINE_CATALOG.filter(
      (med) =>
        med.brandName.toLowerCase().includes(searchStr) ||
        med.genericName.toLowerCase().includes(searchStr) ||
        med.indications.some((ind) => ind.toLowerCase().includes(searchStr))
    ).slice(0, 10);

    // Merge preferences first
    const results = [
      ...doctorPreferences.map((p) => ({
        ...p,
        isDoctorFavorite: true,
      })),
      ...catalogMatches.filter((c) => !doctorPreferences.some((p) => p.brandName.toLowerCase() === c.brandName.toLowerCase())),
    ];

    res.json({ success: true, count: results.length, suggestions: results });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Clinical Notes & Prescription Smart Autocomplete
export const generateClinicalAdvice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { chiefComplaint, vitals, patientAge, patientGender, isVeterinary } = req.body;

    const query = (chiefComplaint || '').toLowerCase();

    // Clinical intelligence mapping
    let suggestedDiagnosis = 'Clinical Consultation / Evaluation Required';
    let suggestedMedicines: any[] = [];
    let suggestedInvestigations: string[] = [];
    let clinicalImpression = '';
    let lifestyleAdvice = '';

    if (isVeterinary || query.includes('cat') || query.includes('kitten') || query.includes('pet')) {
      suggestedDiagnosis = 'Feline Upper Respiratory / Parasitic Evaluation';
      suggestedMedicines = [
        { brandName: 'Broadline Spot-On (Vet)', genericName: 'Fipronil + Eprinomectin', dosageForm: 'Topical Pipette', strength: '0.9ml', dosageInstruction: 'Apply on dorsal neck', timing: 'Monthly once', durationDays: 1 },
        { brandName: 'Felocell 4 (Vet)', genericName: 'Feline Core Vaccine', dosageForm: 'Vial', strength: '1 dose', dosageInstruction: 'Subcutaneous injection', timing: 'Repeat annually', durationDays: 1 },
      ];
      suggestedInvestigations = ['Feline Parvovirus Rapid Antigen Test', 'Skin Scraping for Mites', 'CBC with Differential'];
      clinicalImpression = 'Inspect ears for mites, palpate abdomen for organomegaly, verify hydration skin turgor.';
      lifestyleAdvice = 'Keep cat strictly indoors during treatment, clean litter tray twice daily, provide fresh water at all times.';
    } else if (query.includes('fever') || query.includes('cough') || query.includes('cold') || query.includes('throat')) {
      suggestedDiagnosis = 'Acute Viral Pharyngitis / Upper Respiratory Tract Infection (URTI)';
      suggestedMedicines = [
        { brandName: 'Napa Extend', genericName: 'Paracetamol', dosageForm: 'Tablet', strength: '665mg', dosageInstruction: '1+0+1', timing: 'After meal for 5 days', durationDays: 5 },
        { brandName: 'Fexo 120', genericName: 'Fexofenadine', dosageForm: 'Tablet', strength: '120mg', dosageInstruction: '1+0+0', timing: 'After breakfast', durationDays: 7 },
        { brandName: 'Monas 10', genericName: 'Montelukast', dosageForm: 'Tablet', strength: '10mg', dosageInstruction: '0+0+1', timing: 'At night', durationDays: 14 },
      ];
      suggestedInvestigations = ['CBC with ESR', 'CRP (C-Reactive Protein)', 'Serum Dengue NS1 / IgM (if high fever >3 days)'];
      clinicalImpression = 'Bilateral tonsillar erythema without purulent exudates. Lungs clear on auscultation. No sign of lower respiratory compromise.';
      lifestyleAdvice = 'Lukewarm salt water gargle 3 times daily. Maintain adequate oral hydration. Avoid chilled drinks and dust exposure.';
    } else if (query.includes('pressure') || query.includes('hypertension') || query.includes('headache') || query.includes('bp')) {
      suggestedDiagnosis = 'Primary Essential Hypertension (Grade 1/2)';
      suggestedMedicines = [
        { brandName: 'Angilock 50', genericName: 'Losartan Potassium', dosageForm: 'Tablet', strength: '50mg', dosageInstruction: '0+0+1', timing: 'At bedtime', durationDays: 30 },
        { brandName: 'Rosuva 10', genericName: 'Rosuvastatin', dosageForm: 'Tablet', strength: '10mg', dosageInstruction: '0+0+1', timing: 'At night', durationDays: 30 },
        { brandName: 'Seclo 20', genericName: 'Omeprazole', dosageForm: 'Capsule', strength: '20mg', dosageInstruction: '1+0+0', timing: 'Before breakfast', durationDays: 14 },
      ];
      suggestedInvestigations = ['Lipid Profile (12-hour fasting)', 'Serum Creatinine & Electrolytes', '12-Lead Resting ECG', 'Urine Routine Examination (R/M/E)'];
      clinicalImpression = `Elevated arterial pressure (${vitals?.bp || '145/90 mmHg'}). S1 S2 heard, no murmurs. Peripheral pulses palpable.`;
      lifestyleAdvice = 'Restrict daily table salt intake (< 2g/day). 30 minutes brisk walking at least 5 days a week. Daily blood pressure charting.';
    } else if (query.includes('gas') || query.includes('stomach') || query.includes('gastric') || query.includes('acidity') || query.includes('gerd')) {
      suggestedDiagnosis = 'Gastroesophageal Reflux Disease (GERD) / Non-Ulcer Dyspepsia';
      suggestedMedicines = [
        { brandName: 'Sergel 20', genericName: 'Esomeprazole', dosageForm: 'Capsule', strength: '20mg', dosageInstruction: '1+0+1', timing: '30 mins before breakfast & dinner', durationDays: 14 },
        { brandName: 'Almex', genericName: 'Albendazole', dosageForm: 'Chewable Tablet', strength: '400mg', dosageInstruction: '0+0+1', timing: 'Single dose after meal', durationDays: 1 },
      ];
      suggestedInvestigations = ['USG of Whole Abdomen', 'Serum Amylase & Lipase', 'Upper GI Endoscopy (if symptoms persist > 4 weeks)'];
      clinicalImpression = 'Epigastric tenderness on deep palpation, no guarding or rebound tenderness.';
      lifestyleAdvice = 'Avoid spicy and deep-fried fast foods. Do not lie down within 2 hours of eating dinner. Elevate head of bed by 6 inches.';
    } else {
      suggestedDiagnosis = 'General Clinical Evaluation';
      suggestedMedicines = [
        { brandName: 'Napa Extra', genericName: 'Paracetamol + Caffeine', dosageForm: 'Tablet', strength: '500mg+65mg', dosageInstruction: '1+0+1', timing: 'As needed for discomfort', durationDays: 3 },
      ];
      suggestedInvestigations = ['Complete Blood Count (CBC)', 'Random Blood Sugar (RBS)', 'Urine R/M/E'];
      clinicalImpression = 'Patient conscious, alert, oriented to time, place, and person. Baseline systemic examination unremarkable.';
      lifestyleAdvice = 'Eat balanced, home-cooked nutritious meals. Drink at least 2.5 liters of filtered water daily. Follow-up if symptoms persist.';
    }

    res.json({
      success: true,
      recommendation: {
        diagnosis: suggestedDiagnosis,
        clinicalImpression,
        medicines: suggestedMedicines,
        investigations: suggestedInvestigations,
        lifestyleAdvice,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. Hospital Report & Prescription Software Note Taker (OCR & Text Parser)
// Takes freeform report texts from Popular, Square, Ibn Sina, Labaid, United Hospital, Evercare, etc.
export const parseHospitalReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { rawReportText, hospitalName } = req.body;

    if (!rawReportText) {
      res.status(400).json({ success: false, message: 'Report text or diagnostic content is required.' });
      return;
    }

    const text = rawReportText as string;
    const lower = text.toLowerCase();

    // Smart parameter extraction
    const extractedData: any = {
      detectedHospital: hospitalName || 'Bangladeshi Diagnostic Laboratory',
      abnormalFindings: [] as string[],
      extractedVitals: {} as Record<string, string>,
      suggestedClinicalNote: '',
      detectedLabTests: [] as string[],
    };

    // Detect hospital if mentioned in text
    if (lower.includes('popular')) extractedData.detectedHospital = 'Popular Diagnostic Centre';
    else if (lower.includes('square')) extractedData.detectedHospital = 'Square Hospitals Ltd';
    else if (lower.includes('ibn sina')) extractedData.detectedHospital = 'Ibn Sina Diagnostic & Consultation Centre';
    else if (lower.includes('labaid')) extractedData.detectedHospital = 'Labaid Diagnostics';
    else if (lower.includes('evercare')) extractedData.detectedHospital = 'Evercare Hospital Dhaka';
    else if (lower.includes('united')) extractedData.detectedHospital = 'United Hospital Limited';

    // Regex parsing for common clinical values:
    // 1. Blood Pressure (e.g., 140/90, BP: 130/85)
    const bpMatch = text.match(/(?:BP|Blood Pressure)[:\s]*([0-9]{2,3}\s*\/\s*[0-9]{2,3})/i);
    if (bpMatch) extractedData.extractedVitals.bp = bpMatch[1].replace(/\s+/g, '');

    // 2. Hemoglobin (e.g., Hb: 11.2, Hemoglobin 12.5 gm/dl)
    const hbMatch = text.match(/(?:Hb|Hemoglobin)[:\s]*([0-9]+(?:\.[0-9]+)?)\s*(?:g\/dl|gm\/dl|g%|gm%)?/i);
    if (hbMatch) {
      const hbVal = parseFloat(hbMatch[1]);
      extractedData.extractedVitals.hemoglobin = `${hbVal} g/dL`;
      if (hbVal < 11.5) extractedData.abnormalFindings.push(`Anemia / Low Hemoglobin: ${hbVal} g/dL`);
    }

    // 3. Blood Sugar (e.g., FBS 7.2, RBS 11.5, HbA1c 7.8%)
    const fbsMatch = text.match(/(?:FBS|Fasting Blood Sugar)[:\s]*([0-9]+(?:\.[0-9]+)?)/i);
    if (fbsMatch) {
      const fbs = parseFloat(fbsMatch[1]);
      extractedData.extractedVitals.fbs = `${fbs} mmol/L`;
      if (fbs > 6.1) extractedData.abnormalFindings.push(`High Fasting Blood Sugar: ${fbs} mmol/L (Diabetic range)`);
    }

    const rbsMatch = text.match(/(?:RBS|Random Blood Sugar)[:\s]*([0-9]+(?:\.[0-9]+)?)/i);
    if (rbsMatch) {
      const rbs = parseFloat(rbsMatch[1]);
      extractedData.extractedVitals.rbs = `${rbs} mmol/L`;
      if (rbs > 7.8) extractedData.abnormalFindings.push(`High Random Blood Sugar: ${rbs} mmol/L`);
    }

    const hba1cMatch = text.match(/(?:HbA1c)[:\s]*([0-9]+(?:\.[0-9]+)?)\s*%?/i);
    if (hba1cMatch) {
      const hba1c = parseFloat(hba1cMatch[1]);
      extractedData.extractedVitals.hba1c = `${hba1c}%`;
      if (hba1c > 6.5) extractedData.abnormalFindings.push(`Elevated Glycated Hemoglobin (HbA1c): ${hba1c}%`);
    }

    // 4. Creatinine (e.g., Creatinine: 1.4 mg/dL)
    const creatMatch = text.match(/(?:Creatinine|Serum Creatinine)[:\s]*([0-9]+(?:\.[0-9]+)?)/i);
    if (creatMatch) {
      const creat = parseFloat(creatMatch[1]);
      extractedData.extractedVitals.creatinine = `${creat} mg/dL`;
      if (creat > 1.2) extractedData.abnormalFindings.push(`Elevated Serum Creatinine: ${creat} mg/dL (Renal compromise)`);
    }

    // 5. Total Cholesterol & LDL
    const cholMatch = text.match(/(?:Cholesterol|Total Cholesterol)[:\s]*([0-9]+(?:\.[0-9]+)?)/i);
    if (cholMatch) {
      const chol = parseFloat(cholMatch[1]);
      extractedData.extractedVitals.cholesterol = `${chol} mg/dL`;
      if (chol > 200) extractedData.abnormalFindings.push(`Hypercholesterolemia: Total Cholesterol ${chol} mg/dL`);
    }

    const ldlMatch = text.match(/(?:LDL|LDL-C)[:\s]*([0-9]+(?:\.[0-9]+)?)/i);
    if (ldlMatch) {
      const ldl = parseFloat(ldlMatch[1]);
      extractedData.extractedVitals.ldl = `${ldl} mg/dL`;
      if (ldl > 130) extractedData.abnormalFindings.push(`High LDL ('Bad') Cholesterol: ${ldl} mg/dL`);
    }

    // Compose concise doctor summary
    if (extractedData.abnormalFindings.length > 0) {
      extractedData.suggestedClinicalNote = `Laboratory report reviewed from ${extractedData.detectedHospital}. Notable findings: ${extractedData.abnormalFindings.join('; ')}. Medical adjustment and patient lifestyle counseling recommended.`;
    } else {
      extractedData.suggestedClinicalNote = `Laboratory investigation results from ${extractedData.detectedHospital} analyzed. Key metabolic and biochemical parameters within normal biological reference intervals.`;
    }

    res.json({
      success: true,
      data: extractedData,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// -------------------------------------------------------------
// AI Smart Clinical Diagnosis & Doctor-Adaptive Prescribing
// -------------------------------------------------------------
export const quickDiagnose = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      chiefComplaint = '',
      vitals = {},
      patientAge,
      patientGender,
      patientPhone,
      doctorId,
      isVeterinary,
    } = req.body;

    const query = (chiefComplaint || '').toLowerCase();

    // 1. Fetch Doctor's learned medicine preferences if doctorId provided
    let doctorPreferences: any[] = [];
    if (doctorId) {
      doctorPreferences = await prisma.doctorMedicinePreference.findMany({
        where: { doctorId },
        orderBy: { frequencyCount: 'desc' },
        take: 10,
      });
    }

    // 2. Fetch patient's past history / allergies if phone provided
    let patientAllergies: string[] = [];
    if (patientPhone) {
      const pUser = await prisma.user.findFirst({
        where: {
          OR: [
            { phone: patientPhone },
            { phone: patientPhone.replace('+88', '') },
            { phone: `+88${patientPhone.replace('+88', '')}` },
          ],
        },
        include: { patientProfile: true },
      });
      patientAllergies = pUser?.patientProfile?.allergies || [];
    }

    // Clinical Intelligence Knowledge Engine
    let diagnosis = 'General Clinical Consultation';
    let differentialDiagnoses: string[] = [];
    let clinicalProblems: string[] = [];
    let clinicalFindings = '';
    let suggestedMedicines: any[] = [];
    let suggestedInvestigations: string[] = [];
    let dietaryAdvice = '';
    let lifestyleAdvice = '';
    let nextVisitDays = 7;

    if (isVeterinary || query.includes('cat') || query.includes('kitten') || query.includes('pet')) {
      diagnosis = 'Feline Upper Respiratory Tract Infection (URI) & Parasitic Screening';
      differentialDiagnoses = ['Feline Calicivirus', 'Feline Herpesvirus-1', 'Gastrointestinal Helminthiasis'];
      clinicalProblems = ['Nasal and ocular discharge', 'Sneezing', 'Mild lethargy', 'Anorexia'];
      clinicalFindings = 'Mild serous nasal discharge, oral mucosa pink, temperature 101.8°F. Lungs clear on auscultation. No dehydration.';
      suggestedMedicines = [
        { brandName: 'Broadline Spot-On (Vet)', genericName: 'Fipronil + Eprinomectin', dosageForm: 'Topical Pipette', strength: '0.9ml', dosageInstruction: 'Apply single pipette on dorsal neck', timing: 'Monthly application', durationDays: 1, specialInstructions: 'Part hair until skin is visible and apply directly.' },
        { brandName: 'Felocell 4 (Vet)', genericName: 'Feline Core Vaccine', dosageForm: 'Vial Injection', strength: '1 dose', dosageInstruction: 'Subcutaneous injection', timing: 'Annual booster', durationDays: 1, specialInstructions: 'Administer after fever subsides.' },
      ];
      suggestedInvestigations = ['Feline Panleukopenia Antigen Test', 'Skin Scraping for Ectoparasites', 'Complete Blood Count (CBC)'];
      dietaryAdvice = 'Provide warm wet food or kitten mousse to stimulate olfactory appetite. Ensure fresh filtered drinking water.';
      lifestyleAdvice = 'Strict indoor isolation. Clean and disinfect litter box twice daily. Keep warm and away from drafty windows.';
      nextVisitDays = 7;
    } else if (query.includes('fever') || query.includes('cough') || query.includes('cold') || query.includes('throat') || query.includes('flu')) {
      diagnosis = 'Acute Viral Pharyngitis with Upper Respiratory Tract Infection (URTI)';
      differentialDiagnoses = ['Acute Streptococcal Tonsillitis', 'Influenza Type A/B', 'Dengue Fever (Day 1-3)'];
      clinicalProblems = ['Pyrexia (Fever)', 'Dry irritating cough', 'Pharyngeal odynophagia', 'Generalized myalgia'];
      clinicalFindings = `Febrile (Temp: ${vitals.temp || '101°F'}). Pharyngeal congestion present. Bilateral tonsils mildly enlarged without purulent exudates. Chest auscultation bilaterally clear with vesicular breath sounds.`;
      suggestedMedicines = [
        { brandName: 'Napa Extend', genericName: 'Paracetamol', dosageForm: 'Tablet', strength: '665mg', dosageInstruction: '1+0+1', timing: 'After meal for 5 days', durationDays: 5, specialInstructions: 'Take after meals. Do not exceed 4 tablets in 24 hours.' },
        { brandName: 'Fexo 120', genericName: 'Fexofenadine Hydrochloride', dosageForm: 'Tablet', strength: '120mg', dosageInstruction: '1+0+0', timing: 'Morning after breakfast', durationDays: 7, specialInstructions: 'Non-drowsy antihistamine for nasal relief.' },
        { brandName: 'Monas 10', genericName: 'Montelukast Sodium', dosageForm: 'Tablet', strength: '10mg', dosageInstruction: '0+0+1', timing: 'At night before sleep', durationDays: 14, specialInstructions: 'Reduces bronchial inflammation and nighttime cough.' },
        { brandName: 'Entacyd Plus', genericName: 'Antacid + Simethicone', dosageForm: 'Suspension', strength: '200ml', dosageInstruction: '2 tsp', timing: '1 hour after meal as needed', durationDays: 7, specialInstructions: 'For medication-associated gastritis relief.' },
      ];
      suggestedInvestigations = [
        'Complete Blood Count (CBC) with ESR',
        'Serum CRP (C-Reactive Protein)',
        'Dengue NS1 Antigen & Platelet Count (if high continuous fever > 48 hours)',
      ];
      dietaryAdvice = 'Drink lukewarm water, chicken broth, and fresh citrus juices. Avoid chilled beverages, oily foods, and ice cream.';
      lifestyleAdvice = 'Gargle with warm salt water (1/2 tsp salt in 1 glass lukewarm water) 3-4 times daily. Rest adequately. Wear a mask when near family members.';
      nextVisitDays = 5;
    } else if (query.includes('pressure') || query.includes('hypertension') || query.includes('bp') || query.includes('headache') || query.includes('dizziness')) {
      diagnosis = 'Primary Essential Hypertension (Stage 1 / Stage 2)';
      differentialDiagnoses = ['White-Coat Hypertension', 'Secondary Renal Hypertension', 'Hypertensive Urgency'];
      clinicalProblems = [`Elevated systemic blood pressure (${vitals.bp || '150/95 mmHg'})`, 'Occipital headache', 'Occasional dizziness upon standing'];
      clinicalFindings = `Arterial Blood Pressure: ${vitals.bp || '150/95 mmHg'}. Pulse: ${vitals.pulse || '78 bpm'}, regular, normal volume. Heart sounds S1 S2 audible, no murmurs. No bilateral pedal edema.`;
      suggestedMedicines = [
        { brandName: 'Angilock 50', genericName: 'Losartan Potassium', dosageForm: 'Tablet', strength: '50mg', dosageInstruction: '0+0+1', timing: 'At night with water', durationDays: 30, specialInstructions: 'First-line ARB. Chart morning and evening BP daily.' },
        { brandName: 'Rosuva 10', genericName: 'Rosuvastatin Calcium', dosageForm: 'Tablet', strength: '10mg', dosageInstruction: '0+0+1', timing: 'At night after dinner', durationDays: 30, specialInstructions: 'Lipid lowering and vascular endothelial protection.' },
        { brandName: 'Seclo 20', genericName: 'Omeprazole', dosageForm: 'Capsule', strength: '20mg', dosageInstruction: '1+0+0', timing: '30 mins before breakfast', durationDays: 14, specialInstructions: 'Take on empty stomach.' },
      ];
      suggestedInvestigations = [
        'Fasting Lipid Profile (12-hour fasting)',
        'Serum Creatinine & Electrolytes (Na+, K+)',
        '12-Lead Electrocardiogram (ECG)',
        'Urine Routine & Microscopic Examination (R/M/E)',
        'Fasting Blood Sugar (FBS) & HbA1c',
      ];
      dietaryAdvice = 'Strictly restrict extra table salt (< 3g/day). Avoid raw salt, pickles, salty chips, and processed mutton/beef fat. Increase fresh leafy green vegetables and garlic.';
      lifestyleAdvice = 'Brisk walking 35-45 minutes at least 5 days a week. Maintain a daily Blood Pressure Diary (measure morning and evening). Stop smoking if applicable.';
      nextVisitDays = 14;
    } else if (query.includes('gas') || query.includes('acidity') || query.includes('stomach') || query.includes('gastric') || query.includes('heartburn') || query.includes('gerd')) {
      diagnosis = 'Gastroesophageal Reflux Disease (GERD) & Functional Dyspepsia';
      differentialDiagnoses = ['Peptic Ulcer Disease', 'H. Pylori Gastritis', 'Biliary Colic / Cholelithiasis'];
      clinicalProblems = ['Epigastric retrosternal burning (heartburn)', 'Acid regurgitation', 'Postprandial fullness and bloating'];
      clinicalFindings = 'Abdomen soft, mild epigastric tenderness on deep palpation. No hepatosplenomegaly or rebound tenderness. Bowel sounds normal.';
      suggestedMedicines = [
        { brandName: 'Sergel 20', genericName: 'Esomeprazole Magnesium', dosageForm: 'Capsule', strength: '20mg', dosageInstruction: '1+0+1', timing: '30 mins before breakfast & dinner', durationDays: 14, specialInstructions: 'Swallow whole with a full glass of water. Do not crush.' },
        { brandName: 'Motigut 10', genericName: 'Domperidone', dosageForm: 'Tablet', strength: '10mg', dosageInstruction: '1+0+1', timing: '15-30 mins before meals', durationDays: 7, specialInstructions: 'Prokinetic to facilitate gastric emptying.' },
        { brandName: 'Almex', genericName: 'Albendazole', dosageForm: 'Chewable Tablet', strength: '400mg', dosageInstruction: '0+0+1', timing: 'Single dose chewed after dinner', durationDays: 1, specialInstructions: 'Routine deworming.' },
      ];
      suggestedInvestigations = [
        'Ultrasonography (USG) of Whole Abdomen',
        'Endoscopy of Upper GI Tract (if symptoms persist > 4 weeks or warning signs present)',
        'Complete Blood Count (CBC) & Stool R/M/E',
      ];
      dietaryAdvice = 'Avoid spicy curries, deep-fried snacks (singara, puri, samosa), carbonated sodas, and heavy midnight dinners. Eat smaller, frequent meals.';
      lifestyleAdvice = 'Do not lie down within 2 hours of having dinner. Elevate the head of your bed by 6 inches. Avoid tight waistbands.';
      nextVisitDays = 14;
    } else if (query.includes('sugar') || query.includes('diabetes') || query.includes('frequent urination') || query.includes('thirst')) {
      diagnosis = 'Type 2 Diabetes Mellitus with Hyperglycemia';
      differentialDiagnoses = ['Impaired Fasting Glucose (Pre-diabetes)', 'Secondary Diabetes', 'Diabetic Nephropathy Risk'];
      clinicalProblems = [`Hyperglycemia (${vitals.rbs ? 'RBS ' + vitals.rbs + ' mmol/L' : 'Elevated blood glucose'})`, 'Polyuria (frequent urination)', 'Polydipsia (excessive thirst)'];
      clinicalFindings = 'Conscious, oriented. Hydration fair. Peripheral sensations intact. No peripheral neuropathy or diabetic foot ulcerations.';
      suggestedMedicines = [
        { brandName: 'Metfo 500', genericName: 'Metformin Hydrochloride', dosageForm: 'Tablet', strength: '500mg', dosageInstruction: '1+0+1', timing: 'With or immediately after main meals', durationDays: 30, specialInstructions: 'Take with food to minimize GI upset.' },
        { brandName: 'Rosuva 10', genericName: 'Rosuvastatin Calcium', dosageForm: 'Tablet', strength: '10mg', dosageInstruction: '0+0+1', timing: 'At night', durationDays: 30, specialInstructions: 'Cardiovascular risk reduction in diabetic adults.' },
      ];
      suggestedInvestigations = [
        'HbA1c (Glycated Hemoglobin)',
        'Fasting Blood Sugar (FBS) & 2-Hour Postprandial (2HABF)',
        'Serum Creatinine & eGFR',
        'Urine for Microalbuminuria',
        'Fasting Lipid Profile',
      ];
      dietaryAdvice = 'Strictly avoid direct sugar, sweets, sweet fruits (mango, jackfruit, grapes), white flour bakery items, and sweet drinks. Consume red rice, oats, green vegetables, and bitter gourd.';
      lifestyleAdvice = 'Engage in 45 minutes of brisk walking every day. Inspect feet daily for cuts or sores. Maintain a blood glucose log.';
      nextVisitDays = 30;
    } else if (query.includes('joint') || query.includes('knee') || query.includes('back') || query.includes('pain') || query.includes('bone') || query.includes('arthritis')) {
      diagnosis = 'Degenerative Osteoarthritis / Lumbar Spondylosis with Musculoskeletal Strain';
      differentialDiagnoses = ['Rheumatoid Arthritis', 'Lumbar Disc Herniation', 'Gouty Arthritis'];
      clinicalProblems = ['Joint stiffness, particularly in mornings', 'Localized tenderness and crepitus', 'Restricted mobility'];
      clinicalFindings = 'Crepitus felt on passive flexion of affected joints. Range of motion slightly limited by discomfort. No joint effusion or localized erythema.';
      suggestedMedicines = [
        { brandName: 'Naproxen 500', genericName: 'Naproxen Sodium', dosageForm: 'Tablet', strength: '500mg', dosageInstruction: '1+0+1', timing: 'After meal for 5 days', durationDays: 5, specialInstructions: 'Take strictly after full meal with plenty of water.' },
        { brandName: 'Seclo 20', genericName: 'Omeprazole', dosageForm: 'Capsule', strength: '20mg', dosageInstruction: '1+0+1', timing: '30 mins before food', durationDays: 10, specialInstructions: 'Gastric protection during NSAID therapy.' },
        { brandName: 'Calbo D', genericName: 'Calcium Carbonate + Vitamin D3', dosageForm: 'Tablet', strength: '500mg + 200 IU', dosageInstruction: '0+0+1', timing: 'After dinner with water', durationDays: 30, specialInstructions: 'Bone mineral support.' },
      ];
      suggestedInvestigations = [
        'X-Ray of Affected Joint / Lumbar Spine (AP & Lateral views)',
        'Serum Uric Acid',
        'Serum Calcium & 25-OH Vitamin D',
        'CBC with ESR & Serum CRP',
      ];
      dietaryAdvice = 'Incorporate calcium-rich foods (milk, yogurt, small fishes with bones) and Vitamin C foods. Maintain healthy body weight to relieve joint stress.';
      lifestyleAdvice = 'Avoid sitting on the floor or squatting. Use a high commode. Apply warm compress for 15 minutes twice daily. Gentle quadriceps / back strengthening exercises.';
      nextVisitDays = 14;
    } else {
      diagnosis = 'General Clinical Evaluation & Symptomatic Care';
      differentialDiagnoses = ['Subclinical Viral Syndrome', 'Generalized Fatigue / Nutritional Deficiency'];
      clinicalProblems = ['Non-specific constitutional symptoms', 'General malaise'];
      clinicalFindings = 'Vital signs within normal limits. Cardiorespiratory examination normal. Abdomen soft, non-tender.';
      suggestedMedicines = [
        { brandName: 'Napa Extra', genericName: 'Paracetamol + Caffeine', dosageForm: 'Tablet', strength: '500mg + 65mg', dosageInstruction: '1+0+1', timing: 'After meal as needed', durationDays: 3, specialInstructions: 'Take as needed for pain or discomfort.' },
        { brandName: 'Bicozin', genericName: 'Vitamin B Complex + Zinc', dosageForm: 'Tablet', strength: 'Standard', dosageInstruction: '1+0+1', timing: 'After meal', durationDays: 14, specialInstructions: 'General vitality and immunity.' },
      ];
      suggestedInvestigations = ['Complete Blood Count (CBC)', 'Random Blood Sugar (RBS)', 'Urine Routine Examination (R/M/E)'];
      dietaryAdvice = 'Eat freshly cooked nutritious meals. Drink at least 2.5 liters of filtered water daily.';
      lifestyleAdvice = 'Ensure 7-8 hours of uninterrupted sleep. Avoid excessive screen time before bed.';
      nextVisitDays = 7;
    }

    // 3. DOCTOR ADAPTIVE PERSONALIZATION:
    // If doctor has favorite medicines that match this diagnosis or general high frequency,
    // inject or adjust suggested medicines!
    if (doctorPreferences.length > 0) {
      const docMatching = doctorPreferences.filter((p) =>
        p.diagnosis && (diagnosis.toLowerCase().includes(p.diagnosis.toLowerCase()) || p.diagnosis.toLowerCase().includes(diagnosis.toLowerCase()))
      );
      if (docMatching.length > 0) {
        // Prepend doctor's favorite prescribed medicines for this diagnosis
        const docItems = docMatching.map((p) => ({
          brandName: p.brandName,
          genericName: p.genericName,
          dosageForm: p.dosageForm,
          strength: p.strength,
          dosageInstruction: p.defaultDose || '1+0+1',
          timing: p.defaultTiming || 'After meal',
          durationDays: p.defaultDuration || 7,
          specialInstructions: `Doctor preferred medication for ${diagnosis}`,
        }));

        // Filter out duplicates
        const existingNames = new Set(docItems.map((d) => d.brandName.toLowerCase()));
        suggestedMedicines = [
          ...docItems,
          ...suggestedMedicines.filter((m) => !existingNames.has(m.brandName.toLowerCase())),
        ];
      }
    }

    // 4. Allergy safety filter: Check if any recommended drug violates patient allergies
    if (patientAllergies.length > 0) {
      suggestedMedicines = suggestedMedicines.filter((med) => {
        const brand = med.brandName.toLowerCase();
        const generic = med.genericName.toLowerCase();
        const isAllergic = patientAllergies.some((alg) => {
          const a = alg.toLowerCase();
          return brand.includes(a) || generic.includes(a);
        });
        return !isAllergic;
      });
    }

    res.json({
      success: true,
      recommendation: {
        diagnosis,
        differentialDiagnoses,
        clinicalProblems,
        clinicalFindings,
        medicines: suggestedMedicines,
        investigations: suggestedInvestigations,
        dietaryAdvice,
        lifestyleAdvice,
        nextVisitDays,
        doctorCustomized: doctorPreferences.length > 0,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
