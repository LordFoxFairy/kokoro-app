/** Shared, script-free HTML shell for the three Web-owned IAM interaction GET pages. */
const PAGE_STYLE = `
:root {
  --background: #f7f9fc;
  --foreground: #0f1729;
  --card: #ffffff;
  --primary: #3b6cf6;
  --primary-foreground: #ffffff;
  --muted-foreground: #667085;
  --border: #e4e8f0;
  --input: #e4e8f0;
  --ring: #91a9ff;
  --radius: 0.75rem;
  color-scheme: light;
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --background: #0d1117;
    --foreground: #e6e9f0;
    --card: #161b24;
    --primary: #6b8dff;
    --primary-foreground: #0d1117;
    --muted-foreground: #a4acba;
    --border: #262d3a;
    --input: #414b5b;
    --ring: #6b8dff;
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
html { min-width: 280px; background: var(--card); }
body { margin: 0; color: var(--foreground); }
.auth-page { display: flex; flex-direction: column; min-height: 100vh; min-height: 100dvh; }
.brand-panel { width: min(100% - 3rem, 26rem); margin: 0 auto; padding: clamp(1.5rem, 5vh, 2.5rem) 0; }
.brand { display: inline-flex; align-items: center; gap: .65rem; color: var(--foreground); font-size: 1.125rem; font-weight: 700; letter-spacing: -.025em; }
.brand svg { width: 1.5rem; height: 1.5rem; color: var(--primary); }
.interaction { display: flex; flex: 1; align-items: center; justify-content: center; min-width: 0; padding: 2rem 1.5rem 6rem; }
.content { width: min(100%, 26rem); }
h1 { margin: 0; font-size: clamp(2rem, 5vw, 2.75rem); font-weight: 700; line-height: 1.2; letter-spacing: -.04em; text-wrap: balance; }
.lead { margin: 1.25rem 0 0; color: var(--muted-foreground); font-size: 1rem; line-height: 1.6; }
.auth-form { display: grid; gap: 1.25rem; margin-top: 2.25rem; }
.form-error { margin: 0; padding: .8rem 1rem; border: 1px solid color-mix(in srgb, #b42318 32%, var(--border)); border-radius: calc(var(--radius) * .8); color: #b42318; line-height: 1.5; }
.field { display: grid; gap: .55rem; color: var(--foreground); font-size: .9rem; font-weight: 600; }
.field input, .field select { display: block; width: 100%; min-height: 3rem; padding: .7rem .85rem; border: 1px solid var(--input); border-radius: calc(var(--radius) * .8); background: var(--card); color: var(--foreground); font: inherit; font-weight: 400; }
.field input:focus-visible, .field select:focus-visible, button:focus-visible { outline: 3px solid var(--ring); outline-offset: 2px; }
.actions { display: flex; flex-wrap: wrap; gap: .75rem; margin-top: .5rem; }
.actions.single button { width: 100%; }
button { min-height: 3rem; padding: .7rem 1.5rem; border: 1px solid var(--primary); border-radius: calc(var(--radius) * .8); background: var(--primary); color: var(--primary-foreground); font: inherit; font-size: .9rem; font-weight: 600; cursor: pointer; }
button:hover { filter: brightness(.95); }
button.secondary { border-color: var(--border); background: var(--card); color: var(--foreground); }
.scope-list { display: grid; gap: .65rem; margin: 2rem 0 0; padding: 0; list-style: none; }
.scope-list li { padding: .8rem 1rem; border: 1px solid var(--border); border-radius: calc(var(--radius) * .8); overflow-wrap: anywhere; }
.empty { margin: 0; color: var(--muted-foreground); line-height: 1.6; }
@media (prefers-color-scheme: dark) { .form-error { color: #ffaaa4; } }
@media (max-width: 720px) {
  .brand-panel { padding: 1.5rem 0; }
  .interaction { align-items: flex-start; padding-top: clamp(3rem, 9dvh, 5rem); padding-bottom: 4rem; }
  .actions button { flex: 1 1 10rem; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto; } }
`

const WAVE_MARK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2"/></svg>`

