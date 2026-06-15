export function register() {
  if (process.env.NEXT_PUBLIC_SIMULATION_MODE === 'true') {
    console.log('╔══════════════════════════════════════════════════════════════╗')
    console.log('║  === SIMULATION_MODE: ON — OTP가 화면에 노출됩니다 ===      ║')
    console.log('║  ⚠  절대 실제 선거 운영 환경(프로덕션)에 배포하지 마세요!  ║')
    console.log('╚══════════════════════════════════════════════════════════════╝')
  } else {
    console.log('[auth-server] === SIMULATION_MODE: OFF — 실제 Twilio SMS 발송 ===')
  }
}
