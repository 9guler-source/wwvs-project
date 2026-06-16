'use client'

import { useEffect, useState } from 'react'
import type { VoteCertificate } from '@wwvs/shared'

function generateCertificateCanvas(cert: VoteCertificate): HTMLCanvasElement {
  const W = 800
  const PAD = 44
  const innerW = W - PAD * 2
  const KF = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif'
  const MONO = '"Courier New", monospace'

  const mc = document.createElement('canvas').getContext('2d')!
  function wrap(text: string, font: string): string[] {
    mc.font = font
    if (!text) return ['']
    const lines: string[] = []
    let s = 0
    while (s < text.length) {
      let e = text.length
      while (mc.measureText(text.slice(s, e)).width > innerW && e > s + 1) e--
      lines.push(text.slice(s, e))
      s = e
    }
    return lines
  }

  const RI_FONT = `13px ${MONO}`
  const HMAC_FONT = `11px ${MONO}`
  const riLines = wrap(cert.publicRi, RI_FONT)
  const hmacLines = wrap(cert.hmacSignature, HMAC_FONT)

  const HEADER_H = 76
  const ROW_H = 32
  const LABEL_H = 22
  const RI_LINE_H = 20
  const HMAC_LINE_H = 17
  const SEP = 14

  const totalH = Math.ceil(
    HEADER_H + PAD
    + ROW_H * 2
    + SEP + LABEL_H + riLines.length * RI_LINE_H + SEP
    + ROW_H
    + SEP + LABEL_H + hmacLines.length * HMAC_LINE_H
    + PAD + 8,
  )

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const canvas = document.createElement('canvas')
  canvas.width = W * dpr
  canvas.height = totalH * dpr
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.textBaseline = 'top'

  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(0, 0, W, totalH)
  ctx.fillStyle = '#1B2A6B'
  ctx.fillRect(0, 0, W, HEADER_H)
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold 20px ${KF}`
  ctx.fillText('WWVS 투표확인서', PAD, 16)
  ctx.font = `12px ${KF}`
  ctx.fillStyle = 'rgba(255,255,255,0.65)'
  ctx.fillText('Who Whom Voting System', PAD, 46)

  let y = HEADER_H + PAD

  function row(label: string, value: string, bold = false) {
    ctx.font = `12px ${KF}`
    ctx.fillStyle = '#9ca3af'
    ctx.fillText(label, PAD, y)
    ctx.font = `${bold ? 'bold ' : ''}14px ${KF}`
    ctx.fillStyle = '#111827'
    ctx.fillText(value, PAD + 110, y)
    y += ROW_H
  }

  row('선거 ID', `${cert.electionId.slice(0, 8)}…`)
  row('선택 항목', cert.selectedOptionText, true)

  y += 4
  ctx.strokeStyle = '#d1d5db'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y)
  ctx.stroke()
  y += SEP

  ctx.font = `12px ${KF}`
  ctx.fillStyle = '#9ca3af'
  ctx.fillText('확인 코드 (공개용RI)', PAD, y)
  y += LABEL_H
  ctx.font = RI_FONT
  ctx.fillStyle = '#1B2A6B'
  for (const line of riLines) { ctx.fillText(line, PAD, y); y += RI_LINE_H }
  y += SEP

  row('투표 일시', new Date(cert.createdAt).toLocaleString('ko-KR'))
  y += SEP

  ctx.font = `12px ${KF}`
  ctx.fillStyle = '#9ca3af'
  ctx.fillText('HMAC 서명', PAD, y)
  y += LABEL_H
  ctx.font = HMAC_FONT
  ctx.fillStyle = '#6b7280'
  for (const line of hmacLines) { ctx.fillText(line, PAD, y); y += HMAC_LINE_H }

  return canvas
}

export default function CompletePage() {
  const [certificate, setCertificate] = useState<VoteCertificate | null>(null)
  const [copied, setCopied] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent))

    const params = new URLSearchParams(window.location.search)
    const electionId = params.get('electionId') ?? ''
    const stored = localStorage.getItem(`wwvs_certificate_${electionId}`)
    if (stored) {
      try { setCertificate(JSON.parse(stored)) } catch { /* ignore */ }
    }
  }, [])

  const handleCapture = () => {
    if (!certificate) return
    setCapturing(true)
    setCaptureError(null)

    requestAnimationFrame(() => {
      // Step 1: Canvas 2D 지원 확인 (가장 단순한 테스트)
      let canvas: HTMLCanvasElement
      try {
        const testCtx = document.createElement('canvas').getContext('2d')
        if (!testCtx) throw new Error('Canvas 2D context 미지원 — 브라우저/기기 문제')

        // Step 2: 확인서 Canvas 생성
        canvas = generateCertificateCanvas(certificate)
        if (!canvas.width || !canvas.height) {
          throw new Error(`캔버스 크기 오류: ${canvas.width}×${canvas.height}`)
        }
      } catch (err) {
        setCaptureError(`캡쳐 실패: ${err instanceof Error ? err.message : String(err)}`)
        setCapturing(false)
        return
      }

      const filename = `wwvs_확인서_${certificate.publicRi.slice(0, 8)}.png`
      const iosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent)

      // Step 3: toBlob → URL.createObjectURL (toDataURL보다 안정적)
      canvas.toBlob((blob) => {
        try {
          if (!blob) throw new Error('blob 생성 실패 (null 반환) — Canvas가 비어있거나 보안 정책 차단')

          const url = URL.createObjectURL(blob)

          if (iosDevice) {
            // iOS Safari: <a download>가 data URL/blob에서 동작 안 함 → 새 탭에서 열기
            // 사용자가 이미지를 길게 눌러 "사진에 저장"
            window.open(url, '_blank')
            setTimeout(() => URL.revokeObjectURL(url), 5000)
          } else {
            // 일반 브라우저: <a> 태그를 반드시 DOM에 붙인 뒤 click (모바일 Chrome 등 필수)
            const link = document.createElement('a')
            link.href = url
            link.download = filename
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            setTimeout(() => URL.revokeObjectURL(url), 1000)
          }
        } catch (err) {
          setCaptureError(`다운로드 실패: ${err instanceof Error ? err.message : String(err)}`)
        } finally {
          setCapturing(false)
        }
      }, 'image/png')
    })
  }

  const handleCopyCode = () => {
    if (!certificate) return
    navigator.clipboard.writeText(certificate.publicRi).then(() => {
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    })
  }

  const handleCopy = () => {
    if (!certificate) return
    const text = [
      '== WWVS 투표확인서 ==',
      `선거 ID: ${certificate.electionId}`,
      `선택 항목: ${certificate.selectedOptionText}`,
      `확인 코드: ${certificate.publicRi}`,
      `투표 일시: ${new Date(certificate.createdAt).toLocaleString('ko-KR')}`,
      `HMAC 서명: ${certificate.hmacSignature}`,
    ].join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (!certificate) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-[430px] bg-white rounded-2xl p-6 text-center shadow-sm border border-gray-100">
          <p className="text-gray-500">투표 확인서를 찾을 수 없습니다.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-start justify-center px-4 pt-10 pb-8">
      <div className="w-full max-w-[430px]">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-800">투표가 완료되었습니다</h1>
          <p className="text-sm text-gray-500 mt-1">귀하의 소중한 한 표가 접수되었습니다</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            투표확인서
          </h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">선거 ID</span>
              <span className="text-gray-800 font-mono text-xs">{certificate.electionId.slice(0, 8)}…</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">선택 항목</span>
              <span className="text-gray-800 font-semibold">{certificate.selectedOptionText}</span>
            </div>
            <hr className="border-gray-100" />
            <div>
              <p className="text-gray-500 mb-1">확인 코드 (공개용RI)</p>
              <div className="flex items-center gap-2">
                <p className="font-mono text-xs text-[#1B2A6B] bg-blue-50 px-3 py-2 rounded-lg break-all flex-1">
                  {certificate.publicRi}
                </p>
                <button
                  onClick={handleCopyCode}
                  className="shrink-0 text-xs px-3 py-2 bg-blue-100 text-[#1B2A6B] rounded-lg font-medium active:scale-95 transition-all whitespace-nowrap"
                >
                  {copiedCode ? '복사되었습니다' : '복사'}
                </button>
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">투표 일시</span>
              <span className="text-gray-800 text-xs">
                {new Date(certificate.createdAt).toLocaleString('ko-KR')}
              </span>
            </div>
            <div>
              <p className="text-gray-500 mb-1 text-xs">HMAC 서명</p>
              <p className="font-mono text-[10px] text-gray-600 bg-gray-50 px-3 py-2 rounded-lg break-all">
                {certificate.hmacSignature}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-sm text-amber-800">
          이 확인서를 저장해두세요. 투표 종료 후 확인 코드로 본인 투표를 검증할 수 있습니다.
        </div>

        {/* 에러 표시 박스 */}
        {captureError && (
          <div className="mb-3 px-4 py-3 bg-red-100 border border-red-400 rounded-xl text-sm text-red-800 break-all font-mono">
            {captureError}
          </div>
        )}

        <p className="text-red-600 font-bold text-base text-center mb-2">
          ⚠ 반드시 확인서를 캡쳐하세요! 나중에 본인 투표 확인에 필요합니다.
        </p>

        {/* iOS 안내 */}
        {isIOS && (
          <p className="text-xs text-gray-500 text-center mb-2">
            iPhone/iPad: 버튼 클릭 후 열리는 이미지를 길게 눌러 사진에 저장하세요.
          </p>
        )}

        <button
          onClick={handleCapture}
          disabled={capturing}
          className="w-full py-5 mb-3 bg-red-600 text-white text-lg font-bold rounded-xl active:scale-95 transition-all disabled:opacity-60"
        >
          {capturing ? '캡쳐 중…' : '📸 확인서 캡쳐'}
        </button>

        <button
          onClick={handleCopy}
          className="w-full py-4 bg-[#1B2A6B] text-white font-semibold rounded-xl active:scale-95 transition-all"
        >
          {copied ? '복사됨!' : '확인서 텍스트 복사'}
        </button>
      </div>
    </main>
  )
}
