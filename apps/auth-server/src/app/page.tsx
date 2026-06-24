'use client'

import { useEffect, useState } from 'react'
import PhoneInput from '@/components/PhoneInput'
import OtpInput from '@/components/OtpInput'
import LoadingScreen from '@/components/LoadingScreen'

type Step = 'phone' | 'otp' | 'redirecting'

export default function Home() {
  const [step, setStep] = useState<Step>('phone')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [otp, setOtp] = useState('')
  const [electionId, setElectionId] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [simulationOtp, setSimulationOtp] = useState('')
  const [isSimulation, setIsSimulation] = useState(false)
  const [showSimGuide, setShowSimGuide] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('electionId') ?? process.env.NEXT_PUBLIC_DEFAULT_ELECTION_ID ?? ''
    setElectionId(id)
    fetch('/api/auth/mode')
      .then((r) => r.json())
      .then((d) => {
        setIsSimulation(d.isSimulation)
        setShowSimGuide(d.isSimulation)
      })
      .catch(() => {})
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
        if (isSimulation && data.otp) {
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
        if (isSimulation && data.otp) {
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
    <>
      {/* 시뮬레이션 안내 팝업 — isSimulation=false 시 절대 렌더링 안 됨 */}
      {isSimulation && showSimGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="w-full max-w-[480px] max-h-[90vh] overflow-y-auto bg-[#1A3A1A] border border-[#7BC47B]/50 rounded-2xl shadow-2xl text-white">
            <div className="px-6 pt-6 pb-3">
              <span className="inline-block bg-[#2A5A2A]/70 text-[#7BC47B] text-xs font-bold tracking-wider px-3 py-1 rounded-full">
                ⚠ 시뮬레이션 모드
              </span>
              <h2 className="text-xl font-bold mt-3 text-[#7BC47B]">시뮬레이션 안내</h2>
            </div>
            <div className="px-6 pb-4 text-sm leading-relaxed text-white">
              <p className="mb-3">
                이 시뮬레이션에 사용할 수 있는 테스트 번호입니다.<br />
                아래 번호 중 하나를 입력하면 투표를 체험할 수 있습니다.
              </p>
              <ul className="space-y-1.5 font-mono text-xs bg-[#2A5A2A]/40 rounded-xl p-4">
                <li>• 010-7777-7777 (1개)</li>
                <li>• 010-1111-1111 ~ 010-1111-1199 (89개)</li>
                <li>• 010-2222-0000 ~ 010-2222-0999 (1,000개)</li>
                <li>• 010-3333-0000 ~ 010-3333-0999 (1,000개)</li>
                <li>• 010-4444-0000 ~ 010-4444-0999 (1,000개)</li>
                <li>• 010-5555-0000 ~ 010-5555-0999 (1,000개)</li>
                <li>• 010-6666-0000 ~ 010-6666-0999 (1,000개)</li>
                <li>• 010-7777-0000 ~ 010-7777-0999 (1,000개)</li>
                <li>• 010-8888-0000 ~ 010-8888-0999 (1,000개)</li>
                <li>• 010-9999-0000 ~ 010-9999-0999 (1,000개)</li>
              </ul>
              <p className="mt-3 text-green-300 text-xs">
                명부에 없는 번호를 입력하면 &lsquo;투표권이 없습니다&rsquo; 안내가 표시됩니다.
              </p>
            </div>
            <div className="px-6 pb-6">
              <button
                onClick={() => setShowSimGuide(false)}
                className="w-full py-3 bg-[#4CAF50] text-white font-bold rounded-xl text-sm tracking-wide hover:bg-[#45A049] transition-colors"
              >
                확인, 시작하기
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex min-h-screen items-start justify-center px-4 pt-16 pb-8">
      <div className="w-full max-w-[430px]">

        {/* 시뮬레이션 모드 경고 배너 — isSimulation=false 시 렌더링 안 됨 */}
        {isSimulation && (
          <div className="mb-4 px-4 py-3 bg-red-600 text-white rounded-xl text-center leading-snug">
            <p className="text-sm font-bold">⚠ 시뮬레이션 모드 — 실제 서비스에서는 사용 금지</p>
            <p className="text-xs font-normal text-yellow-200 mt-1 italic">
              시뮬레이션과 실제 투표는 관리자의 스위치 조작으로 쉽게 전환됩니다
            </p>
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
                    : isSimulation
                    ? '[시뮬레이션] 아래 인증번호를 확인하여 입력해주세요.'
                    : '발송된 인증번호를 입력해주세요.'}
                </p>
              </div>

              {error && (
                <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                  {error}
                </div>
              )}

              {/* 시뮬레이션 OTP 표시 박스 — isSimulation=true이고 OTP가 있을 때만 표시 */}
              {isSimulation && step === 'otp' && simulationOtp && (
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
    </>
  )
}
