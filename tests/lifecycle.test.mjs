import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const missingConfiguration = [
  !supabaseUrl && "SUPABASE_TEST_URL",
  !anonKey && "SUPABASE_TEST_ANON_KEY",
  !serviceRoleKey && "SUPABASE_TEST_SERVICE_ROLE_KEY",
].filter(Boolean);

function createSupabaseClient(key) {
  return createClient(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function createSignedUpAccount(admin, accountType, runId) {
  const email = `ci-${accountType}-${runId}@example.test`;
  const password = `CI-${randomUUID()}-aA1!`;
  const anonymousClient = createSupabaseClient(anonKey);
  const { data, error } = await anonymousClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        account_type: accountType,
        full_name: `CI ${accountType} ${runId.slice(0, 8)}`,
      },
    },
  });

  assert.ifError(error);
  assert.ok(data.user, `${accountType} signup should return a user`);

  try {
    const { error: confirmationError } = await admin.auth.admin.updateUserById(
      data.user.id,
      { email_confirm: true },
    );
    assert.ifError(confirmationError);

    const client = createSupabaseClient(anonKey);
    const { data: signInData, error: signInError } =
      await client.auth.signInWithPassword({ email, password });
    assert.ifError(signInError);
    assert.ok(signInData.user, `${accountType} should be able to sign in`);

    return { id: data.user.id, client };
  } catch (error) {
    await removeSeededAccount(admin, data.user.id);
    throw error;
  }
}

async function removeSeededAccount(admin, userId) {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error && !/not found|does not exist/i.test(error.message)) {
    throw error;
  }
}

