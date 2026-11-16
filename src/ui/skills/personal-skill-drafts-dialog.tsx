"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { HubClientError } from "@/hub/client";
import { createSkillPublishClient, type SkillPublishClient } from "@/hub/skill-publish-client";
import { SKILL_CATEGORY_KEYS, updateSkillDraftRequestSchema, type ManagedPersonalSkill, type UpdateSkillDraftAck, type UpdateSkillDraftRequest } from "@/hub/schemas";
import { useT } from "@/i18n/context";
import type { MessageKey } from "@/i18n/messages";
import type { ProjectReadBoundary } from "@/ui/auth/use-session-state";
type Client = Pick<SkillPublishClient, "listDrafts" | "getManaged" | "updateDraft">;
type Metadata = UpdateSkillDraftRequest["metadata"] & {
    example_prompts: string[];
    category_keys: Array<typeof SKILL_CATEGORY_KEYS[number]>;
};
type Phase = "editing" | "saving" | "unknown" | "confirmed" | "conflict" | "invalid" | "saved" | "changed";
type Intent = {
    id: string;
    key: string;
    body: UpdateSkillDraftRequest;
    uncertain: boolean;
    rejected: boolean;
    ack?: UpdateSkillDraftAck;
};
const categoryLabels: Record<typeof SKILL_CATEGORY_KEYS[number], MessageKey> = {
    programming: "skills.categoryCoding", data: "skills.categoryData", automation: "skills.categoryAutomation", business: "skills.categoryBusiness",
    design: "skills.categoryDesign", media: "skills.categoryMedia", content: "skills.categoryContent", apps: "skills.categoryApps",
};
const metadataOf = (skill: ManagedPersonalSkill): Metadata => ({
    display_name: skill.name,
    summary: skill.summary,
    tags: [...skill.tags],
    example_prompts: [...skill.example_prompts],
    category_keys: [...skill.category_keys],
});
const phaseMessages: Record<Exclude<Phase, "editing">, MessageKey> = {
    saving: "skills.loading",
    unknown: "skills.personal.unknown",
    confirmed: "skills.personal.confirmed",
    conflict: "skills.personal.conflict",
    invalid: "skills.draft.invalid",
    saved: "skills.draft.saved",
    changed: "skills.draft.changed",
};
function requireDraft(skill: ManagedPersonalSkill, id: string): void {
    if (skill.skill_id !== id || skill.source_ref !== `skill:${id}` || skill.status !== "draft")
        throw new Error("Current owned draft does not match the selected resource");
}
/** One actor-owned window; only an explicit original command can recover an unknown write. */
export function PersonalSkillDraftsDialog({ boundary, open, onOpenChange, returnFocusRef, client: suppliedClient }: {
    boundary: ProjectReadBoundary;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    returnFocusRef?: RefObject<HTMLElement | null>;
    client?: Client;
}) {
    const t = useT();
    const [defaultClient] = useState(createSkillPublishClient);
    const client = suppliedClient ?? defaultClient;
    const admitted = boundary.admitted && boundary.subject !== null;
    const scope = useMemo(() => ({
        open, admitted, client,
        subject: boundary.subject,
        tenant: boundary.tenant,
        generation: boundary.generation,
        hint: boundary.authInvalidationHint,
    }), [open, admitted, client, boundary.subject, boundary.tenant, boundary.generation, boundary.authInvalidationHint]);
    const currentScope = useRef<typeof scope | null>(null);
    const flight = useRef<AbortController | null>(null);
    const flightKind = useRef<"read" | "write">("read");
    const intent = useRef<Intent | null>(null);
    const [pending, setPending] = useState(false);
    const [acknowledged, setAcknowledged] = useState(false);
    const adoptNextRead = useRef(false);
    const [lastFlight, setLastFlight] = useState<AbortController | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [base, setBase] = useState<ManagedPersonalSkill | null>(null);
    const [metadata, setMetadata] = useState<Metadata | null>(null);
    const [phase, setPhase] = useState<Phase>("editing");
    const [gate, setGate] = useState<typeof scope | null>(null);
    const [readError, setReadError] = useState(false);
    const [readAttempt, setReadAttempt] = useState(0);
    const [cursor, setCursor] = useState<string | undefined>();
    const [history, setHistory] = useState<Array<string | undefined>>([]);
    const [page, setPage] = useState<{
        scope: typeof scope;
        cursor: string | undefined;
        value: Awaited<ReturnType<Client["listDrafts"]>>;
    } | null>(null);
    useLayoutEffect(() => {
        currentScope.current = scope;
        return () => {
            currentScope.current = null;
            if (flight.current && flightKind.current === "write" && intent.current && !intent.current.ack)
                intent.current = { ...intent.current, uncertain: true };
            flight.current?.abort();
            flight.current = null;
        };
    }, [scope]);
    useEffect(() => {
        if (!open || !admitted)
            return;
        const controller = new AbortController();
        flight.current = controller;
        flightKind.current = "read";
        const current = () => currentScope.current === scope && flight.current === controller && !controller.signal.aborted;
        void (async () => {
            try {
                if (selected === null) {
                    const value = await client.listDrafts(cursor, controller.signal);
                    if (!current())
                        return;
                    if (
                        value.skills.some(skill => skill.status !== "draft") ||
                        new Set(value.skills.map(skill => skill.skill_id)).size !== value.skills.length ||
                        value.next_cursor !== null && (value.next_cursor === cursor || history.includes(value.next_cursor))
                    )
                        throw new Error("Invalid draft page");
                    setPage({ scope, cursor, value });
                    setReadError(false);
                }
                else {
                    const skill = await client.getManaged(selected, controller.signal);
                    if (!current())
                        return;
                    requireDraft(skill, selected);
                    setGate(scope);
                    setReadError(false);
                    // An admission recheck gates the old form; it never silently rewrites its CAS or unknown command.
                    if (adoptNextRead.current && (!intent.current || intent.current.ack || intent.current.rejected)) {
                        const original = intent.current;
                        if (original?.ack && BigInt(skill.product.state_version) < BigInt(original.ack.skill.product.state_version))
                            throw new Error("Draft read regressed behind its ACK");
                        adoptNextRead.current = false;
                        let result: Phase = "editing";
                        if (original?.ack) {
                            result = skill.product.state_version === original.ack.skill.product.state_version ? "saved" : "changed";
                        }
                        setBase(skill);
                        setMetadata(metadataOf(skill));
                        intent.current = null;
                        setPending(false);
                        setAcknowledged(false);
                        setPhase(result);
                    }
                }
            }
            catch {
                if (current()) {
                    setReadError(true);
                    setGate(null);
                }
            }
            finally {
                if (flight.current === controller)
                    flight.current = null;
            }
        })();
        return () => { controller.abort(); if (flight.current === controller)
            flight.current = null; };
    }, [open, admitted, scope, selected, cursor, history, readAttempt, client]);
    const visiblePhase = phase === "saving" && lastFlight?.signal.aborted ? acknowledged ? "confirmed" : "unknown" : phase;
    const ready = open && admitted && gate === scope && base !== null && metadata !== null;
    const locked = !ready || ["saving", "unknown", "confirmed", "conflict"].includes(visiblePhase);
    const pageValue = page?.scope === scope && page.cursor === cursor ? page.value : null;
    const close = () => {
        if (flight.current && flightKind.current === "write" && intent.current && !intent.current.ack)
            intent.current = { ...intent.current, uncertain: true };
        flight.current?.abort();
        flight.current = null;
        if (phase === "saving")
            setPhase(intent.current?.ack ? "confirmed" : "unknown");
        onOpenChange(false);
    };
    const reload = () => {
        if (flight.current)
            return;
        adoptNextRead.current = true;
        setReadError(false);
        setGate(null);
        setReadAttempt(value => value + 1);
    };
    const select = (id: string) => {
        if (flight.current || intent.current)
            return;
        adoptNextRead.current = true;
        setSelected(id);
        setBase(null);
        setMetadata(null);
        setGate(null);
        setReadError(false);
        setPhase("editing");
    };
    const save = async () => {
        if (!ready || flight.current || !base || !metadata)
            return;
        let original = intent.current;
        if (original?.ack || original?.rejected)
            return;
        if (!original) {
            const parsed = updateSkillDraftRequestSchema.safeParse({ expected_state_version: base.product.state_version, metadata });
            if (!parsed.success) {
                setPhase("invalid");
                return;
            }
            const body = structuredClone(parsed.data);
            Object.freeze(body.metadata.tags);
            Object.freeze(body.metadata.example_prompts);
            Object.freeze(body.metadata.category_keys);
            Object.freeze(body.metadata);
            Object.freeze(body);
            original = { id: base.skill_id, key: `draft_metadata_${crypto.randomUUID()}`, body, uncertain: false, rejected: false };
            intent.current = original;
            setPending(true);
            setAcknowledged(false);
        }
        const operation = original, controller = new AbortController();
        let acknowledgedResult: UpdateSkillDraftAck | undefined;
        flight.current = controller;
        flightKind.current = "write";
        setLastFlight(controller);
        setPhase("saving");
        const current = () => currentScope.current === scope && flight.current === controller && !controller.signal.aborted;
        try {
            const ack = await client.updateDraft(operation.id, operation.body, operation.key, controller.signal);
            if (!current())
                return;
            requireDraft(ack.skill, operation.id);
            if (BigInt(ack.skill.product.state_version) <= BigInt(operation.body.expected_state_version))
                throw new Error("Draft ACK did not advance its CAS");
            acknowledgedResult = ack;
            intent.current = { ...operation, ack };
            setAcknowledged(true);
            flightKind.current = "read";
            const fresh = await client.getManaged(operation.id, controller.signal);
            if (!current())
                return;
            requireDraft(fresh, operation.id);
            if (BigInt(fresh.product.state_version) < BigInt(ack.skill.product.state_version))
                throw new Error("Draft read regressed behind its ACK");
            setBase(fresh);
            setMetadata(metadataOf(fresh));
            intent.current = null;
            setPending(false);
            setAcknowledged(false);
            setPhase(fresh.product.state_version === ack.skill.product.state_version ? "saved" : "changed");
        }
        catch (error) {
            if (!current())
                return;
            if (error instanceof HubClientError && [401, 403, 404].includes(error.status ?? 0)) {
                setGate(null);
                setReadError(true);
            }
            if (acknowledgedResult)
                setPhase("confirmed");
            else if (
                !operation.uncertain && error instanceof HubClientError && error.reason === "http" && (
                    [400, 401, 403, 404, 412, 413].includes(error.status ?? 0) ||
                    error.status === 409 && error.code === "skill_idempotency_conflict"
                )
            ) {
                intent.current = { ...operation, rejected: true };
                setPhase("conflict");
            }
            else {
                intent.current = { ...operation, uncertain: true };
                setPhase("unknown");
            }
        }
        finally {
            if (flight.current === controller)
                flight.current = null;
        }
    };
    const change = (next: Metadata) => { if (!locked) {
        setMetadata(next);
        setPhase("editing");
    } };
    const restoreFocus = (event: Event) => { event.preventDefault(); if (admitted)
        returnFocusRef?.current?.focus(); };
    return (<Dialog open={open && admitted} onOpenChange={next => { if (!next)
        close(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto" closeLabel={t("skills.publishClose")} onCloseAutoFocus={restoreFocus}>
        <DialogTitle>{t("skills.draft.title")}</DialogTitle>
        <DialogDescription>{t("skills.publishDrafts")}</DialogDescription>
        {selected === null ? (<>
            {readError ? (<div role="alert">
                <p>{t("skills.loadError")}</p>
                <Button type="button" onClick={() => {
                    setReadError(false);
                    setReadAttempt(value => value + 1);
                }}>{t("skills.retry")}</Button>
              </div>) : !pageValue ? <p role="status">{t("skills.loading")}</p> : (<>
                {pageValue.skills.length === 0 ? <p>{t("skills.noMatch")}</p> : (<ul className="space-y-3">
                    {pageValue.skills.map(skill => (<li key={skill.skill_id} className="space-y-2 rounded-lg border p-3">
                        <h3 className="break-words font-medium">{skill.name}</h3>
                        <p className="break-words text-sm text-muted-foreground">{skill.summary}</p>
                        <Button type="button" variant="outline" onClick={() => select(skill.skill_id)}>
                          {t("skills.draft.edit")}
                        </Button>
                      </li>))}
                  </ul>)}
                <nav className="flex gap-2" aria-label={t("skills.publishDrafts")}>
                  <Button type="button" variant="outline" disabled={history.length === 0} onClick={() => {
                    setCursor(history.at(-1));
                    setHistory(value => value.slice(0, -1));
                    setReadError(false);
                }}>{t("plugins.previous")}</Button>
                  <Button type="button" variant="outline" disabled={pageValue.next_cursor === null} onClick={() => {
                    setHistory(value => [...value, cursor]);
                    setCursor(pageValue.next_cursor ?? undefined);
                    setReadError(false);
                }}>{t("plugins.next")}</Button>
                </nav>
              </>)}
          </>) : (<>
            {!ready ? (<div role={readError ? "alert" : "status"}>
                <p>{t(readError ? "skills.loadError" : "skills.loading")}</p>
                {readError ? <Button type="button" onClick={() => {
                        setReadError(false);
                        setReadAttempt(value => value + 1);
                    }}>{t("skills.retry")}</Button> : null}
              </div>) : (<form className="space-y-4" onSubmit={event => {
                    event.preventDefault();
                    void save();
                }}>
                <label className="block space-y-1 text-sm">
                  <span>{t("skills.publishName")}</span>
                  <Input value={metadata.display_name} disabled={locked} onChange={event => {
                    change({ ...metadata, display_name: event.target.value });
                }}/>
                </label>
                <label className="block space-y-1 text-sm">
                  <span>{t("skills.publishSummary")}</span>
                  <Textarea value={metadata.summary} disabled={locked} onChange={event => {
                    change({ ...metadata, summary: event.target.value });
                }}/>
                </label>
                <fieldset disabled={locked} className="space-y-2">
                  <legend className="text-sm font-medium">{t("skills.draft.tags")}</legend>
                  {metadata.tags.map((tag, index) => (<div key={index} className="flex items-start gap-2">
                      <Input aria-label={`${t("skills.draft.tags")} ${index + 1}`} value={tag} onChange={event => {
                        change({ ...metadata, tags: metadata.tags.map((value, position) => position === index ? event.target.value : value) });
                    }}/>
                      <Button type="button" variant="outline" aria-label={`${t("skills.draft.removeTag")} ${index + 1}`} onClick={() => {
                        change({ ...metadata, tags: metadata.tags.filter((_, position) => position !== index) });
                    }}>{t("skills.draft.removeTag")}</Button>
                    </div>))}
                  <Button type="button" variant="outline" disabled={metadata.tags.length >= 100} onClick={() => {
                    change({ ...metadata, tags: [...metadata.tags, ""] });
                }}>{t("skills.draft.addTag")}</Button>
                </fieldset>
                <fieldset disabled={locked} className="space-y-2">
                  <legend className="text-sm font-medium">{t("skills.draft.examples")}</legend>
                  {metadata.example_prompts.map((text, index) => (<div key={index} className="flex items-start gap-2">
                      <Textarea aria-label={`${t("skills.draft.examples")} ${index + 1}`} value={text} onChange={event => {
                        change({
                            ...metadata,
                            example_prompts: metadata.example_prompts.map((value, position) => position === index ? event.target.value : value),
                        });
                    }}/>
                      <Button type="button" variant="outline" aria-label={`${t("skills.draft.removeExample")} ${index + 1}`} onClick={() => {
                        change({ ...metadata, example_prompts: metadata.example_prompts.filter((_, position) => position !== index) });
                    }}>{t("skills.draft.removeExample")}</Button>
                    </div>))}
                  <Button type="button" variant="outline" disabled={metadata.example_prompts.length >= 10} onClick={() => {
                    change({ ...metadata, example_prompts: [...metadata.example_prompts, ""] });
                }}>{t("skills.draft.addExample")}</Button>
                </fieldset>
                <fieldset disabled={locked} className="space-y-2">
                  <legend className="text-sm font-medium">{t("skills.categoryAria")}</legend>
                  <div className="flex flex-wrap gap-4">
                    {SKILL_CATEGORY_KEYS.map(category => (<label key={category} className="flex min-h-11 items-center gap-2 text-sm">
                        <Checkbox disabled={locked} checked={metadata.category_keys.includes(category)} onCheckedChange={checked => {
                        change({
                            ...metadata,
                            category_keys: checked === true
                                ? [...metadata.category_keys, category]
                                : metadata.category_keys.filter(value => value !== category),
                        });
                    }}/>
                        {t(categoryLabels[category])}
                      </label>))}
                  </div>
                </fieldset>
                {visiblePhase !== "editing" ? (
                  <p role={visiblePhase === "saved" || visiblePhase === "changed" || visiblePhase === "saving" ? "status" : "alert"}>
                    {t(phaseMessages[visiblePhase])}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {visiblePhase === "unknown" ? (
                    <Button type="button" onClick={() => void save()}>
                      {t("skills.draft.retryOriginal")}
                    </Button>
                  ) : visiblePhase === "confirmed" || visiblePhase === "conflict" ? (
                    <Button type="button" variant="outline" onClick={reload}>
                      {t("skills.draft.reload")}
                    </Button>
                  ) : (
                    <Button type="submit" disabled={locked}>{t("skills.draft.save")}</Button>
                  )}
                </div>
              </form>)}
            {!pending ? (<Button type="button" variant="outline" disabled={phase === "saving"} onClick={() => {
                    flight.current?.abort();
                    flight.current = null;
                    setSelected(null);
                    setBase(null);
                    setMetadata(null);
                    setGate(null);
                    setReadError(false);
                    setReadAttempt(value => value + 1);
                }}>{t("skills.publishDrafts")}</Button>) : null}
          </>)}
      </DialogContent>
    </Dialog>);
}
