/**
 * BookMyDoctorBD - Bangladeshi Mobile Number Normalizer & Validator
 * 
 * Bangladeshi mobile operators:
 * - 013, 017: Grameenphone
 * - 014, 019: Banglalink
 * - 015: Teletalk
 * - 016, 018: Robi / Airtel
 * 
 * Standard Format: +8801XXXXXXXXX (14 characters)
 * National Format: 01XXXXXXXXX (11 digits)
 */

export interface PhoneValidationResult {
  isValid: boolean;
  normalized: string; // E.164 canonical e.g. "+8801712345678"
  national: string;   // 11-digit e.g. "01712345678"
  operator?: string;
  error?: string;
}

const OPERATOR_NAMES: Record<string, string> = {
  '013': 'Grameenphone',
  '017': 'Grameenphone',
  '014': 'Banglalink',
  '019': 'Banglalink',
  '015': 'Teletalk',
  '016': 'Robi',
  '018': 'Robi / Airtel',
};

export function normalizeBdPhone(input: string | undefined | null): PhoneValidationResult {
  if (!input || typeof input !== 'string') {
    return {
      isValid: false,
      normalized: '',
      national: '',
      error: 'Bangladeshi mobile number is required.',
    };
  }

  // Strip all whitespace, hyphens, brackets, dots
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');

  let nationalDigits = '';

  if (digits.startsWith('8801') && digits.length === 13) {
    nationalDigits = digits.slice(2); // '01...'
  } else if (digits.startsWith('01') && digits.length === 11) {
    nationalDigits = digits; // '01...'
  } else if (digits.startsWith('1') && digits.length === 10) {
    nationalDigits = '0' + digits; // '01...'
  } else {
    return {
      isValid: false,
      normalized: trimmed,
      national: digits,
      error: 'Please enter a valid 11-digit Bangladeshi mobile number (e.g. 01712345678 or +8801712345678).',
    };
  }

  const prefix = nationalDigits.slice(0, 3);
  const operator = OPERATOR_NAMES[prefix];

  if (!operator) {
    return {
      isValid: false,
      normalized: `+88${nationalDigits}`,
      national: nationalDigits,
      error: `Invalid operator prefix "${prefix}". Valid prefixes are 013, 014, 015, 016, 017, 018, 019.`,
    };
  }

  const normalized = `+88${nationalDigits}`;

  return {
    isValid: true,
    normalized,
    national: nationalDigits,
    operator,
  };
}

export function formatBdPhoneDisplay(phone: string | undefined | null): string {
  if (!phone) return 'N/A';
  const res = normalizeBdPhone(phone);
  if (!res.isValid) return phone;
  // Format: +880 1712-345678
  const nat = res.national;
  return `+880 ${nat.slice(1, 5)}-${nat.slice(5)}`;
}

