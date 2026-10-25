import { Request, Response } from 'express';
import prisma from '../../config/database';
import { BANGLADESH_MEDICINES_DATA } from './medicines.data';

// 1. Search Medicines in Database with fallback
export const searchMedicines = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      q,
      brand,
      generic,
      dosageForm,
      manufacturer,
      drugClass,
      indication,
      limit = '30',
      page = '1',
    } = req.query;

    const limitNum = Math.min(parseInt(limit as string, 10) || 30, 100);
    const pageNum = parseInt(page as string, 10) || 1;
    const skip = (pageNum - 1) * limitNum;

    const searchStr = ((q || brand || generic || '') as string).trim();

    const where: any = {};

    if (searchStr) {
      where.OR = [
        { brandName: { contains: searchStr, mode: 'insensitive' } },
        { genericName: { contains: searchStr, mode: 'insensitive' } },
        { indication: { contains: searchStr, mode: 'insensitive' } },
        { drugClass: { contains: searchStr, mode: 'insensitive' } },
        { manufacturer: { contains: searchStr, mode: 'insensitive' } },
      ];
    }

    if (dosageForm) {
      where.dosageForm = { contains: dosageForm as string, mode: 'insensitive' };
    }

    if (manufacturer) {
      where.manufacturer = { contains: manufacturer as string, mode: 'insensitive' };
    }

    if (drugClass) {
      where.drugClass = { contains: drugClass as string, mode: 'insensitive' };
    }

    if (indication) {
      where.indication = { contains: indication as string, mode: 'insensitive' };
    }

    const [total, medicines] = await Promise.all([
      prisma.medicine.count({ where }),
      prisma.medicine.findMany({
        where,
        take: limitNum,
        skip,
        orderBy: { brandName: 'asc' },
      }),
    ]);

    // If database table has not been populated yet, return fallback catalog
    if (medicines.length === 0 && searchStr) {
      const lower = searchStr.toLowerCase();
      const filtered = BANGLADESH_MEDICINES_DATA.filter(
        (m) =>
          m.brandName.toLowerCase().includes(lower) ||
          m.genericName.toLowerCase().includes(lower) ||
          m.indication.toLowerCase().includes(lower) ||
          m.drugClass.toLowerCase().includes(lower)
      ).slice(0, limitNum);

      res.json({
        success: true,
        total: filtered.length,
        page: 1,
        medicines: filtered,
      });
      return;
    }

    res.json({
      success: true,
      total,
      page: pageNum,
      medicines,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Autocomplete with Doctor Pattern Learning Integration
export const autocompleteMedicine = async (req: Request, res: Response): Promise<void> => {
  try {
    const { query, doctorId, diagnosis } = req.body;
    const searchStr = (query || '').toLowerCase().trim();

    // 1. If doctorId is provided, fetch doctor's custom preferences & frequent prescribe patterns first
    let doctorPreferences: any[] = [];
    if (doctorId) {
      const prefWhere: any = { doctorId };
      if (searchStr) {
        prefWhere.OR = [
          { brandName: { contains: searchStr, mode: 'insensitive' } },
          { genericName: { contains: searchStr, mode: 'insensitive' } },
        ];
      }
      if (diagnosis) {
        prefWhere.OR = [
          ...(prefWhere.OR || []),
          { diagnosis: { contains: diagnosis, mode: 'insensitive' } },
        ];
      }

      doctorPreferences = await prisma.doctorMedicinePreference.findMany({
        where: prefWhere,
        orderBy: { frequencyCount: 'desc' },
        take: 6,
      });
    }

    // 2. Search Database Medicines
    let dbMedicines: any[] = [];
    if (searchStr.length >= 1) {
      dbMedicines = await prisma.medicine.findMany({
        where: {
          OR: [
            { brandName: { startsWith: searchStr, mode: 'insensitive' } },
            { brandName: { contains: searchStr, mode: 'insensitive' } },
            { genericName: { contains: searchStr, mode: 'insensitive' } },
            { indication: { contains: searchStr, mode: 'insensitive' } },
          ],
        },
        take: 12,
        orderBy: { brandName: 'asc' },
      });
    }

    // Fallback to static data if database is empty
    if (dbMedicines.length === 0 && searchStr) {
      dbMedicines = BANGLADESH_MEDICINES_DATA.filter(
        (med) =>
          med.brandName.toLowerCase().includes(searchStr) ||
          med.genericName.toLowerCase().includes(searchStr) ||
          med.indication.toLowerCase().includes(searchStr)
      ).slice(0, 12);
    }

    // 3. Merge: Doctor preferences first (highlighted as doctor favorite), then database catalog
    const seenBrands = new Set<string>();
    const results: any[] = [];

    // Add doctor favorites first
    for (const p of doctorPreferences) {
      const key = p.brandName.toLowerCase();
      if (!seenBrands.has(key)) {
        seenBrands.add(key);
        results.push({
          id: p.id,
          brandName: p.brandName,
          genericName: p.genericName,
          dosageForm: p.dosageForm,
          strength: p.strength,
          defaultDose: p.defaultDose,
          defaultTiming: p.defaultTiming,
          defaultDuration: p.defaultDuration,
          manufacturer: p.manufacturer || 'Prescribed Preference',
          isDoctorFavorite: true,
          frequencyCount: p.frequencyCount,
        });
      }
    }

    // Add general medicines
    for (const m of dbMedicines) {
      const key = m.brandName.toLowerCase();
      if (!seenBrands.has(key)) {
        seenBrands.add(key);
        results.push({
          id: m.id || key,
          brandName: m.brandName,
          genericName: m.genericName,
          dosageForm: m.dosageForm,
          strength: m.strength,
          defaultDose: m.defaultDose || '1+0+1',
          defaultTiming: m.defaultTiming || 'After meal',
          defaultDuration: m.defaultDuration || 7,
          manufacturer: m.manufacturer,
          drugClass: m.drugClass,
          indication: m.indication,
          isDoctorFavorite: false,
        });
      }
    }

    res.json({
      success: true,
      count: results.length,
      suggestions: results.slice(0, 15),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. Seed Medicines Database
export const seedMedicinesDatabase = async (_req: Request, res: Response): Promise<void> => {
  try {
    let inserted = 0;
    for (const med of BANGLADESH_MEDICINES_DATA) {
      await prisma.medicine.upsert({
        where: { brandName: med.brandName },
        update: {
          genericName: med.genericName,
          dosageForm: med.dosageForm,
          strength: med.strength,
          manufacturer: med.manufacturer,
          drugClass: med.drugClass,
          indication: med.indication,
          defaultDose: med.defaultDose,
          defaultTiming: med.defaultTiming,
          defaultDuration: med.defaultDuration,
        },
        create: {
          brandName: med.brandName,
          genericName: med.genericName,
          dosageForm: med.dosageForm,
          strength: med.strength,
          manufacturer: med.manufacturer,
          drugClass: med.drugClass,
          indication: med.indication,
          defaultDose: med.defaultDose,
          defaultTiming: med.defaultTiming,
          defaultDuration: med.defaultDuration,
        },
      });
      inserted++;
    }

    res.json({
      success: true,
      message: `Successfully seeded ${inserted} Bangladeshi formulary medicines from MedEx dataset.`,
      count: inserted,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

