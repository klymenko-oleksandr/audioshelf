import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.redirect(new URL("/admin/login", process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"));
  response.cookies.delete("admin_auth");
  return response;
}

export async function GET() {
  const response = NextResponse.redirect(new URL("/admin/login", process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"));
  response.cookies.delete("admin_auth");
  return response;
}
