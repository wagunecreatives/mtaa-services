const accountDeletionEndpoint = "/functions/v1/account-deletion";

function getAccountDeletionPageUrl(query = "") {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("The account deletion page is not configured.");
  }

  return `${new URL(accountDeletionEndpoint, supabaseUrl).toString()}${query}`;
}

export function getPrivacyPolicyUrl() {
  return getAccountDeletionPageUrl("?view=privacy-policy");
}

export function getPublicAccountDeletionUrl() {
  return getAccountDeletionPageUrl();
}
