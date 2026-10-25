"use client";
/* eslint-disable @next/next/no-img-element -- Short-lived capabilities must not enter the image optimizer cache. */
import { useId, useRef, useState } from "react";
import { ChevronDown, ImagePlus, Link2 } from "lucide-react";
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

/** The same picker is used by original API/MCP forms, never a connector creation shortcut. */
export function McpIconPicker({ draft, state, current, disabled = false }: { draft: McpIconDraft; state: McpIconDraftSnapshot; current?: McpIconBinding | undefined; disabled?: boolean }) {
  const t = useT(), id = useId(), file = useRef<HTMLInputElement>(null);
  const [urlOpen, setUrlOpen] = useState(false), [url, setUrl] = useState("");
  const locked = disabled || !draft.available || state.kind === "running" || state.kind === "unknown";
  const preview = state.clear ? undefined : state.preview?.url ?? current?.preview_reference?.url;
  const imageUrlValid = mcpIconInputs.importIcon.safeParse({ image_url: url }).success;
  return <div className={styles.field}>
    <span className={styles.label}>图标</span>
    <div className={styles.row}>
      <span className={styles.preview}>{preview ? <img src={preview} alt="连接器图标" crossOrigin="anonymous" referrerPolicy="no-referrer" /> : <ImagePlus aria-hidden="true" />}</span>
      <div className={styles.copy}>
        <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" className={styles.upload} disabled={locked} aria-busy={state.kind === "running"}>上传<ChevronDown aria-hidden="true" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start"><DropdownMenuItem onSelect={() => file.current?.click()}>从设备上传</DropdownMenuItem><DropdownMenuItem onSelect={() => { setUrl(""); setUrlOpen(true); }}>粘贴图片 URL</DropdownMenuItem>{preview || state.dirty || current ? <DropdownMenuItem onSelect={() => void draft.remove()}>移除图片</DropdownMenuItem> : null}</DropdownMenuContent>
        </DropdownMenu>
        <span>PNG 或 JPG，最大 1 MB。推荐尺寸 256×256 像素。</span>
      </div>
    </div>
    <input ref={file} className={styles.file} type="file" accept="image/png,image/jpeg" aria-label="从设备上传图标" disabled={locked} onChange={event => { const selected = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (selected && !locked) void draft.chooseFile(selected); }} />
    {state.kind === "unknown" || state.kind === "error" ? <div className={styles.failure} role="alert"><span>{state.failure === "file" ? "请选择不超过 1 MB 的 PNG 或 JPG 图片，文件名需有效。" : state.failure === "expired" ? "图片暂存已过期，请重新选择。" : t(connectorCommandFailureMessage(state.recovery, "mcp.actionFailed"))}</span>{state.mayRetry ? <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => void draft.retry()}>{t("mcp.retryOriginal")}</Button> : null}</div> : null}
    <Dialog open={urlOpen} onOpenChange={setUrlOpen}><DialogContent className={styles.urlDialog} showCloseButton={false}>
      <DialogHeader><DialogTitle className={styles.title}>通过 URL 添加图片</DialogTitle></DialogHeader>
      <div className={styles.urlField}><label htmlFor={id}>图标 URL</label><div className={styles.urlInput}><Link2 aria-hidden="true" /><Input id={id} placeholder="https://" autoComplete="off" value={url} onChange={event => setUrl(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && imageUrlValid && !locked) { event.preventDefault(); setUrlOpen(false); void draft.chooseUrl(url); } }} /></div></div>
      <footer><Button type="button" variant="outline" onClick={() => setUrlOpen(false)}>取消</Button><Button type="button" disabled={!imageUrlValid || locked} onClick={() => { setUrlOpen(false); void draft.chooseUrl(url); }}>添加</Button></footer>
    </DialogContent></Dialog>
  </div>;
}
