export const CURRENT_USER_POLICY_VERSION = "2026-11-04";

const userPolicyEndpoint = "/functions/v1/account-deletion";

export function getUserPolicyUrl() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("The user terms page is not configured.");
  }

  const url = new URL(userPolicyEndpoint, supabaseUrl);
  url.searchParams.set("view", "terms-of-use");
  return url.toString();
}
