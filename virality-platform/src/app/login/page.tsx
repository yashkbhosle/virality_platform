import type { Metadata } from "next";
import { authConfigError, safeNextPath } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Virality System" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const sp = await searchParams;
  const next = safeNextPath(Array.isArray(sp.next) ? sp.next[0] : sp.next);
  return <LoginForm next={next} configError={authConfigError()} />;
}