const COMPACT_INVITATION_STYLE = `
html { background: var(--background); }
.auth-page { display: grid; align-content: center; justify-items: center; gap: 1.25rem; padding: 2.5rem 1rem; }
.brand-panel { width: min(100%, 27rem); margin: 0; padding: 0 .25rem; }
.interaction { display: block; flex: none; width: min(100%, 27rem); min-width: 0; padding: 0; }
.content { width: 100%; padding: clamp(1.5rem, 5vw, 2rem); border: 1px solid var(--border); border-radius: calc(var(--radius) * 1.25); background: var(--card); box-shadow: 0 8px 28px -18px color-mix(in srgb, var(--foreground) 20%, transparent); }
h1 { font-size: clamp(1.65rem, 4vw, 2rem); }
.lead { margin-top: .7rem; font-size: .925rem; }
.auth-form { gap: 1rem; margin-top: 1.5rem; }
.invitation-register { margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid var(--border); }
.invitation-register summary { color: var(--primary); font-size: .9rem; font-weight: 600; cursor: pointer; }
.invitation-register summary:focus-visible { outline: 3px solid var(--ring); outline-offset: 3px; }
.invitation-register .auth-form { margin-top: 1.25rem; }
.invitation-subheading { margin: 1.5rem 0 .25rem; font-size: 1rem; }
@media (max-width: 720px) { .auth-page { align-content: start; padding: 1.5rem 1rem 2rem; } .content { padding: 1.5rem; } }
`

// Signed IAM login remains a Route Handler because its GET must issue a
// cookie-bound, one-time CSRF proof. This visual bridge follows the existing
// shadcn Card/Input/Button tokens without claiming to import React components.
const SIGN_IN_STYLE = `
html { background: var(--background); }
.sign-in-page { display: grid; align-content: center; justify-items: center; gap: 1.25rem; padding: 2rem 1rem; }
.sign-in-page .brand-panel { width: min(100%, 27rem); margin: 0; padding: 0 .25rem; }
.sign-in-page .interaction { display: block; flex: none; width: min(100%, 27rem); padding: 0; }
.sign-in-page .content { width: 100%; padding: 2rem; border: 1px solid var(--border); border-radius: calc(var(--radius) * 1.25); background: var(--card); box-shadow: 0 8px 28px -18px color-mix(in srgb, var(--foreground) 20%, transparent); }
.sign-in-page h1 { font-size: clamp(1.65rem, 4vw, 2rem); }
.sign-in-page .lead { margin-top: .65rem; font-size: .925rem; }
.sign-in-page .auth-form { gap: 1rem; margin-top: 1.5rem; }
.sign-in-page .field { gap: .6rem; }
.sign-in-page .field input { min-height: 2.75rem; padding: .65rem .8rem; border-radius: calc(var(--radius) * .8); }
.sign-in-page .actions { margin-top: .25rem; }
.sign-in-page button { min-height: 2.75rem; }
@media (max-width: 720px) { .sign-in-page { align-content: start; padding: 1.5rem 1rem 2rem; } .sign-in-page .content { padding: 1.5rem; } }
`

function escapeText(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character)
}

export function iamInteractionDocument(input: Readonly<{
  title: string
  heading: string
  description: string
  trustedFormHtml: string
  variant?: "compact-invitation" | "sign-in"
}>): string {
  const style = input.variant === "compact-invitation" ? `${PAGE_STYLE}\n${COMPACT_INVITATION_STYLE}` :
    input.variant === "sign-in" ? `${PAGE_STYLE}\n${SIGN_IN_STYLE}` : PAGE_STYLE
  const lang = input.variant === "compact-invitation" ? "zh-CN" : "en"
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeText(input.title)} · Kokoro</title><style>${style}</style></head><body><main class="auth-page${input.variant === "sign-in" ? " sign-in-page" : ""}"><header class="brand-panel"><div class="brand">${WAVE_MARK}<span>Kokoro</span></div></header><section class="interaction" aria-labelledby="interaction-heading"><div class="content"><h1 id="interaction-heading">${escapeText(input.heading)}</h1><p class="lead">${escapeText(input.description)}</p>${input.trustedFormHtml}</div></section></main></body></html>`
}
