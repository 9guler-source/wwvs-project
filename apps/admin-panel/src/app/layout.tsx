import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WWVS 관리자 패널",
  description: "Who Whom Voting System 관리자 패널",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full antialiased" style={{ background: "#0F1923", color: "#e2e8f0" }}>
        {children}
      </body>
    </html>
  );
}
