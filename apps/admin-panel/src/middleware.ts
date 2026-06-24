import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/admin/auth"];

const PROTECTED_API_PREFIX = "/api/admin/";
const PROTECTED_PAGE_PREFIXES = ["/elections", "/voters", "/system"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const isProtectedApi = pathname.startsWith(PROTECTED_API_PREFIX);
  const isProtectedPage =
    pathname === "/" ||
    PROTECTED_PAGE_PREFIXES.some((p) => pathname.startsWith(p));

  if (!isProtectedApi && !isProtectedPage) {
    return NextResponse.next();
  }

  const token = req.cookies.get("admin_session")?.value;
  const payload = token ? await verifySession(token) : null;

  if (!payload) {
    if (isProtectedApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/api/admin/:path*",
    "/elections/:path*",
    "/voters/:path*",
    "/system/:path*",
  ],
};
