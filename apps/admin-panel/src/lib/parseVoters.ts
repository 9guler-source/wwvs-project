import * as XLSX from 'xlsx';
import { hashPhone } from './hash';

export interface VoterValid {
  name: string;
  phone: string;
  phoneHash: string;
}

export interface VoterError {
  row: number;
  name: string;
  phone: string;
  reason: string;
}

export interface ParseResult {
  valid: VoterValid[];
  errors: VoterError[];
}

const HEADER_KEYWORDS = ['이름', '전화번호', '성명', '연락처', 'name', 'phone'];

function isHeaderRow(name: string, phone: string): boolean {
  const combined = (name + phone).toLowerCase();
  return HEADER_KEYWORDS.some((k) => combined.includes(k.toLowerCase()));
}

function normalizePhone(raw: string): string | null {
  const str = String(raw).trim();

  if (str.startsWith('+')) {
    const digits = str.replace(/[^0-9]/g, '');
    if (digits.length >= 7 && digits.length <= 15) {
      return str;
    }
    return null;
  }

  const digits = str.replace(/[^0-9]/g, '');
  if (digits.startsWith('010') && (digits.length === 10 || digits.length === 11)) {
    return digits;
  }

  return null;
}

export function parseVoters(buffer: Buffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number | undefined)[]>(sheet, {
    header: 1,
    defval: '',
  });

  const valid: VoterValid[] = [];
  const errors: VoterError[] = [];

  rows.forEach((row, idx) => {
    const rawName = String(row[0] ?? '').trim();
    const rawPhone = String(row[1] ?? '').trim();

    if (!rawName && !rawPhone) return;
    if (isHeaderRow(rawName, rawPhone)) return;

    const rowNum = idx + 1;

    if (!rawName || rawName.length < 1 || rawName.length > 20) {
      errors.push({ row: rowNum, name: rawName, phone: rawPhone, reason: '이름이 유효하지 않습니다 (1~20자)' });
      return;
    }

    const normalized = normalizePhone(rawPhone);
    if (!normalized) {
      errors.push({ row: rowNum, name: rawName, phone: rawPhone, reason: '전화번호 형식이 올바르지 않습니다 (010xxxxxxxx 또는 +국제번호)' });
      return;
    }

    valid.push({ name: rawName, phone: normalized, phoneHash: hashPhone(normalized) });
  });

  return { valid, errors };
}
