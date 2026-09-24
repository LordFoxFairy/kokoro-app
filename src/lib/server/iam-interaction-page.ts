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
.auth-page { display: grid; grid-template-columns: minmax(18rem, 42%) minmax(0, 1fr); min-height: 100vh; min-height: 100dvh; }
.brand-panel { display: flex; flex-direction: column; min-width: 0; padding: clamp(1.5rem, 4vw, 3.5rem); overflow: hidden; background: color-mix(in srgb, var(--primary) 12%, var(--background)); border-right: 1px solid var(--border); }
.brand { display: inline-flex; align-items: center; align-self: flex-start; gap: .75rem; color: var(--foreground); font-family: Georgia, Cambria, ui-serif, serif; font-size: 1.25rem; font-weight: 700; letter-spacing: -.025em; }
.brand svg { width: 1.7rem; height: 1.7rem; color: var(--primary); }
.brand-art { display: grid; place-items: center; align-self: center; width: min(18rem, 70%); aspect-ratio: 1; margin: auto 0; border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent); border-radius: 50%; background: color-mix(in srgb, var(--card) 60%, transparent); }
.brand-art svg { width: 38%; height: 38%; color: var(--primary); }
.interaction { display: flex; align-items: center; justify-content: center; min-width: 0; padding: clamp(2.5rem, 7vw, 7rem); background: var(--card); }
.content { width: min(100%, 28rem); }
h1 { margin: 0; font-family: Georgia, Cambria, ui-serif, serif; font-size: clamp(2.5rem, 4.2vw, 3.75rem); line-height: 1.16; letter-spacing: -.055em; text-wrap: balance; }
.lead { margin: 1.25rem 0 0; color: var(--muted-foreground); font-size: 1rem; line-height: 1.6; }
.auth-form { display: grid; gap: 1.25rem; margin-top: 2.25rem; }
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
@media (max-width: 720px) {
  .auth-page { display: flex; flex-direction: column; }
  .brand-panel { flex: 0 0 auto; height: 5.5rem; padding: 1.5rem clamp(1.5rem, 7vw, 3rem); border-right: 0; background: var(--card); }
  .brand-art { display: none; }
  .interaction { flex: 1; align-items: flex-start; justify-content: flex-start; padding: clamp(3rem, 9dvh, 5rem) clamp(1.5rem, 7vw, 3rem) clamp(4rem, 10dvh, 7rem); }
  .content { width: min(100%, 32rem); }
  h1 { font-size: clamp(2.25rem, 8vw, 3.25rem); }
  .actions button { flex: 1 1 10rem; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto; } }
`

const WAVE_MARK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2"/></svg>`

function escapeText(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character)
}

export function iamInteractionDocument(input: Readonly<{
  title: string
  heading: string
  description: string
  trustedFormHtml: string
}>): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeText(input.title)} · Kokoro</title><style>${PAGE_STYLE}</style></head><body><main class="auth-page"><section class="brand-panel" aria-label="Kokoro"><div class="brand">${WAVE_MARK}<span>Kokoro</span></div><div class="brand-art" aria-hidden="true">${WAVE_MARK}</div></section><section class="interaction" aria-labelledby="interaction-heading"><div class="content"><h1 id="interaction-heading">${escapeText(input.heading)}</h1><p class="lead">${escapeText(input.description)}</p>${input.trustedFormHtml}</div></section></main></body></html>`
}
