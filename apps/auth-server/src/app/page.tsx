'use client'

import { useEffect, useState } from 'react'
import PhoneInput from '@/components/PhoneInput'
import OtpInput from '@/components/OtpInput'
import LoadingScreen from '@/components/LoadingScreen'

const SIMULATION_MODE = process.env.NEXT_PUBLIC_SIMULATION_MODE === 'true'

type Step = 'phone' | 'otp' | 'redirecting'

export default function Home() {
  const [step, setStep] = useState<Step>('phone')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [otp, setOtp] = useState('')
  const [electionId, setElectionId] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [simulationOtp, setSimulationOtp] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('electionId') ?? process.env.NEXT_PUBLIC_DEFAULT_ELECTION_ID ?? ''
    setElectionId(id)
  }, [])

  const handleSendOtp = async () => {
    setError('')
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, electionId }),
      })
      const data = await res.json()
      if (data.success) {
        if (SIMULATION_MODE && data.otp) {
          setSimulationOtp(data.otp)
        }
        setStep('otp')
      } else {
        setError(data.error)
      }
    } catch {
      setError('네트워크 오류가 발생했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyOtp = async () => {
    setError('')
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, otp, electionId }),
      })
      const data = await res.json()
      if (data.success) {
        localStorage.setItem('wwvs_ri', data.ri)
        localStorage.setItem('wwvs_expires_at', data.expiresAt)
        setStep('redirecting')
        setTimeout(() => {
          window.location.href = `${data.opsServerUrl}?ri=${data.ri}&electionId=${electionId}`
        }, 800)
      } else {
        setError(data.error)
      }
    } catch {
      setError('네트워크 오류가 발생했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendOtp = async () => {
    setOtp('')
    setError('')
    setSimulationOtp('')
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, electionId }),
      })
      const data = await res.json()
      if (data.success) {
        if (SIMULATION_MODE && data.otp) {
          setSimulationOtp(data.otp)
        }
      } else {
        setError(data.error)
      }
    } catch {
      setError('네트워크 오류가 발생했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-start justify-center px-4 pt-16 pb-8">
      <div className="w-full max-w-[430px]">

        {/* 시뮬레이션 모드 경고 배너 — SIMULATION_MODE=false 시 렌더링 안 됨 */}
        {SIMULATION_MODE && (
          <div className="mb-4 px-4 py-3 bg-red-600 text-white text-sm font-bold rounded-xl text-center leading-snug">
            ⚠ 시뮬레이션 모드 — 실제 서비스에서는 사용 금지
          </div>
        )}

        {/* 로고 */}
        <div className="text-center mb-10">
          <h1 className="text-xl font-bold text-[#1B2A6B] tracking-tight">
            Who Whom Voting System
          </h1>
          <div className="mt-1 h-0.5 w-12 bg-[#1B2A6B] mx-auto rounded-full" />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {step === 'redirecting' ? (
            <LoadingScreen />
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-800">
                  {step === 'phone' ? '본인 인증' : 'OTP 확인'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {step === 'phone'
                    ? '투표 참여를 위해 본인 인증을 진행합니다.'
                    : SIMULATION_MODE
                    ? '[시뮬레이션] 아래 인증번호를 확인하여 입력해주세요.'
                    : '발송된 인증번호를 입력해주세요.'}
                </p>
              </div>

              {error && (
                <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                  {error}
                </div>
              )}

              {/* 시뮬레이션 OTP 표시 박스 — SIMULATION_MODE=true이고 OTP가 있을 때만 표시 */}
              {SIMULATION_MODE && step === 'otp' && simulationOtp && (
                <div className="mb-4 px-4 py-4 bg-yellow-50 border-2 border-yellow-400 rounded-xl text-center">
                  <p className="text-xs text-yellow-700 font-semibold mb-1">[시뮬레이션] 인증번호</p>
                  <p className="text-3xl font-mono font-bold text-yellow-900 tracking-[0.3em]">
                    {simulationOtp}
                  </p>
                  <p className="text-xs text-yellow-600 mt-1">아래 입력란에 입력하세요</p>
                </div>
              )}

              {step === 'phone' ? (
                <PhoneInput
                  value={phoneNumber}
                  onChange={setPhoneNumber}
                  onSubmit={handleSendOtp}
                  isLoading={isLoading}
                />
              ) : (
                <OtpInput
                  phoneNumber={phoneNumber}
                  value={otp}
                  onChange={setOtp}
                  onSubmit={handleVerifyOtp}
                  onResend={handleResendOtp}
                  isLoading={isLoading}
                />
              )}
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          3서버 분리 아키텍처로 투표자 익명성을 보장합니다
        </p>
      </div>
    </main>
  )
}
