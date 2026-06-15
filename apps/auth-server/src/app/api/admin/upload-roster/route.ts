import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { checkAdminAuth } from '@/lib/admin-auth'
import { normalizePhone, isValidKoreanPhone, hashPhone } from '@/lib/phone-hash'
import * as XLSX from 'xlsx'

export async function POST(request: NextRequest) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ ok: false, error: '파일 파싱 실패' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const electionId = formData.get('electionId') as string | null

  if (!file || !electionId) {
    return NextResponse.json({ ok: false, error: '파일과 선거 ID가 필요합니다' }, { status: 400 })
  }

  const { data: sealData } = await supabase
    .from('roster_seal')
    .select('is_sealed')
    .eq('election_id', electionId)
    .maybeSingle()

  if (sealData?.is_sealed) {
    return NextResponse.json({ ok: false, error: '이미 봉인된 선거인명부입니다' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return NextResponse.json({ ok: false, error: '엑셀 시트를 찾을 수 없습니다' }, { status: 400 })
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' })

  if (rows.length === 0) {
    return NextResponse.json({ ok: false, error: '데이터가 없습니다' }, { status: 400 })
  }

  // Find phone column
  const headers = Object.keys(rows[0])
  const phoneCol =
    headers.find(h => /전화번호/i.test(h)) ??
    headers.find(h => /phone/i.test(h)) ??
    headers.find(h => /전화/i.test(h)) ??
    headers[0]

  // First pass: format validation + within-file dedup
  const errorRows: { row: number; phone: string; reason: string }[] = []
  const seenInFile = new Set<string>()
  const candidates: { rowNum: number; normalized: string }[] = []
  let formatErrors = 0
  let withinFileDups = 0

  rows.forEach((row, idx) => {
    const raw = String(row[phoneCol] ?? '').trim()
    const normalized = normalizePhone(raw)
    const rowNum = idx + 2 // +1 for 1-index, +1 for header

    if (!isValidKoreanPhone(normalized)) {
      formatErrors++
      errorRows.push({ row: rowNum, phone: raw, reason: '형식 오류 (010으로 시작, 11자리)' })
      return
    }

    if (seenInFile.has(normalized)) {
      withinFileDups++
      errorRows.push({ row: rowNum, phone: raw, reason: '파일 내 중복' })
      return
    }

    seenInFile.add(normalized)
    candidates.push({ rowNum, normalized })
  })

  // Second pass: check existing voters in DB
  let existingDups = 0
  const validPhones: string[] = []

  if (candidates.length > 0) {
    const hashes = candidates.map(c => hashPhone(c.normalized))
    const { data: existing } = await supabase
      .from('voters')
      .select('phone_number')
      .eq('election_id', electionId)
      .in('phone_number', hashes)

    const existingSet = new Set((existing ?? []).map(v => v.phone_number))

    for (const { rowNum, normalized } of candidates) {
      if (existingSet.has(hashPhone(normalized))) {
        existingDups++
        errorRows.push({ row: rowNum, phone: normalized, reason: '이미 등록된 번호' })
      } else {
        validPhones.push(normalized)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    total: rows.length,
    valid: validPhones.length,
    formatErrors,
    withinFileDups,
    existingDups,
    validPhones,
    errorRows,
  })
}
