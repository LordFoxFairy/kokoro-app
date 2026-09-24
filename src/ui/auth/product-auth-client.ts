"use client";

function checkNotCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Sign-in cancelled", "AbortError");
}

async function currentCsrf(signal?: AbortSignal): Promise<string> {
  checkNotCancelled(signal);
  const response = await fetch("/api/auth/csrf", { cache: "no-store", ...(signal ? { signal } : {}) });
  checkNotCancelled(signal);
  const raw: unknown = response.ok
    ? await response.json().catch(() => null)
    : null;
  checkNotCancelled(signal);
  const token =
    typeof raw === "object" && raw !== null
      ? (raw as { csrfToken?: unknown }).csrfToken
      : null;
  if (typeof token !== "string" || !/^[A-Za-z0-9]+$/u.test(token))
    throw new Error("Product authentication unavailable");
  return token;
}

export async function beginProductSignIn(signal?: AbortSignal): Promise<void> {
  checkNotCancelled(signal);
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/api/auth/signin/kokoro-iam";
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "csrfToken";
  input.value = await currentCsrf(signal);
  checkNotCancelled(signal);
  form.append(input);
  document.body.append(form);
  form.submit();
}

export async function endProductSession(
  navigate: (url: string) => void = (url) => window.location.assign(url),
): Promise<void> {
  const response = await fetch("/api/auth/signout", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: await currentCsrf() }),
  });
  const raw: unknown = await response.json().catch(() => null);
  const url =
    typeof raw === "object" && raw !== null
      ? (raw as { issuer_end_session_url?: unknown }).issuer_end_session_url
      : null;
  if (
    (response.ok || response.status === 503) &&
    typeof url === "string" &&
    url.startsWith("/iam/oauth2/end-session?")
  ) {
    navigate(url);
    return;
  }
  if (response.ok) navigate("/");
  else throw new Error("Product sign-out unavailable");
}
