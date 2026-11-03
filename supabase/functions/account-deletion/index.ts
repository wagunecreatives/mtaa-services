import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";

type Database = {
  public: {
    Tables: {
      account_deletion_requests: {
        Row: {
          user_id: string;
          token_hash: string | null;
          requested_at: string;
          expires_at: string;
        };
        Insert: {
          user_id: string;
          token_hash?: string | null;
          requested_at?: string;
          expires_at: string;
        };
        Update: {
          user_id?: string;
          token_hash?: string | null;
          requested_at?: string;
          expires_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      start_account_deletion_request: {
        Args: {
          p_user_id: string;
          p_token_hash: string;
          p_expires_at: string;
        };
        Returns: boolean;
      };
      claim_account_deletion_request: {
        Args: { p_token_hash: string };
        Returns: string;
      };
      validate_account_deletion: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      delete_user_account: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
type AdminClient = SupabaseClient<Database>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const supportEmail = "wagunecreatives57@gmail.com";
const requestLifetimeMs = 15 * 60 * 1000;

const accountDeletionPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#123f76">
  <title>Delete your MTAA SERVICES account</title>
  <style>
    :root{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#14243a;background:#f3f6fb}
    body{margin:0;padding:24px;min-height:100vh;box-sizing:border-box;display:grid;place-items:center}
    main{box-sizing:border-box;width:min(100%,560px);padding:28px;background:#fff;border:1px solid #dce5f0;border-radius:20px;box-shadow:0 12px 40px #17365d12}
    h1{font-size:1.55rem;margin:0 0 12px}p{line-height:1.6;color:#41516a}
    label{display:block;font-weight:650;margin:20px 0 8px}
    input{box-sizing:border-box;width:100%;min-height:48px;padding:12px;border:1px solid #bdc9d8;border-radius:10px;font:inherit}
    button{min-height:48px;width:100%;margin-top:16px;border:0;border-radius:10px;background:#1769aa;color:#fff;font:inherit;font-weight:700;cursor:pointer}
    button.danger{background:#a32626}button:disabled{opacity:.6;cursor:wait}
    .notice{min-height:1.5em;margin-top:16px;color:#23486c}.links{display:flex;gap:18px;flex-wrap:wrap;margin-top:22px}
    a{color:#1769aa}ul{padding-left:22px;color:#41516a;line-height:1.6}
    .contact{margin-top:22px;padding-top:16px;border-top:1px solid #e3eaf2}
  </style>
</head>
<body>
<main>
  <h1 id="title">Request account deletion</h1>
  <div id="content">
    <p>Enter the email address registered to your MTAA SERVICES account. We will send a verification link to that address. Your account is not deleted until you open that email and confirm the request.</p>
    <form id="request-form">
      <label for="email">Account email</label>
      <input id="email" name="email" type="email" autocomplete="email" maxlength="254" required>
      <button id="submit" type="submit">Send verification email</button>
    </form>
  </div>
  <p id="notice" class="notice" role="status" aria-live="polite"></p>
  <div class="links"><a href="?view=privacy-policy">Privacy policy</a><a href="?view=terms-of-use">Terms of Use</a><a href="mailto:${supportEmail}">Contact support</a></div>
  <p class="contact"><strong>Developer:</strong> Wagune Creatives<br><strong>Support &amp; Privacy:</strong> <a href="mailto:${supportEmail}">${supportEmail}</a></p>
</main>
<script>
  const notice = document.getElementById("notice");
  const params = new URLSearchParams(location.search);
  const token = params.get("token");
  const content = document.getElementById("content");
  const title = document.getElementById("title");
  const post = async (payload) => {
    const response = await fetch(location.pathname, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "The request could not be completed. Please try again or contact support.");
    return result;
  };
  if (params.get("view") === "privacy-policy") {
    title.textContent = "MTAA SERVICES privacy policy";
    content.innerHTML = \`
      <p><strong>Effective date: November 2, 2026</strong></p>
      <p>Wagune Creatives ("we") operates MTAA SERVICES, a marketplace that helps customers find local service providers. This policy explains what information the app uses, why it is used, and how you can request deletion.</p>
      <h2>Information we use</h2>
      <ul>
        <li>Account details such as your name, email address, phone number, account type, and verification state.</li>
        <li>Customer requests, service addresses and approximate location, provider business details and service areas, job communications, reviews, and reports you submit.</li>
        <li>Photos you choose to upload, and device push-notification tokens when you enable notifications.</li>
        <li>Information needed to authenticate your account, protect the service, and troubleshoot requests.</li>
      </ul>
      <h2>How we use and share information</h2>
      <p>We use this information to create and secure accounts, match customers with providers, deliver requested services and messages, verify contact details, send service notifications, prevent abuse, and provide support. We do not sell personal information or use it for third-party advertising.</p>
      <p>We use Supabase for authentication, database, and file storage; Resend to deliver email; and Expo's notification service to deliver push notifications. Information is shared with the relevant customer or provider when needed to respond to a service request. Location is used only while the app is in use to find and match nearby services.</p>
      <h2>Retention and deletion</h2>
      <p>We retain information for as long as needed to provide the service, meet legal obligations, resolve disputes, and prevent fraud. You may request deletion in the app or on our <a href="?view=account-deletion">account deletion page</a>. We verify ownership before deletion. Account and associated personal data are deleted unless limited information must be retained for a legal obligation or a legitimate dispute, fraud-prevention, or transaction-record purpose. Retained information is limited to what is necessary and deleted when the reason for retention ends. An account involved in an active dispute may not be deleted until the dispute is resolved.</p>
      <h2>Security and your choices</h2>
      <p>We use access controls and secure storage to protect account information. No online service can guarantee absolute security. You can control optional push notifications in app settings and can request access, correction, or deletion by contacting us.</p>
      <h2>Children</h2>
      <p>MTAA SERVICES is a general service marketplace and is not designed for children under 13. We do not knowingly collect personal information from children under 13.</p>
      <h2>Contact</h2>
      <p><strong>Developer:</strong> Wagune Creatives<br><strong>App:</strong> MTAA SERVICES<br><strong>Support &amp; Privacy:</strong> <a href="mailto:${supportEmail}">${supportEmail}</a></p>
      <p><a href="?view=account-deletion">Request account deletion</a></p>\`;
  } else if (token) {
    title.textContent = "Confirm account deletion";
    content.innerHTML = \`
      <p>This verified link allows you to permanently delete the MTAA SERVICES account registered to this email address and its associated personal data.</p>
      <p>Deletion cannot be undone. Information required to resolve an active dispute may be retained, and deletion may be delayed until that dispute is resolved.</p>
      <button id="confirm" class="danger" type="button">Permanently delete my account</button>\`;
    document.getElementById("confirm").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      notice.textContent = "Processing your verified request…";
      try {
        await post({ action: "confirm", token });
        content.innerHTML = "<p>Your account and associated personal data have been deleted. If information must be retained for an active dispute or legal obligation, we will retain only what is necessary.</p>";
        title.textContent = "Account deleted";
        notice.textContent = "";
      } catch (error) {
        notice.textContent = error instanceof Error ? error.message : "The request could not be completed. Please contact support.";
        button.disabled = false;
      }
    });
  }
  const form = document.getElementById("request-form");
  if (form) form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.getElementById("submit");
    button.disabled = true;
    notice.textContent = "Sending request…";
    try {
      await post({ action: "request", email: document.getElementById("email").value });
      notice.textContent = "If an account exists for that email, a verification link will arrive shortly. Check your inbox and spam folder.";
    } catch (error) {
      notice.textContent = error instanceof Error ? error.message : "The request could not be submitted. Please try again.";
    } finally {
      button.disabled = false;
    }
  });
</script>
</body>
</html>`;

const privacyPolicyPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#123f76">
  <title>MTAA SERVICES privacy policy</title>
  <style>
    :root{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#14243a;background:#f3f6fb}
    body{margin:0;padding:24px;min-height:100vh;box-sizing:border-box;display:grid;place-items:start center}
    main{box-sizing:border-box;width:min(100%,760px);margin:24px auto;padding:28px;background:#fff;border:1px solid #dce5f0;border-radius:20px;box-shadow:0 12px 40px #17365d12}
    h1{font-size:1.55rem;margin:0 0 12px}h2{font-size:1.15rem;margin-top:24px}
    p,li{line-height:1.65;color:#41516a}ul{padding-left:22px}
    a{color:#1769aa}
  </style>
</head>
<body>
<main>
  <h1>MTAA SERVICES privacy policy</h1>
  <p><strong>Effective date: November 2, 2026</strong></p>
  <p>Wagune Creatives ("we") operates MTAA SERVICES, a marketplace that helps customers find local service providers. This policy explains what information the app uses, why it is used, and how you can request deletion.</p>
  <h2>Information we use</h2>
  <ul>
    <li>Account details such as your name, email address, phone number, account type, and verification state.</li>
    <li>Customer requests, service addresses and approximate location, provider business details and service areas, job communications, reviews, and reports you submit.</li>
    <li>Photos you choose to upload, and device push-notification tokens when you enable notifications.</li>
    <li>Information needed to authenticate your account, protect the service, and troubleshoot requests.</li>
  </ul>
  <h2>How we use and share information</h2>
  <p>We use this information to create and secure accounts, match customers with providers, deliver requested services and messages, verify contact details, send service notifications, prevent abuse, and provide support. We do not sell personal information or use it for third-party advertising.</p>
  <p>We use Supabase for authentication, database, and file storage; Resend to deliver email; and Expo's notification service to deliver push notifications. Information is shared with the relevant customer or provider when needed to respond to a service request. Location is used only while the app is in use to find and match nearby services.</p>
  <h2>Retention and deletion</h2>
  <p>We retain information for as long as needed to provide the service, meet legal obligations, resolve disputes, and prevent fraud. You may request deletion in the app or on our <a href="?view=account-deletion">account deletion page</a>. We verify ownership before deletion. Account and associated personal data are deleted unless limited information must be retained for a legal obligation or a legitimate dispute, fraud-prevention, or transaction-record purpose. Retained information is limited to what is necessary and deleted when the reason for retention ends. An account involved in an active dispute may not be deleted until the dispute is resolved.</p>
  <h2>Security and your choices</h2>
  <p>We use access controls and secure storage to protect account information. No online service can guarantee absolute security. You can control optional push notifications in app settings and can request access, correction, or deletion by contacting us.</p>
  <h2>Children</h2>
  <p>MTAA SERVICES is a general service marketplace and is not designed for children under 13. We do not knowingly collect personal information from children under 13.</p>
  <h2>Contact</h2>
  <p><strong>Developer:</strong> Wagune Creatives<br><strong>App:</strong> MTAA SERVICES<br><strong>Support &amp; Privacy:</strong> <a href="mailto:${supportEmail}">${supportEmail}</a></p>
  <p><a href="?view=account-deletion">Request account deletion</a> · <a href="?view=terms-of-use">Terms of Use and User Policy</a></p>
</main>
</body>
</html>`;

const userPolicyPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#123f76">
  <title>MTAA SERVICES Terms of Use and User Policy</title>
  <style>
    :root{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#14243a;background:#f3f6fb}
    body{margin:0;padding:24px;min-height:100vh;box-sizing:border-box;display:grid;place-items:start center}
    main{box-sizing:border-box;width:min(100%,760px);margin:24px auto;padding:28px;background:#fff;border:1px solid #dce5f0;border-radius:20px;box-shadow:0 12px 40px #17365d12}
    h1{font-size:1.55rem;margin:0 0 12px}h2{font-size:1.15rem;margin-top:24px}
    p,li{line-height:1.65;color:#41516a}ul{padding-left:22px}
    a{color:#1769aa}
  </style>
</head>
<body>
<main>
  <h1>MTAA SERVICES Terms of Use and User Policy</h1>
  <p><strong>Effective date: November 4, 2026 · Version 2026-11-04</strong></p>
  <p>These terms apply when you use MTAA SERVICES, a marketplace operated by Wagune Creatives to help customers find local service providers. By creating an account or continuing to use the app after accepting this policy, you agree to these terms.</p>
  <h2>Marketplace use</h2>
  <p>Provide accurate account, service, and request information. Use the marketplace only for lawful service-related purposes. You are responsible for your account, communications, and decisions when arranging or performing services. MTAA SERVICES helps people connect; unless we expressly say otherwise, we are not a party to agreements between customers and providers and do not guarantee a user's identity, qualifications, work, availability, or outcome.</p>
  <h2>Content and conduct rules</h2>
  <p>Content includes profiles, business listings, service requests, photos, messages, reviews, and reports. You may post content only if you have the rights and permissions needed to share it. Do not post or send content that:</p>
  <ul>
    <li>Is unlawful, fraudulent, deceptive, materially misleading, or impersonates another person or business.</li>
    <li>Threatens, harasses, bullies, discriminates against, or exploits another person.</li>
    <li>Contains sexual exploitation, child endangerment, or other prohibited harmful material.</li>
    <li>Reveals another person's private, confidential, or sensitive information without permission.</li>
    <li>Is spam, malware, an unsolicited promotion, or unrelated to the marketplace service.</li>
    <li>Infringes another person's intellectual property or other legal rights.</li>
  </ul>
  <h2>Reporting, blocking, and moderation</h2>
  <p>Use the in-app reporting tools to flag content or conduct that may break these rules, and use blocking tools to stop unwanted marketplace interactions. We review reports and may remove or restrict content, limit features, suspend accounts, or take other appropriate action. We may preserve or disclose information when reasonably necessary to protect users, investigate abuse, comply with law, or enforce these terms. We do not guarantee that every report will result in removal or other action.</p>
  <h2>Your content</h2>
  <p>You retain ownership of content you submit. You give Wagune Creatives a non-exclusive, worldwide, royalty-free license to host, store, reproduce, display, and share that content as needed to operate, secure, and improve the marketplace and show it to the people you choose to interact with. This license ends when the content is deleted, except where retention is needed for legal obligations, disputes, security, or backups. You can request account and associated data deletion through the app or the <a href="?view=account-deletion">account deletion page</a>; our <a href="?view=privacy-policy">Privacy Policy</a> explains retention and exceptions.</p>
  <h2>Account and service changes</h2>
  <p>Keep your sign-in details secure and notify us if you believe your account is being misused. You may stop using the service and request account deletion at any time, subject to limited retention or a delay needed to resolve an active dispute. We may change or discontinue features and may restrict access when needed to protect users, comply with law, or enforce these terms.</p>
  <h2>Contact</h2>
  <p>Questions or safety concerns? Contact Wagune Creatives at <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>
  <p><a href="?view=privacy-policy">Privacy Policy</a> · <a href="?view=account-deletion">Request account deletion</a></p>
</main>
</body>
</html>`;

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function hashToken(token: string) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)).then((digest) =>
    Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
  );
}

function newToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function removeUserFiles(
  admin: AdminClient,
  userId: string,
) {
  for (const bucket of ["service-request-photos", "provider-assets"]) {
    const pendingFolders = [userId];
    const paths: string[] = [];

    while (pendingFolders.length > 0) {
      const folder = pendingFolders.pop()!;
      let offset = 0;
      while (true) {
        const { data, error } = await admin.storage.from(bucket).list(folder, {
          limit: 100,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
        if (error) throw error;
        if (!data?.length) break;

        for (const item of data) {
          const path = `${folder}/${item.name}`;
          if (item.id === null) pendingFolders.push(path);
          else paths.push(path);
        }
        if (data.length < 100) break;
        offset += data.length;
      }
    }

    for (let index = 0; index < paths.length; index += 100) {
      const { error } = await admin.storage.from(bucket).remove(paths.slice(index, index + 100));
      if (error) throw error;
    }
  }
}

async function deleteAccount(admin: AdminClient, userId: string) {
  const { error: validationError } = await admin.rpc("validate_account_deletion", {
    p_user_id: userId,
  });
  if (validationError) throw validationError;

  await removeUserFiles(admin, userId);

  const { error: deletionError } = await admin.rpc("delete_user_account", {
    p_user_id: userId,
  });
  if (deletionError) throw deletionError;
}

function accountDeletionMessage(message: string) {
  if (message.includes("active dispute")) {
    return `Account deletion is paused while an active dispute is being reviewed. Contact ${supportEmail} for help.`;
  }
  if (message.includes("Account not found")) return "This account no longer exists.";
  return "The account deletion could not be completed. Please try again or contact support.";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Account deletion service is not configured." }, 500);
  }
  const admin = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (request.method === "GET") {
    const view = new URL(request.url).searchParams.get("view");
    const page = view === "privacy-policy"
      ? privacyPolicyPage
      : view === "terms-of-use"
        ? userPolicyPage
        : accountDeletionPage;
    return new Response(page, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "public, max-age=300",
      },
    });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const payload = await request.json();
    if (payload?.action === "request") {
      const email = typeof payload.email === "string" ? payload.email.trim() : "";
      if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonResponse({ error: "Enter a valid account email address." }, 400);
      }

      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      const resendFrom = Deno.env.get("RESEND_FROM");
      if (!resendApiKey || !resendFrom) {
        return jsonResponse({ error: "Email verification is not configured. Please contact support." }, 503);
      }

      const { data, error } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      if (error || !data?.user?.id) {
        return jsonResponse({
          message: "If an account exists for that email, a verification link will arrive shortly.",
        }, 202);
      }

      const token = newToken();
      const tokenHash = await hashToken(token);
      const expiresAt = new Date(Date.now() + requestLifetimeMs).toISOString();
      const { data: accepted, error: requestError } = await admin.rpc(
        "start_account_deletion_request",
        {
          p_user_id: data.user.id,
          p_token_hash: tokenHash,
          p_expires_at: expiresAt,
        },
      );
      if (requestError) throw requestError;
      if (!accepted) {
        return jsonResponse({
          message: "If an account exists for that email, a verification link will arrive shortly.",
        }, 202);
      }

      const verificationUrl = `${supabaseUrl}/functions/v1/account-deletion?token=${token}`;
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: resendFrom,
          to: [email],
          subject: "Verify your MTAA SERVICES account deletion request",
          html: `<p>We received a request to permanently delete your MTAA SERVICES account and associated personal information.</p><p><a href="${verificationUrl}">Verify and review your account deletion request</a></p><p>This link expires in 15 minutes. Your account will not be deleted unless you open the link and confirm. If you did not make this request, you can ignore this email.</p><p>Questions? Contact <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>`,
        }),
      });
      if (!emailResponse.ok) {
        await admin.from("account_deletion_requests")
          .delete()
          .eq("user_id", data.user.id)
          .eq("token_hash", tokenHash);
        console.error("Deletion verification email could not be delivered", emailResponse.status);
        return jsonResponse({ error: "We could not send the verification email. Please try again later." }, 503);
      }

      return jsonResponse({
        message: "If an account exists for that email, a verification link will arrive shortly.",
      }, 202);
    }

    if (payload?.action === "confirm") {
      const token = typeof payload.token === "string" ? payload.token : "";
      if (!/^[0-9a-f]{64}$/.test(token)) {
        return jsonResponse({ error: "This verification link is invalid or expired. Request a new one." }, 400);
      }

      const tokenHash = await hashToken(token);
      const { data: userId, error: claimError } = await admin.rpc(
        "claim_account_deletion_request",
        { p_token_hash: tokenHash },
      );
      if (claimError) throw claimError;
      if (typeof userId !== "string") {
        return jsonResponse({ error: "This verification link is invalid or expired. Request a new one." }, 400);
      }

      await deleteAccount(admin, userId);
      return jsonResponse({ deleted: true });
    }

    if (payload?.action === "delete") {
      const authorization = request.headers.get("Authorization");
      const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
      if (!token) return jsonResponse({ error: "Sign in to delete your account." }, 401);

      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) return jsonResponse({ error: "Your session has expired. Sign in again and retry." }, 401);

      await deleteAccount(admin, data.user.id);
      return jsonResponse({ deleted: true });
    }

    return jsonResponse({ error: "Unknown account deletion action." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("active dispute")) {
      return jsonResponse({ error: accountDeletionMessage(message) }, 409);
    }
    console.error("Account deletion request failed", message.slice(0, 300));
    return jsonResponse({ error: accountDeletionMessage(message) }, 500);
  }
});
