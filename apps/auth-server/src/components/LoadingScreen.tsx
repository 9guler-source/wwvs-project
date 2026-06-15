export default function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-12">
      <div className="w-12 h-12 border-4 border-[#1B2A6B] border-t-transparent rounded-full animate-spin" />
      <p className="text-[#1B2A6B] font-semibold text-lg">투표소로 이동 중...</p>
      <p className="text-gray-400 text-sm">잠시만 기다려주세요</p>
    </div>
  )
}
