import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { RouteScaffold } from "../../components/RouteScaffold";
import { Colors } from "../../constants/Colors";
import { useAuth } from "../../contexts/AuthContext";
import { adminApi, type AdminRecord, type AdminSection } from "../../lib/admin";

const sections: { key: AdminSection | "reviews"; label: string }[] = [
  { key: "applications", label: "Applications" }, { key: "providers", label: "Providers" },
  { key: "customers", label: "Customers" }, { key: "account_reviews", label: "Account reviews" }, { key: "requests", label: "Requests" },
  { key: "reports", label: "Reports" }, { key: "reviews", label: "Reviews" },
  { key: "categories", label: "Categories" }, { key: "areas", label: "Areas" }, { key: "audit", label: "Audit" },
];
const value = (item: AdminRecord, key: string, fallback = "—") => item[key] == null || item[key] === "" ? fallback : String(item[key]);
const object = (item: AdminRecord, key: string) => item[key] && typeof item[key] === "object" ? item[key] as AdminRecord : {};
const verificationLabel = (status: string, phoneVerified: boolean) => status === "suspended" ? "Suspended" : status === "pending" || status === "under_review" ? "Pending verification" : (status === "verified" || status === "approved") && phoneVerified ? "Verified" : "Unverified";

export default function AdminPlatformScreen() {
  const params = useLocalSearchParams<{ section?: string }>();
  const { profile } = useAuth();
  const [section, setSection] = useState<AdminSection | "reviews">(() => sections.find((item) => item.key === params.section)?.key ?? "providers");
  const [rows, setRows] = useState<AdminRecord[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [phoneChecks, setPhoneChecks] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [county, setCounty] = useState("");
  const [area, setArea] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [itemActive, setItemActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      let result: AdminRecord[];
      switch (section) {
        case "providers": result = await adminApi.providers(search); break;
        case "applications": result = await adminApi.applications(status); break;
        case "customers": result = await adminApi.customers(search); break;
        case "account_reviews": result = await adminApi.accountReviews(status); break;
        case "requests": result = await adminApi.requests(status); break;
        case "reports": result = await adminApi.reports(status); break;
        case "reviews": result = await adminApi.reviews(); break;
        case "categories": result = await adminApi.categories(); break;
        case "areas": result = await adminApi.areas(); break;
        case "audit": result = await adminApi.audit(); break;
      }
      setRows(result);
    } catch (e) { setRows([]); setError(e instanceof Error ? e.message : "Unable to load platform data."); }
    finally { setLoading(false); }
  }, [section, search, status]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const act = async (work: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await work(); setNotes(""); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Action could not be completed."); }
    finally { setBusy(false); }
  };
  const detail = (item: AdminRecord) => {
    const entries: [string, string][] = [];
    for (const key of ["status", "report_type", "report_source", "reporter_name", "reported_name", "user_name", "email", "phone", "role", "verification_status", "phone_verified", "rating_average", "total_reviews", "total_jobs", "completed_jobs", "response_rate", "title", "category", "urgency", "area_name", "county", "description", "reason", "reporter_id", "reported_user_id", "user_id", "job_id", "target_type", "target_id", "admin_name", "rating", "review_text", "is_visible", "is_active", "sort_order", "icon", "slug", "admin_notes", "created_at"]) {
      if (item[key] != null && item[key] !== "") entries.push([key.replaceAll("_", " "), value(item, key)]);
    }
    return entries;
  };

  return <RouteScaffold eyebrow="Admin operations" title={sections.find((item) => item.key === section)?.label ?? "Platform"} description="Platform data and controls are served through authenticated, audited Supabase operations.">
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
      {sections.map((item) => <TouchableOpacity key={item.key} onPress={() => { setSection(item.key); setStatus(""); }} style={[styles.tab, section === item.key && styles.activeTab]}><Text style={[styles.tabText, section === item.key && styles.activeTabText]}>{item.label}</Text></TouchableOpacity>)}
    </ScrollView>
    {(["providers", "customers"].includes(section) || ["applications", "requests", "reports", "account_reviews"].includes(section)) && <TextInput value={section === "applications" || section === "requests" || section === "reports" || section === "account_reviews" ? status : search}
      onChangeText={section === "applications" || section === "requests" || section === "reports" || section === "account_reviews" ? setStatus : setSearch}
      placeholder={["applications", "requests", "reports", "account_reviews"].includes(section) ? "Filter by status (blank for all)" : "Search by name, phone, or email"} placeholderTextColor={Colors.textLight} style={styles.input} />}
    {(["applications", "reports", "account_reviews"].includes(section) || ["customers", "providers"].includes(section)) && <TextInput value={notes} onChangeText={setNotes} placeholder="Reason or case notes for changes (required)" placeholderTextColor={Colors.textLight} style={styles.input} />}
    {section === "categories" && <View style={styles.form}>
      <TextInput value={name} onChangeText={(v) => { setName(v); if (!editingId) setSlug(v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")); }} placeholder="Category name" placeholderTextColor={Colors.textLight} style={styles.input} />
      <TextInput value={slug} onChangeText={setSlug} placeholder="URL slug" placeholderTextColor={Colors.textLight} style={styles.input} />
      <TextInput value={description} onChangeText={setDescription} placeholder="Description" placeholderTextColor={Colors.textLight} style={styles.input} />
      <TextInput value={icon} onChangeText={setIcon} placeholder="Icon name" placeholderTextColor={Colors.textLight} style={styles.input} />
      <TextInput value={sortOrder} onChangeText={setSortOrder} keyboardType="number-pad" placeholder="Sort order" placeholderTextColor={Colors.textLight} style={styles.input} />
      <TouchableOpacity style={styles.stateButton} onPress={() => setItemActive(!itemActive)}><Text style={styles.stateText}>Category {itemActive ? "active" : "inactive"} · tap to toggle</Text></TouchableOpacity>
      <TouchableOpacity disabled={busy} style={styles.primaryButton} onPress={() => void act(() => adminApi.saveCategory({ id: editingId, name, slug, description, icon, active: itemActive, sortOrder: Number(sortOrder) || 0 }))}><Text style={styles.primaryText}>{editingId ? "Save category" : "Create category"}</Text></TouchableOpacity>
      {!!editingId && <TouchableOpacity onPress={() => { setEditingId(null); setName(""); setSlug(""); setDescription(""); setIcon(""); }}><Text style={styles.link}>Cancel edit</Text></TouchableOpacity>}
    </View>}
    {section === "areas" && <View style={styles.form}>
      <TextInput value={county} onChangeText={setCounty} placeholder="County (e.g. Kiambu)" placeholderTextColor={Colors.textLight} style={styles.input} />
      <TextInput value={area} onChangeText={setArea} placeholder="Area / town" placeholderTextColor={Colors.textLight} style={styles.input} />
      <TextInput value={sortOrder} onChangeText={setSortOrder} keyboardType="number-pad" placeholder="Sort order" placeholderTextColor={Colors.textLight} style={styles.input} />
      <TouchableOpacity style={styles.stateButton} onPress={() => setItemActive(!itemActive)}><Text style={styles.stateText}>Area {itemActive ? "active" : "inactive"} · tap to toggle</Text></TouchableOpacity>
      {profile?.role === "super_admin" ? <TouchableOpacity disabled={busy} style={styles.primaryButton} onPress={() => void act(() => adminApi.saveArea(county, area, itemActive, Number(sortOrder) || 0))}><Text style={styles.primaryText}>{itemActive ? "Add or activate area" : "Deactivate area"}</Text></TouchableOpacity> : <Text style={styles.muted}>Only a super-admin can change supported counties and areas.</Text>}
    </View>}
    {!!error && <Text style={styles.error}>{error}</Text>}
    {loading && <ActivityIndicator color={Colors.primary} />}
    {!loading && !error && rows.length === 0 && <Text style={styles.muted}>No records found.</Text>}
    {rows.map((item, index) => {
      const id = value(item, "id", value(item, "job_id", String(index)));
      const nested = object(item, "profile");
      const applicant = object(item, "applicant");
      const heading = value(item, "business_name", value(item, "full_name", value(item, "user_name", value(nested, "full_name", value(applicant, "full_name", value(item, "title", value(item, "category", value(item, "action", value(item, "name", value(item, "area_name", value(item, "description", "Record")))))))))));
      return <View key={`${id}-${index}`} style={styles.card}>
        <Text style={styles.heading}>{heading}</Text>
        {section === "providers" && <><Text style={styles.muted}>{value(nested, "full_name")} · {value(nested, "email")} · {value(nested, "phone")}</Text><Text style={styles.detail}>Verification: {verificationLabel(value(item, "verification_status"), Boolean(item.phone_verified))}</Text></>}
        {section === "providers" && <Text style={styles.detail}>Account: {nested.is_active ? "Active" : "Deactivated"}</Text>}
        {section === "applications" && <Text style={styles.muted}>{value(item, "owner_name", value(applicant, "full_name"))} · {value(item, "phone", value(applicant, "phone"))} · {value(applicant, "email")} · {verificationLabel(value(item, "verification_status"), Boolean(item.phone_verified))}</Text>}
        {section === "applications" && Array.isArray(item.services) && <Text style={styles.detail}>Services: {(item.services as AdminRecord[]).map((service) => value(service,"service_name",value(service,"service_category_id"))).join(", ") || "None"}</Text>}
        {section === "applications" && Array.isArray(item.areas) && <Text style={styles.detail}>Requested areas: {(item.areas as AdminRecord[]).map((serviceArea) => `${value(serviceArea,"area_name",value(serviceArea,"area"))}, ${value(serviceArea,"county")}`).join(" · ") || "None"}</Text>}
        {section === "customers" && <Text style={styles.muted}>{value(item, "email")} · {value(item, "phone")} · {item.is_active ? "Active" : "Deactivated"} · {value(item, "request_count", "0")} requests · {value(item, "job_count", "0")} jobs</Text>}
        {section === "customers" && Array.isArray(item.requests) && <View style={styles.history}><Text style={styles.historyTitle}>Request history</Text>{(item.requests as AdminRecord[]).slice(0, 5).map((entry) => <Text key={value(entry,"id")} style={styles.detail}>{value(entry,"title")} · {value(entry,"status")} · {value(entry,"area_name")}</Text>)}</View>}
        {section === "customers" && Array.isArray(item.jobs) && <View style={styles.history}><Text style={styles.historyTitle}>Job history</Text>{(item.jobs as AdminRecord[]).slice(0, 5).map((entry) => <Text key={value(entry,"id")} style={styles.detail}>{value(entry,"category")} · {value(entry,"status")} · {value(entry,"provider")}</Text>)}</View>}
        {section === "providers" && Array.isArray(item.recent_jobs) && <View style={styles.history}><Text style={styles.historyTitle}>Recent provider jobs</Text>{(item.recent_jobs as AdminRecord[]).slice(0, 5).map((entry) => <Text key={value(entry,"job_id")} style={styles.detail}>{value(entry,"category")} · {value(entry,"status")} · {value(entry,"area_name")}</Text>)}</View>}
        {section === "requests" && Array.isArray(item.matches) && <View style={styles.history}><Text style={styles.historyTitle}>Matching providers & responses (top five)</Text>{(item.matches as AdminRecord[]).map((entry, matchIndex) => <Text key={`${value(entry,"provider_id")}-${matchIndex}`} style={styles.detail}>{value(entry,"match_rank")}. {value(entry,"business_name")} · {entry.distance_km == null ? "Selected area" : `${Number(entry.distance_km).toFixed(1)} km`} · {entry.rating_average == null ? "New" : `${Number(entry.rating_average).toFixed(1)} stars`} · {entry.is_available ? "Available" : "Unavailable"} · {verificationLabel(value(entry,"verification_status"), Boolean(entry.phone_verified))} · response {value(entry,"response_status","none")}</Text>)}</View>}
        {section === "areas" && <Text style={styles.muted}>{value(item, "county")} · {item.is_active ? "Active" : "Inactive"} · order {value(item, "sort_order")}</Text>}
        {detail(item).map(([label, text]) => <Text key={label} style={styles.detail}>{label}: {text}</Text>)}
        {section === "audit" && item.metadata != null && <Text style={styles.detail}>Metadata: {JSON.stringify(item.metadata)}</Text>}
        {section === "applications" && ["pending", "under_review"].includes(value(item, "verification_status")) && <><TouchableOpacity style={styles.phoneCheck} onPress={() => setPhoneChecks((current) => ({ ...current, [id]: !current[id] }))}><Text style={styles.detail}>{phoneChecks[id] ? "[x]" : "[ ]"} I called or messaged this number and confirmed it belongs to the applicant</Text></TouchableOpacity><View style={styles.buttons}><TouchableOpacity disabled={busy || !notes.trim() || !phoneChecks[id]} style={styles.primaryButton} onPress={() => void act(() => adminApi.reviewApplication(id, "approved", notes, true))}><Text style={styles.primaryText}>Verify phone & approve</Text></TouchableOpacity><TouchableOpacity disabled={busy || !notes.trim()} style={styles.dangerButton} onPress={() => void act(() => adminApi.reviewApplication(id, "rejected", notes, false))}><Text style={styles.primaryText}>Reject</Text></TouchableOpacity></View></>}
        {section === "providers" && <><TouchableOpacity style={styles.phoneCheck} onPress={() => setPhoneChecks((current) => ({ ...current, [id]: !current[id] }))}><Text style={styles.detail}>{(phoneChecks[id] ?? Boolean(item.phone_verified)) ? "[x]" : "[ ]"} Phone number confirmed</Text></TouchableOpacity><View style={styles.buttons}><TouchableOpacity disabled={busy || !notes.trim() || !(phoneChecks[id] ?? Boolean(item.phone_verified))} style={styles.primaryButton} onPress={() => void act(() => adminApi.setProviderStatus(id, "verified", notes, true))}><Text style={styles.primaryText}>Verify / reactivate</Text></TouchableOpacity><TouchableOpacity disabled={busy || !notes.trim()} style={styles.dangerButton} onPress={() => void act(() => adminApi.setProviderStatus(id, "suspended", notes, null))}><Text style={styles.primaryText}>Suspend</Text></TouchableOpacity></View></>}
        {["customers", "providers"].includes(section) && <TouchableOpacity disabled={busy} style={(section === "providers" ? Boolean(nested.is_active) : Boolean(item.is_active)) ? styles.dangerButton : styles.primaryButton} onPress={() => {
          if (!notes.trim()) {
            setError("Enter a reason or case note before changing this account's status.");
            return;
          }
          const active = section === "providers" ? Boolean(nested.is_active) : Boolean(item.is_active);
          void act(() => adminApi.setUserActive(id, !active, notes));
        }}><Text style={styles.primaryText}>{(section === "providers" ? Boolean(nested.is_active) : Boolean(item.is_active)) ? "Deactivate account" : "Activate account"}</Text></TouchableOpacity>}
        {section === "account_reviews" && item.status === "pending" && <View style={styles.buttons}><TouchableOpacity disabled={busy || !notes.trim()} style={styles.primaryButton} onPress={() => void act(() => adminApi.reviewAccountRequest(id, "approved", notes))}><Text style={styles.primaryText}>Approve & activate</Text></TouchableOpacity><TouchableOpacity disabled={busy || !notes.trim()} style={styles.dangerButton} onPress={() => void act(() => adminApi.reviewAccountRequest(id, "denied", notes))}><Text style={styles.primaryText}>Deny request</Text></TouchableOpacity></View>}
        {section === "reports" && <View style={styles.buttons}><TouchableOpacity disabled={busy} style={styles.primaryButton} onPress={() => void act(() => item.report_source === "user_report" ? adminApi.updateUserReport(id, "in_progress", notes || "Assigned for review") : adminApi.updateReport(id, "in_progress", notes || "Assigned for review"))}><Text style={styles.primaryText}>In progress</Text></TouchableOpacity><TouchableOpacity disabled={busy} style={styles.primaryButton} onPress={() => void act(() => item.report_source === "user_report" ? adminApi.updateUserReport(id, "resolved", notes || "Resolved by platform admin") : adminApi.updateReport(id, "resolved", notes || "Resolved by platform admin"))}><Text style={styles.primaryText}>Resolve</Text></TouchableOpacity><TouchableOpacity disabled={busy} style={styles.dangerButton} onPress={() => void act(() => item.report_source === "user_report" ? adminApi.updateUserReport(id, "dismissed", notes || "Dismissed by platform admin") : adminApi.updateReport(id, "dismissed", notes || "Dismissed by platform admin"))}><Text style={styles.primaryText}>Dismiss</Text></TouchableOpacity></View>}
        {section === "reviews" && <View style={styles.buttons}><TouchableOpacity disabled={busy || !notes.trim()} style={styles.primaryButton} onPress={() => void act(() => adminApi.moderateReview(value(item, "job_id"), true, notes))}><Text style={styles.primaryText}>Show review</Text></TouchableOpacity><TouchableOpacity disabled={busy || !notes.trim()} style={styles.dangerButton} onPress={() => void act(() => adminApi.moderateReview(value(item, "job_id"), false, notes))}><Text style={styles.primaryText}>Hide review</Text></TouchableOpacity></View>}
        {section === "categories" && <TouchableOpacity style={styles.linkButton} onPress={() => { setEditingId(id); setName(value(item,"name","")); setSlug(value(item,"slug","")); setDescription(value(item,"description","")); setIcon(value(item,"icon","")); setSortOrder(value(item,"sort_order","0")); setItemActive(Boolean(item.is_active)); }}><Text style={styles.link}>Edit category</Text></TouchableOpacity>}
        {section === "areas" && profile?.role === "super_admin" && <TouchableOpacity style={styles.linkButton} onPress={() => { setCounty(value(item,"county","")); setArea(value(item,"area_name","")); setSortOrder(value(item,"sort_order","0")); setItemActive(Boolean(item.is_active)); }}><Text style={styles.link}>Edit / change active status</Text></TouchableOpacity>}
      </View>;
    })}
  </RouteScaffold>;
}

const styles = StyleSheet.create({ tabs: { gap: 8 }, tab: { paddingVertical: 9, paddingHorizontal: 13, borderWidth: 1, borderColor: Colors.border, borderRadius: 18 }, activeTab: { backgroundColor: Colors.primary, borderColor: Colors.primary }, tabText: { color: Colors.textSecondary, fontWeight: "700" }, activeTabText: { color: "#fff" }, input: { minHeight: 46, paddingHorizontal: 12, borderColor: Colors.border, borderWidth: 1, borderRadius: 10, color: Colors.text, backgroundColor: "#fff" }, form: { gap: 9, padding: 12, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, backgroundColor: Colors.backgroundSecondary }, card: { padding: 14, gap: 7, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, backgroundColor: Colors.backgroundSecondary }, heading: { color: Colors.text, fontWeight: "800", fontSize: 16 }, detail: { color: Colors.textSecondary, lineHeight: 19 }, muted: { color: Colors.textSecondary, lineHeight: 20 }, history: { gap: 3, padding: 8, backgroundColor: "#fff", borderRadius: 8 }, historyTitle: { color: Colors.text, fontWeight: "700" }, phoneCheck: { paddingVertical: 9 }, buttons: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }, primaryButton: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 9, backgroundColor: Colors.primary }, dangerButton: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 9, backgroundColor: Colors.error }, primaryText: { color: "#fff", fontWeight: "700" }, error: { color: Colors.error }, link: { color: Colors.primary, fontWeight: "700", paddingVertical: 6 }, linkButton: { alignSelf: "flex-start" }, stateButton: { paddingVertical: 10 }, stateText: { color: Colors.primary, fontWeight: "700" } });
