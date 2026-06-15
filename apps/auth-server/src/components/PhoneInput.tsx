'use client'

interface PhoneInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  isLoading: boolean
}

export default function PhoneInput({ value, onChange, onSubmit, isLoading }: PhoneInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 11)
    onChange(digits)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSubmit()
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="tel"
        inputMode="numeric"
        placeholder="01012345678"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="w-full px-4 py-3 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#1B2A6B] transition-colors text-center tracking-widest"
        disabled={isLoading}
        autoComplete="tel"
      />
      <button
        onClick={onSubmit}
        disabled={isLoading || value.length < 10}
        className="w-full py-4 bg-[#1B2A6B] text-white text-base font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all"
      >
        {isLoading ? '발송 중...' : '인증번호 받기'}
      </button>
    </div>
  )
}
