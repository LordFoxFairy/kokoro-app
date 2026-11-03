"use client";
/* eslint-disable @next/next/no-img-element -- Short-lived capabilities must not enter the image optimizer cache. */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, Image as ImageIcon, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { McpIconBinding } from "@/hub/mcp-icon.schema";
import { mcpIconInputs } from "@/hub/mcp-icon.schema";
import { useT } from "@/i18n/context";
import { connectorCommandFailureMessage } from "./connector-command-failure";
import type { McpIconDraft, McpIconDraftSnapshot } from "./mcp-icon-draft";
import styles from "./mcp-icon-picker.module.css";

/** Display-only primitives: never a binding, selector, save input or renewed capability. */
export type McpIconPreviewDisplay = Readonly<{ url: string; expiresAt: number }>;

/** The same picker is used by original API/MCP forms, never a connector creation shortcut. */
export function McpIconPicker({ draft, state, current, disabled = false, displayFallback, onPreviewLoaded }: {
  draft: McpIconDraft; state: McpIconDraftSnapshot; current?: McpIconBinding | undefined; disabled?: boolean;
  /** Explicit null masks a retired post-save presentation, including retained draft preview. */
  displayFallback?: McpIconPreviewDisplay | null | undefined;
  onPreviewLoaded?: ((preview: McpIconPreviewDisplay, loaded: boolean) => void) | undefined;
}) {
  const t = useT(), id = useId(), file = useRef<HTMLInputElement>(null);
  const upload = useRef<HTMLButtonElement>(null);
  const urlReturnFocus = useRef<{ trigger: HTMLButtonElement | null; draft: McpIconDraft } | null>(null);
  const [urlOpen, setUrlOpen] = useState(false), [url, setUrl] = useState("");
  const locked = disabled || !draft.available || state.kind === "running" || state.kind === "unknown";
  useLayoutEffect(() => {
    if (locked || urlReturnFocus.current?.draft !== draft) urlReturnFocus.current = null;
  }, [draft, locked]);
  const reference = state.preview ?? current?.preview_reference;
  const referenceExpiry = reference ? Date.parse(reference.expires_at) : Number.NaN;
  const referenceDisplay = reference?.method === "GET" && Object.keys(reference.required_headers).length === 0 && Number.isFinite(referenceExpiry)
    ? { url: reference.url, expiresAt: referenceExpiry } : null;
  const preview = state.clear ? null : displayFallback !== undefined ? displayFallback : referenceDisplay;
  const imageUrlValid = mcpIconInputs.importIcon.safeParse({ image_url: url }).success;
  return <div className={styles.field}>
    <span className={styles.label}>{t("mcp.iconLabel")}</span>
    <div className={styles.row}>
      <span className={styles.preview}>{preview ? <IconPreview key={`${preview.url}\0${preview.expiresAt}`} preview={preview} onPreviewLoaded={onPreviewLoaded} /> : <ImageIcon aria-hidden="true" />}</span>
      <div className={styles.copy}>
        <DropdownMenu><DropdownMenuTrigger asChild><Button ref={upload} type="button" variant="outline" className={styles.upload} disabled={locked} aria-busy={state.kind === "running"}>{t("connectorCatalog.upload")}<ChevronDown aria-hidden="true" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start"><DropdownMenuItem onSelect={() => file.current?.click()}>{t("mcp.iconUploadDevice")}</DropdownMenuItem><DropdownMenuItem onSelect={() => { urlReturnFocus.current = { trigger: upload.current, draft }; setUrl(""); setUrlOpen(true); }}>{t("mcp.iconPasteUrl")}</DropdownMenuItem>{preview || state.dirty || current ? <DropdownMenuItem onSelect={() => void draft.remove()}>{t("mcp.iconRemove")}</DropdownMenuItem> : null}</DropdownMenuContent>
        </DropdownMenu>
        <span>{t("mcp.iconHint")}</span>
      </div>
    </div>
    <input ref={file} className={styles.file} type="file" accept="image/png,image/jpeg" aria-label={t("mcp.iconFileLabel")} disabled={locked} onChange={event => { const selected = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (selected && !locked) void draft.chooseFile(selected); }} />
    {state.kind === "unknown" || state.kind === "error" ? <div className={styles.failure} role="alert"><span>{state.failure === "file" ? t("mcp.iconFileError") : state.failure === "expired" ? t("mcp.iconExpired") : t(connectorCommandFailureMessage(state.recovery, "mcp.actionFailed"))}</span>{state.mayRetry ? <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => void draft.retry()}>{t("mcp.retryOriginal")}</Button> : null}</div> : null}
    <Dialog open={urlOpen} onOpenChange={setUrlOpen}><DialogContent className={styles.urlDialog} showCloseButton={false}
      onCloseAutoFocus={event => {
        event.preventDefault();
        const target = urlReturnFocus.current;
        urlReturnFocus.current = null;
        if (!locked && target?.draft === draft && target.trigger === upload.current && target.trigger?.isConnected && !target.trigger.disabled)
          target.trigger.focus({ preventScroll: true });
      }}>
      <DialogHeader><DialogTitle className={styles.title}>{t("mcp.iconUrlTitle")}</DialogTitle></DialogHeader>
      <div className={styles.urlField}><label htmlFor={id}>{t("mcp.iconUrlLabel")}</label><div className={styles.urlInput}><Link2 aria-hidden="true" /><Input id={id} placeholder="https://" autoComplete="off" value={url} onChange={event => setUrl(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && imageUrlValid && !locked) { event.preventDefault(); setUrlOpen(false); void draft.chooseUrl(url); } }} /></div></div>
      <footer><Button type="button" variant="outline" onClick={() => setUrlOpen(false)}>{t("mcp.cancel")}</Button><Button type="button" disabled={!imageUrlValid || locked} onClick={() => { setUrlOpen(false); void draft.chooseUrl(url); }}>{t("mcp.iconUrlAdd")}</Button></footer>
    </DialogContent></Dialog>
  </div>;
}


/** A reference owns its clock/failure lifetime; a new pair never borrows an older clock. */
function IconPreview({ preview, onPreviewLoaded }: {
  preview: McpIconPreviewDisplay;
  onPreviewLoaded?: ((preview: McpIconPreviewDisplay, loaded: boolean) => void) | undefined;
}) {
  const t = useT();
  const { url, expiresAt } = preview;
  const [clock, setClock] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!Number.isFinite(expiresAt) || expiresAt <= clock || failed) return;
    const timer = setTimeout(() => setClock(Date.now()), Math.max(0, Math.min(expiresAt - Date.now(), 2_147_483_647)));
    return () => clearTimeout(timer);
  }, [expiresAt, clock, failed]);
  if (!Number.isFinite(expiresAt) || expiresAt <= clock || failed) return <ImageIcon aria-hidden="true" />;
  return <img src={url} alt={t("mcp.iconAlt")} crossOrigin="anonymous" referrerPolicy="no-referrer"
    onLoad={event => {
      if (event.currentTarget.isConnected && event.currentTarget.currentSrc === event.currentTarget.src && event.currentTarget.naturalWidth > 0)
        onPreviewLoaded?.(preview, true);
    }} onError={event => {
      if (!event.currentTarget.isConnected) return;
      setFailed(true); onPreviewLoaded?.(preview, false);
    }} />;
}
