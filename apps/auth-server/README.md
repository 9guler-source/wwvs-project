This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## ⚠ 시뮬레이션 모드 (SIMULATION_MODE)

`.env.local`의 `NEXT_PUBLIC_SIMULATION_MODE=true` 설정 시 **시뮬레이션 모드**로 동작합니다.

- OTP를 Twilio로 발송하지 않고 API 응답 및 화면에 직접 표시합니다.
- 실제 휴대폰 번호 없이 전체 투표 흐름을 체험할 수 있습니다.

**⚠ 경고: `NEXT_PUBLIC_SIMULATION_MODE=true`는 절대 실제 선거 운영 환경(Vercel 프로덕션 등)에 배포하면 안 됩니다.**
시뮬레이션 모드에서는 OTP 값이 API 응답에 노출되어 보안이 취약합니다.
프로덕션 배포 전 반드시 `NEXT_PUBLIC_SIMULATION_MODE=false` 또는 해당 환경변수를 삭제하세요.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
