import { updateAccountProfile } from "@/lib/server/account-profile-update";
import { readAccountProfile } from "@/lib/server/account-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = readAccountProfile;

function methodNotAllowed(): Response {
  return Response.json(
    {
      error: {
        code: "account_profile_method_not_allowed",
        message: "account_profile_method_not_allowed",
      },
    },
    {
      status: 405,
      headers: { "cache-control": "private, no-store", allow: "GET, PATCH" },
    },
  );
}
export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = updateAccountProfile;
export const DELETE = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
