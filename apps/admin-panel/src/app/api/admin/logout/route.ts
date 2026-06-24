import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.redirect(
    new URL("/login", process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3004")
  );
  res.cookies.set("admin_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });
  return res;
}
