import { supabase } from "./supabase";

export interface AccountReviewRequest {
  id: string;
  reason: string;
  status: "pending" | "approved" | "denied";
  admin_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export async function getAccountReviewRequest() {
  const { data, error } = await supabase.rpc("account_review_request_status");
  if (error) throw new Error(error.message);
  return data as AccountReviewRequest | null;
}

export async function submitAccountReviewRequest(reason: string) {
  const { error } = await supabase.rpc("submit_account_review_request", {
    p_reason: reason.trim(),
  });
  if (error) throw new Error(error.message);
}
