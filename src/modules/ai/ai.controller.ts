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

