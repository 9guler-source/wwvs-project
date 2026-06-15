'use client'

import { useEffect, useRef, useState } from 'react'

interface OtpInputProps {
  phoneNumber: string
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onResend: () => void
  isLoading: boolean
}

export default function OtpInput({
  phoneNumber,
  value,
  onChange,
  onSubmit,
  onResend,
  isLoading,
}: OtpInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [resendCountdown, setResendCountdown] = useState(60)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (resendCountdown <= 0) return
    const timer = setTimeout(() => setResendCountdown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendCountdown])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
    onChange(digits)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSubmit()
  }

  const handleResend = () => {
    onResend()
    setResendCountdown(60)
  }

  const maskedPhone = phoneNumber.slice(0, 3) + '****' + phoneNumber.slice(7)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-500 text-center">
        <span className="font-semibold text-[#1B2A6B]">{maskedPhone}</span>으로<br />
        인증번호를 발송했습니다
      </p>
      <input
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        placeholder="6자리 인증번호"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        maxLength={6}
        className="w-full px-4 py-3 text-2xl border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#1B2A6B] transition-colors text-center tracking-[0.5em] font-mono"
        disabled={isLoading}
        autoComplete="one-time-code"
      />
      <button
        onClick={onSubmit}
        disabled={isLoading || value.length !== 6}
        className="w-full py-4 bg-[#1B2A6B] text-white text-base font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all"
      >
        {isLoading ? '확인 중...' : '확인'}
      </button>
      <button
        onClick={handleResend}
        disabled={resendCountdown > 0}
        className="text-sm text-gray-400 disabled:cursor-default enabled:text-[#1B2A6B] enabled:underline"
      >
        {resendCountdown > 0 ? `재발송 (${resendCountdown}초 후)` : '인증번호 재발송'}
      </button>
    </div>
  )
}