test(
  "signup through customer request, provider job, completion, and review",
  { skip: missingConfiguration.length ? `Missing ${missingConfiguration.join(", ")}` : false },
  async () => {
    const admin = createSupabaseClient(serviceRoleKey);
    const runId = randomUUID();
    const areaName = `CI ${runId.slice(0, 8)}`;
    const county = "CI Test County";
    let customer;
    let provider;
    let requestId;
    let jobId;

    try {
      customer = await createSignedUpAccount(admin, "customer", runId);
      provider = await createSignedUpAccount(admin, "provider", runId);

      const { error: customerProfileError } = await admin
        .from("profiles")
        .update({
          is_active: true,
          phone_verification_required: false,
        })
        .eq("id", customer.id);
      assert.ifError(customerProfileError);

      const { error: providerProfileError } = await admin
        .from("profiles")
        .update({
          role: "provider",
          account_type: "provider",
          is_active: true,
          onboarding_completed: true,
          phone_verified: true,
          phone_verification_required: false,
        })
        .eq("id", provider.id);
      assert.ifError(providerProfileError);

      const { error: providerError } = await admin.from("providers").upsert({
        id: provider.id,
        business_name: `CI Services ${runId.slice(0, 8)}`,
        phone: "+254700000000",
        verification_status: "verified",
        phone_verified: true,
        is_available: true,
        is_online: true,
      });
      assert.ifError(providerError);

      const { data: categories, error: categoryError } = await admin
        .from("service_categories")
        .select("id")
        .eq("is_active", true)
        .order("sort_order")
        .limit(1);
      assert.ifError(categoryError);
      assert.ok(categories?.[0], "the test project needs an active service category");
      const categoryId = categories[0].id;

      const { error: serviceError } = await admin.from("provider_services").insert({
        provider_id: provider.id,
        category_id: categoryId,
        is_active: true,
      });
      assert.ifError(serviceError);

      const { error: areaError } = await admin.from("service_areas").insert({
        provider_id: provider.id,
        area_name: areaName,
        county,
        radius_km: 10,
        is_primary: true,
      });
      assert.ifError(areaError);

      const anonymousClient = createSupabaseClient(anonKey);
      const { error: unauthenticatedError } = await anonymousClient.rpc(
        "create_service_request",
        {
          p_category_id: categoryId,
          p_description: "Unauthenticated CI request should fail",
          p_latitude: null,
          p_longitude: null,
          p_address: null,
          p_area_name: areaName,
          p_county: county,
          p_urgency: "today",
          p_client_request_id: randomUUID(),
        },
      );
      assert.ok(unauthenticatedError, "anonymous request creation must be rejected");

      const clientRequestId = randomUUID();
      const { data: createdRequestId, error: requestError } =
        await customer.client.rpc("create_service_request", {
          p_category_id: categoryId,
          p_description: `CI lifecycle request ${runId}`,
          p_latitude: null,
          p_longitude: null,
          p_address: null,
          p_area_name: areaName,
          p_county: county,
          p_urgency: "today",
          p_client_request_id: clientRequestId,
        });
      assert.ifError(requestError);
      assert.ok(createdRequestId, "request creation should return its persistent ID");
      requestId = createdRequestId;

      const { data: retriedRequestId, error: retryError } =
        await customer.client.rpc("create_service_request", {
          p_category_id: categoryId,
          p_description: `CI lifecycle request ${runId}`,
          p_latitude: null,
          p_longitude: null,
          p_address: null,
          p_area_name: areaName,
          p_county: county,
          p_urgency: "today",
          p_client_request_id: clientRequestId,
        });
      assert.ifError(retryError);
      assert.equal(retriedRequestId, requestId, "retry must return the original request ID");

      const { data: leads, error: leadsError } =
        await provider.client.rpc("get_provider_leads");
      assert.ifError(leadsError);
      assert.ok(
        leads?.some((lead) => lead.request_id === requestId),
        "the eligible provider should receive the new request as a lead",
      );

      const { error: responseError } =
        await provider.client.rpc("respond_to_service_request", {
          p_request_id: requestId,
          p_message: "CI provider response",
          p_quoted_price: 1500,
          p_estimated_arrival_minutes: 45,
        });
      assert.ifError(responseError);

      const { data: requestDetails, error: detailsError } =
        await customer.client.rpc("get_customer_request_details", {
          p_request_id: requestId,
        });
      assert.ifError(detailsError);
      const response = requestDetails?.find(
        (row) => row.provider_id === provider.id,
      );
      assert.ok(response?.response_id, "customer should read the provider response");

      const { data: selectedJobId, error: selectionError } =
        await customer.client.rpc("select_provider_response", {
          p_response_id: response.response_id,
        });
      assert.ifError(selectionError);
      assert.ok(selectedJobId, "customer selection should create a job");
      jobId = selectedJobId;

      for (const [action, expectedStatus] of [
        ["accept", "accepted"],
        ["on_the_way", "on_the_way"],
        ["arrived", "arrived"],
        ["start", "in_progress"],
        ["complete", "awaiting_confirmation"],
      ]) {
        const { data: status, error: statusError } =
          await provider.client.rpc("advance_job", {
            p_job_id: jobId,
            p_action: action,
          });
        assert.ifError(statusError);
        assert.equal(status, expectedStatus, `${action} should advance job state`);
      }

      const { data: completion, error: completionError } =
        await customer.client.rpc("confirm_job_completion", {
          p_job_id: jobId,
        });
      assert.ifError(completionError);
      assert.equal(completion, true, "customer should confirm completion");

      const { data: reviewId, error: reviewError } =
        await customer.client.rpc("submit_job_review", {
          p_job_id: jobId,
          p_rating: 5,
          p_review_text: "CI lifecycle review",
        });
      assert.ifError(reviewError);
      assert.ok(reviewId, "review should be persisted");

      const { data: storedReview, error: storedReviewError } = await admin
        .from("reviews")
        .select("id,job_id,rating,review_text")
        .eq("id", reviewId)
        .single();
      assert.ifError(storedReviewError);
      assert.equal(storedReview.job_id, jobId);
      assert.equal(storedReview.rating, 5);
      assert.equal(storedReview.review_text, "CI lifecycle review");

      const { data: storedJob, error: storedJobError } = await admin
        .from("jobs")
        .select("status")
        .eq("id", jobId)
        .single();
      assert.ifError(storedJobError);
      assert.equal(storedJob.status, "completed");
    } finally {
      if (requestId) {
        const { error: reviewCleanupError } = await admin
          .from("reviews")
          .delete()
          .eq("job_id", jobId);
        if (reviewCleanupError) throw reviewCleanupError;

        const { error: jobCleanupError } = await admin
          .from("jobs")
          .delete()
          .eq("request_id", requestId);
        if (jobCleanupError) throw jobCleanupError;

        const { error: requestCleanupError } = await admin
          .from("service_requests")
          .delete()
          .eq("id", requestId);
        if (requestCleanupError) throw requestCleanupError;
      }

      if (provider) {
        for (const table of ["provider_services", "service_areas", "providers"]) {
          const { error } = await admin
            .from(table)
            .delete()
            .eq(table === "providers" ? "id" : "provider_id", provider.id);
          if (error) throw error;
        }
        await removeSeededAccount(admin, provider.id);
      }
      if (customer) await removeSeededAccount(admin, customer.id);
    }
  },
);
