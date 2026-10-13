import { supabase } from "./supabase";

export type AdminSection =
  | "providers"
  | "applications"
  | "customers"
  | "requests"
  | "reports"
  | "categories"
  | "areas"
  | "audit";

export type AdminRecord = Record<string, unknown>;

async function call<T>(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const adminApi = {
  metrics: () => call<AdminRecord>("admin_dashboard_metrics"),
  filterJobs: (filters: { status: string; category: string; area: string; provider: string; from: string; to: string }) => {
    const toExclusive = filters.to ? new Date(`${filters.to}T00:00:00.000Z`) : null;
    if (toExclusive) toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
    return call<AdminRecord[]>("admin_filter_jobs", { p_status: filters.status || null, p_category: filters.category || null,
      p_area: filters.area || null, p_provider: filters.provider || null,
      p_from: filters.from ? new Date(`${filters.from}T00:00:00.000Z`).toISOString() : null, p_to: toExclusive?.toISOString() ?? null });
  },
  providers: (search: string) => call<AdminRecord[]>("admin_list_providers", { p_search: search || null }),
  applications: (status: string) => call<AdminRecord[]>("admin_list_provider_applications", { p_status: status || null }),
  reviewApplication: (id: string, decision: "approved" | "rejected", notes: string, phoneVerified: boolean) =>
    call<boolean>("admin_review_provider_application", { p_application_id: id, p_decision: decision, p_notes: notes, p_phone_verified: phoneVerified }),
  customers: (search: string) => call<AdminRecord[]>("admin_search_customers", { p_search: search || null }),
  requests: (status: string) => call<AdminRecord[]>("admin_list_requests", { p_status: status || null }),
  reports: async (status: string) => {
    const [legacy, userReports] = await Promise.all([
      call<AdminRecord[]>("admin_list_reports", { p_status: status || null }),
      call<AdminRecord[]>("admin_list_user_reports", { p_status: status || null }),
    ]);
    return [...userReports.map((row) => ({ ...row, report_source: "user_report" })), ...legacy.map((row) => ({ ...row, report_source: "legacy_report" }))];
  },
  reviews: () => call<AdminRecord[]>("admin_list_reviews"),
  categories: () => call<AdminRecord[]>("admin_list_categories"),
  areas: () => call<AdminRecord[]>("admin_list_platform_areas"),
  audit: () => call<AdminRecord[]>("admin_list_audit", { p_limit: 100 }),
  setCustomerActive: (id: string, active: boolean, reason: string) =>
    call<boolean>("admin_set_customer_active", { p_customer_id: id, p_active: active, p_reason: reason }),
  setProviderStatus: (id: string, status: string, reason: string, phoneVerified: boolean | null) =>
    call<boolean>("admin_set_provider_status", { p_provider_id: id, p_status: status, p_reason: reason, p_phone_verified: phoneVerified }),
  saveCategory: (value: { id: string | null; name: string; slug: string; description: string; icon: string; active: boolean; sortOrder: number }) =>
    call<string>("admin_save_category", { p_category_id: value.id, p_name: value.name, p_slug: value.slug,
      p_description: value.description, p_icon: value.icon, p_active: value.active, p_sort_order: value.sortOrder }),
  saveArea: (county: string, areaName: string, active: boolean, sortOrder: number) =>
    call<string>("admin_save_platform_area", { p_county: county, p_area_name: areaName, p_active: active, p_sort_order: sortOrder }),
  updateReport: (id: string, status: string, notes: string) =>
    call<boolean>("admin_update_report", { p_report_id: id, p_status: status, p_notes: notes }),
  updateUserReport: (id: string, status: string, notes: string) =>
    call<boolean>("admin_update_user_report", { p_report_id: id, p_status: status, p_notes: notes }),
  moderateReview: (jobId: string, visible: boolean, reason: string) =>
    call<boolean>("admin_set_review_visibility", { p_job_id: jobId, p_visible: visible, p_reason: reason }),
};
