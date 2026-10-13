import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { RouteScaffold } from "../../components/RouteScaffold";
import { Colors } from "../../constants/Colors";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";

type Plan = { plan_key: string; display_name: string; price_kes: number; billing_interval: string; trial_days: number; features: string[] };
type Payment = { id: string; amount_kes: number; status: string; payment_reference: string | null; created_at: string };
type Item = { id: string; plan_key: string; status: string; starts_at: string | null; ends_at: string | null };
type FeaturedItem = { id: string; status: string; ends_at: string | null; area_name: string };
type Category = { id: string; name: string };

export default function ProviderMonetizationScreen() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Item[]>([]);
  const [featured, setFeatured] = useState<FeaturedItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [area, setArea] = useState("");
  const [days, setDays] = useState("1");
  const [reference, setReference] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const results = await Promise.all([
      supabase.from("provider_plan_catalog").select("plan_key,display_name,price_kes,billing_interval,trial_days,features").eq("is_active", true),
      supabase.from("provider_subscriptions").select("id,plan_key,status,starts_at,ends_at").eq("provider_id", user.id).order("created_at", { ascending: false }),
      supabase.from("featured_listings").select("id,status,ends_at,area_name,category_id").eq("provider_id", user.id).order("created_at", { ascending: false }),
      supabase.from("monetization_payments").select("id,amount_kes,status,payment_reference,created_at").eq("provider_id", user.id).order("created_at", { ascending: false }),
      supabase.from("service_categories").select("id,name").eq("is_active", true).order("sort_order"),
    ]);
    const failed = results.find((result) => result.error);
    if (failed?.error) setError(failed.error.message);
    else {
      setPlans((results[0].data ?? []) as Plan[]); setSubscriptions((results[1].data ?? []) as Item[]);
      setFeatured((results[2].data ?? []) as FeaturedItem[]); setPayments((results[3].data ?? []) as Payment[]);
      setCategories((results[4].data ?? []) as Category[]); setError("");
    }
    setLoading(false);
  }, [user]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const run = async (label: string, action: () => PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
    if (busy) return;
    setBusy(true); setError("");
    try { const { error: rpcError } = await action(); if (rpcError) throw new Error(rpcError.message); await load(); Alert.alert(label, "Your request has been saved."); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not complete this action."); }
    finally { setBusy(false); }
  };
  const requestPlan = (plan: Plan) => {
    if (plan.plan_key === "free") {
      Alert.alert("Start free week", "The free trial is available once per provider account.", [
        { text: "Cancel", style: "cancel" },
        { text: "Start trial", onPress: () => void run("Trial started", () => supabase.rpc("start_provider_free_trial")) },
      ]);
      return;
    }
    Alert.alert(`Request ${plan.display_name}`, `This creates a KSh ${plan.price_kes} payment record. Follow MTAA SERVICES payment instructions, then submit your transaction reference for admin verification.${plan.billing_interval === "unspecified" ? " The billing term must also be confirmed." : ""}`, [
      { text: "Cancel", style: "cancel" },
      { text: "Continue", onPress: () => void run("Payment request created", () => supabase.rpc("request_provider_subscription", { p_plan_key: plan.plan_key })) },
    ]);
  };
  const requestFeatured = () => {
    const duration = Number(days);
    if (!categoryId || !area.trim() || !Number.isInteger(duration) || duration < 1 || duration > 365) { Alert.alert("Complete listing details", "Choose a service, enter an area, and set 1 to 365 days."); return; }
    Alert.alert("Request featured placement", `KSh ${100 * duration} for ${duration} day${duration === 1 ? "" : "s"}. The listing activates only after an admin verifies payment.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Continue", onPress: () => void run("Featured request created", () => supabase.rpc("request_featured_listing", { p_category_id: categoryId, p_area_name: area.trim(), p_duration_days: duration })) },
    ]);
  };
  const submitReference = (payment: Payment) => {
    const value = reference[payment.id]?.trim();
    if (!value) { Alert.alert("Enter payment reference", "Add the transaction reference from your payment receipt."); return; }
    void run("Reference submitted", () => supabase.rpc("submit_monetization_payment_reference", { p_payment_id: payment.id, p_reference: value }));
  };

  return <RouteScaffold eyebrow="Provider" title="Plans & featured listings" description="Testing-phase prices. Paid access and promotion begin only after payment verification.">
    {loading && <ActivityIndicator color={Colors.primary} />}
    {!!error && <Text style={styles.error}>{error}</Text>}
    <Text style={styles.section}>Provider plans</Text>
    <Text style={styles.muted}>Paid plans do not replace admin identity checks. Verified status is granted only after profile and phone review.</Text>
    {plans.map((plan) => <View key={plan.plan_key} style={styles.card}>
      <View style={styles.row}><Text style={styles.title}>{plan.display_name}</Text><Text style={styles.price}>{plan.price_kes ? `KSh ${plan.price_kes}` : `${plan.trial_days} days free`}{plan.billing_interval === "week" ? "/week" : ""}</Text></View>
      <Text style={styles.muted}>{plan.billing_interval === "unspecified" ? "Billing term to be confirmed before activation" : plan.plan_key === "free" ? "One free trial per provider account" : "Weekly subscription"}</Text>
      {(plan.features ?? []).map((feature) => <Text key={feature} style={styles.muted}>✓ {feature}</Text>)}
      <TouchableOpacity style={styles.button} disabled={busy} onPress={() => requestPlan(plan)}><Text style={styles.buttonText}>{plan.plan_key === "free" ? "Start free week" : "Request plan"}</Text></TouchableOpacity>
    </View>)}
    <Text style={styles.section}>Request a featured listing · KSh 100/day</Text>
    <View style={styles.card}>
      <Text style={styles.label}>Service category</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>{categories.map((category) => <TouchableOpacity key={category.id} style={[styles.choice,categoryId===category.id&&styles.choiceActive]} onPress={() => setCategoryId(category.id)}><Text style={[styles.choiceText,categoryId===category.id&&styles.choiceTextActive]}>{category.name}</Text></TouchableOpacity>)}</ScrollView>
      <TextInput value={area} onChangeText={setArea} placeholder="Area / neighborhood" placeholderTextColor={Colors.textSecondary} style={styles.input} />
      <TextInput value={days} onChangeText={setDays} keyboardType="number-pad" placeholder="Number of days (1–365)" placeholderTextColor={Colors.textSecondary} style={styles.input} />
      <Text style={styles.muted}>Featured listings appear higher in matching category and area discovery.</Text>
      <TouchableOpacity style={styles.button} disabled={busy} onPress={requestFeatured}><Text style={styles.buttonText}>Create payment request</Text></TouchableOpacity>
    </View>
    <Text style={styles.section}>Payment references</Text>
    {payments.map((payment) => <View key={payment.id} style={styles.card}><Text style={styles.title}>KSh {payment.amount_kes} · {payment.status.replaceAll("_"," ")}</Text><Text style={styles.muted}>Order {payment.id}</Text>{payment.status === "awaiting_reference" ? <><Text style={styles.muted}>Pay using the payment instructions supplied by MTAA SERVICES, then enter the receipt reference below.</Text><TextInput value={reference[payment.id] ?? ""} onChangeText={(value) => setReference((current) => ({ ...current, [payment.id]: value }))} placeholder="M-Pesa / payment reference" placeholderTextColor={Colors.textSecondary} style={styles.input} /><TouchableOpacity style={styles.button} disabled={busy} onPress={() => submitReference(payment)}><Text style={styles.buttonText}>Submit reference for review</Text></TouchableOpacity><TouchableOpacity disabled={busy} onPress={() => void run("Order cancelled", () => supabase.rpc("cancel_monetization_payment_request", { p_payment_id: payment.id }))}><Text style={styles.cancelText}>Cancel this payment request</Text></TouchableOpacity></> : payment.payment_reference ? <Text style={styles.muted}>Reference: {payment.payment_reference}</Text> : null}</View>)}
    {!payments.length && !loading && <Text style={styles.muted}>No payment requests yet.</Text>}
    <Text style={styles.section}>Your subscriptions and listings</Text>
    {subscriptions.map((item) => <Text key={item.id} style={styles.muted}>{item.plan_key.toUpperCase()} · {item.status.replaceAll("_"," ")} · ends {item.ends_at ? new Date(item.ends_at).toLocaleDateString() : "pending activation"}</Text>)}
    {featured.map((item) => <Text key={item.id} style={styles.muted}>Featured · {item.area_name} · {item.status} · ends {item.ends_at ? new Date(item.ends_at).toLocaleDateString() : "pending payment"}</Text>)}
  </RouteScaffold>;
}

const styles=StyleSheet.create({section:{color:Colors.text,fontSize:18,fontWeight:"800",marginTop:8},card:{padding:14,gap:9,borderRadius:14,borderWidth:1,borderColor:Colors.border,backgroundColor:Colors.backgroundSecondary},row:{flexDirection:"row",justifyContent:"space-between",gap:8},title:{color:Colors.text,fontWeight:"800",fontSize:16},price:{color:Colors.primary,fontWeight:"900"},muted:{color:Colors.textSecondary,lineHeight:20},label:{color:Colors.text,fontWeight:"700"},choices:{gap:8},choice:{padding:9,borderRadius:18,borderWidth:1,borderColor:Colors.border},choiceActive:{backgroundColor:Colors.primary,borderColor:Colors.primary},choiceText:{color:Colors.textSecondary},choiceTextActive:{color:"#fff"},input:{minHeight:44,paddingHorizontal:12,borderWidth:1,borderColor:Colors.border,borderRadius:10,color:Colors.text},button:{minHeight:44,alignItems:"center",justifyContent:"center",borderRadius:10,backgroundColor:Colors.primary},buttonText:{color:"#fff",fontWeight:"800"},cancelText:{color:Colors.error,fontWeight:"700",textAlign:"center",padding:8},error:{color:Colors.error}});
