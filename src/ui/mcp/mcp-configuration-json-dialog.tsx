"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { McpPrivateServer } from "@/hub/mcp-connector.schema";
import { parseConfigurationJson, type McpConfigurationJsonFields } from "./mcp-configuration-json";
import styles from "./custom-mcp-detail-dialog.module.css";

/** An inner editor; closing it never dismisses or cancels the outer configuration. */
export function McpConfigurationJsonDialog({ initialJson, transport, locked, status, isCurrent, onSave, onClose, returnFocusRef }: {
  initialJson: string; transport: McpPrivateServer["transport"]; locked: boolean; status: ReactNode;
  isCurrent: () => boolean; onSave: (fields: McpConfigurationJsonFields) => void; onClose: () => void; returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const [text, setText] = useState(initialJson);
  const [error, setError] = useState<string | null>(null);
  const helpId = useId();
  const [copyState, setCopyState] = useState<"idle" | "pending" | "copied" | "failed">("idle");
  const live = useRef<object | null>(null);
  const copying = useRef(false);
  useLayoutEffect(() => {
    const lease = {}; live.current = lease;
    return () => { if (live.current === lease) live.current = null; };
  }, [locked, text]);
  const copy = async () => {
    const lease = live.current;
    if (!lease || locked || copying.current || !isCurrent()) return;
    copying.current = true; setCopyState("pending");
    try {
      if (!navigator.clipboard?.writeText) throw Error("clipboard_unavailable");
      await navigator.clipboard.writeText(text);
      if (live.current === lease && isCurrent()) setCopyState("copied");
    } catch {
      if (live.current === lease && isCurrent()) setCopyState("failed");
    } finally {
      copying.current = false;
      if (live.current && live.current !== lease) setCopyState("idle");
    }
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className={styles.jsonDialog} overlayClassName={styles.overlay ?? ""} closeLabel="取消"
      onEscapeKeyDown={event => event.stopPropagation()}
      onCloseAutoFocus={event => { event.preventDefault(); const target = returnFocusRef.current; if (target?.isConnected && !target.disabled) target.focus({ preventScroll: true }); }}>
      <form className={styles.jsonForm} onSubmit={event => {
        event.preventDefault(); event.stopPropagation();
        if (locked) return;
        try { const fields = parseConfigurationJson(text, transport); setError(null); onSave(fields); }
        catch (failure) { setError(failure instanceof Error ? failure.message : "配置格式无效。"); }
      }}>
        <DialogTitle className={styles.jsonTitle}>编辑配置 JSON</DialogTitle>
        <DialogDescription className={styles.jsonDescription}>请粘贴您的配置 JSON</DialogDescription>
        <p id={helpId} className="sr-only">已保存的 Header 密钥不会显示；省略 headers 保留原绑定。传输类型不可修改。复制仅包含当前输入，不会保存配置。</p>
        <Textarea autoFocus aria-label="MCP 配置 JSON" aria-describedby={helpId} aria-invalid={error !== null} readOnly={locked} value={text}
          onChange={event => { if (!locked) { setText(event.target.value); setError(null); setCopyState(current => current === "pending" ? "pending" : "idle"); } }} />
        <div className={styles.jsonFeedback}>{error ? <p role="alert">{error}</p> : null}{copyState === "failed" ? <p role="alert">复制失败，请重试。</p> : null}{copyState === "copied" ? <p role="status">已复制到剪贴板</p> : null}{status}</div>
        <footer className={styles.jsonActions}><Button type="button" variant="outline" disabled={locked || copyState === "pending"} onClick={() => void copy()}>复制到剪贴板</Button><Button type="submit" disabled={locked}>保存</Button></footer>
      </form>
    </DialogContent>
  </Dialog>;
}
