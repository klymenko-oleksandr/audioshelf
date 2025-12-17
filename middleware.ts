import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname === "/admin/login" || pathname === "/api/admin/auth") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    const authHeader = request.headers.get("authorization");
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      console.error("ADMIN_PASSWORD environment variable is not set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    if (pathname.startsWith("/admin") && !pathname.startsWith("/api/admin")) {
      const cookie = request.cookies.get("admin_auth");
      if (cookie?.value === adminPassword) {
        return NextResponse.next();
      }
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    if (pathname.startsWith("/api/admin")) {
      const cookie = request.cookies.get("admin_auth");
      if (cookie?.value === adminPassword) {
        return NextResponse.next();
      }

      if (authHeader) {
        const [scheme, token] = authHeader.split(" ");
        if (scheme === "Bearer" && token === adminPassword) {
          return NextResponse.next();
        }
      }

      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
