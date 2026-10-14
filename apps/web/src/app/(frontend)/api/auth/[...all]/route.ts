import { getAuth } from "@/auth/auth";

// Better Auth's endpoints: Google callback (/api/auth/callback/google), email
// links, sessions, authenticator setup, and the admin verification step.
export async function GET(request: Request): Promise<Response> {
  return getAuth().handler(request);
}

export async function POST(request: Request): Promise<Response> {
  return getAuth().handler(request);
}
