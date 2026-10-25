"use client";

import { type FormEvent, type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { HubClient } from "@/hub/client";
import type {
  McpConnector,
  McpConnectorProvider,
} from "@/hub/mcp-connector.schema";
import { useT } from "@/i18n/context";

import { useProviderCreationCommands, useCustomApiManagementCommands, useMcpManagementCommands, useMcpPreparationCommands, useMcpProjectPublicationCommands } from "./connector-command-context";
import { McpConnectionList } from "./mcp-connection-list";
import { McpCustomApiGallery, visibleCustomApiGalleryProfiles } from "./mcp-custom-api-gallery";
import { McpConnectorEditorDialog } from "./mcp-connector-editor-dialog";
import { useMcpTrial } from "./mcp-trial-context";
import { CustomMcpDetailDialog } from "./custom-mcp-detail-dialog";
import { McpProjectPublicationDialog } from "./mcp-project-publication-dialog";
import type { McpCreateMode } from "./mcp-panel-model";
import { McpProviderCatalogDialog } from "./mcp-provider-catalog-dialog";
import { McpProviderDetailDialog } from "./mcp-provider-detail-dialog";
import { McpProviderDirectory } from "./mcp-provider-directory";
import type {
  McpConnectorEditor,
  McpProjectionView,
} from "./mcp-projection-types";
import { MCP_CATEGORY_MESSAGES } from "./mcp-projection-types";
import styles from "./mcp-projection-read.module.css";
import { CustomApiDetailDialog } from "./custom-api-detail-dialog";
import { McpSettingsToolbar } from "./mcp-settings-toolbar";
import { useMcpOAuthPopup } from "./use-mcp-oauth-popup";
import { usePrivateMcpAuthorization } from "./use-private-mcp-authorization";
import { useMcpProviderDetail } from "./use-mcp-provider-detail";
import { useMcpProviderDirectory } from "./use-mcp-provider-directory";
import { useCustomApiDetail } from "./use-custom-api-detail";
import { useMcpProviderConnection, type McpConnectorBinding } from "./use-mcp-provider-connection";
import { useMcpProviderRelations } from "./use-mcp-provider-relations";
import { useCustomApiProjection } from "./use-custom-api-projection";
import { invalidateMcpConnectorProjection, useMcpConnectorRevision, useMcpProjection } from "./use-mcp-projection";

import type { CustomApiManagementIntent } from "./custom-api-management-commands";

import type { McpManagementIntent } from "./mcp-management-commands";
import { readCreatedMcpDetail, retireCreatedMcpDetail } from "./mcp-created-detail-handoff";
import type { McpServerCreationCompletion } from "./mcp-server-creation-flow";

const EMPTY_PROVIDERS: McpConnectorProvider[] = [];

/**
 * Product-level MCP surface coordinator. It owns user intent and owner commands;
 * projection reads, card lists and modal presentation stay in their dedicated
 * components so each can evolve independently without a second data source.
 */
export function McpProjectionRead({
  client,
  identity,
  admitted = true,
  readGeneration = 0,
  embedded = false,
  onManageConnectors,
  onAuthorizationNavigate,
  onCreateMcp,
  onPrompt,
  brandName = "Kokoro",
  initialView = "catalog",
  settingsLayout = false,
  refreshKey = 0,
  createdDetail,
}: {
  client: HubClient;
  embedded?: boolean;
  initialView?: McpProjectionView;
  settingsLayout?: boolean;
  /** Owner mutations invalidate the connector projection without touching provider data. */
  refreshKey?: number;
  identity: string;
  admitted?: boolean;
  readGeneration?: number;
  /** The standalone plaza opens Settings/连接器 instead of replacing itself. */
  onManageConnectors?: (returnTarget: HTMLElement) => void;
  /** Tests may inject navigation; Platform owns the issued OAuth URL. */
  onAuthorizationNavigate?: (authorizationUrl: string) => void;
  onCreateMcp?: (
    mode: McpCreateMode,
    returnTarget?: HTMLElement | null,
  ) => void;
  onPrompt?: (prompt: string) => void;
  brandName?: string;
  /** A creation window hands off its exact ACK; it does not mount another plaza. */
  createdDetail?: { target: McpServerCreationCompletion; onClose: () => void; returnFocusRef?: RefObject<HTMLElement | null> };
}) {
  const t = useT();
  const startTrial = useMcpTrial();
  const providerCreation = useProviderCreationCommands(client, identity);
  const providerCreationStates = useSyncExternalStore(providerCreation.subscribe, providerCreation.getSnapshot, providerCreation.getSnapshot);
  const preparation = useMcpPreparationCommands(client, identity);
  const preparationStates = useSyncExternalStore(preparation.subscribe, preparation.getSnapshot, preparation.getSnapshot);
  const apiManagement = useCustomApiManagementCommands(client, identity);
  const apiManagementStates = useSyncExternalStore(apiManagement.subscribe, apiManagement.getSnapshot, apiManagement.getSnapshot);
  const management = useMcpManagementCommands(client, identity);
  const managementStates = useSyncExternalStore(management.subscribe, management.getSnapshot, management.getSnapshot);
  const publication = useMcpProjectPublicationCommands(client);
  const publicationState = useSyncExternalStore(publication.subscribe, publication.getSnapshot, publication.getSnapshot);
  const commandBoundary = { subject: identity, admitted, generation: readGeneration };
  const owner = useMemo(() => ({ client, identity, admitted, readGeneration }), [client, identity, admitted, readGeneration]);
  const ownerRef = useRef<typeof owner | null>(owner);
  useLayoutEffect(() => {
    ownerRef.current = owner;
    return () => { if (ownerRef.current === owner) ownerRef.current = null; };
  }, [owner]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<string | null>>([]);
  const [view, setView] = useState<McpProjectionView>(initialView);
  const [refreshError, setRefreshError] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);
  const [detailRetry, setDetailRetry] = useState(0);
  // Subscribe to the existing mutation revision; a known creation read is not
  // permission to retain stale CAS after admission, mutation, or explicit retry.
  useMcpConnectorRevision(client, identity);
  if (createdDetail && detailRetry > 0) retireCreatedMcpDetail(createdDetail.target);
  const createdFacts = createdDetail ? readCreatedMcpDetail(createdDetail.target, client, commandBoundary) : null;
  const [editor, setEditor] = useState<McpConnectorEditor | null>(() => createdFacts ? { kind: "edit", ...createdFacts } : null);
  // Only exact locators and typed input survive an admission recheck.
  const [connectorIntent, setConnectorIntent] = useState<{ connectorId: string; providerKey?: string; serverId?: string; binding?: McpConnectorBinding; exact?: boolean; entered: boolean; window: object; configurationSaved?: object } | null>(() => createdDetail ? {
    ...createdDetail.target, exact: true, entered: false, window: {},
    binding: { connectorType: "mcp", serverId: createdDetail.target.serverId },
  } : null);
  const [publicationIntent, setPublicationIntent] = useState<{ target: McpServerCreationCompletion; window: object; owner: typeof owner } | null>(null);
  const activePublication = publicationIntent?.owner === owner && publicationIntent.window === connectorIntent?.window ? publicationIntent : null;
  useEffect(() => {
    if (!activePublication) return;
    return () => publication.pause();
  }, [activePublication, publication]);
  const editorWindow = useRef<{ intent: object; controller: AbortController } | null>(null);
  useLayoutEffect(() => {
    const window = connectorIntent?.window;
    const wait = window ? { intent: window, controller: new AbortController() } : null;
    editorWindow.current = wait;
    return () => {
      if (editorWindow.current === wait) editorWindow.current = null;
      wait?.controller.abort();
    };
  }, [connectorIntent?.window, owner]);
  const preparationState = preparationStates.find(item => item.serverId === connectorIntent?.serverId && item.connectorId === connectorIntent?.connectorId);
  const [providerWindowToken, setProviderWindowToken] = useState<{ fromDirectory?: true }>({});
  const providerWindow = useRef<{ intent: object; controller: AbortController } | null>(null);
  const [selectedProviderKey, setSelectedProviderKey] = useState<string | null>(null);
  const [providerConnectionIntent, setProviderConnectionIntent] = useState<{ connectorId: string; exact: boolean; binding?: McpConnectorBinding } | null>(null);
  const selectedProviderConnectionId = providerConnectionIntent?.connectorId ?? null;
  const setSelectedProviderConnectionId = (connectorId: string | null, exact = false, binding?: McpConnectorBinding) =>
    setProviderConnectionIntent(connectorId === null ? null : { connectorId, exact, ...(binding ? { binding } : {}) });
  const bindingFor = (connection: McpConnector): McpConnectorBinding => ({ connectorType: connection.connector_type,
    ...(connection.server_id ? { serverId: connection.server_id } : {}) });
  useLayoutEffect(() => {
    const wait = selectedProviderKey ? { intent: providerWindowToken, controller: new AbortController() } : null;
    providerWindow.current = wait;
    return () => { if (providerWindow.current === wait) providerWindow.current = null; wait?.controller.abort(); };
  }, [providerWindowToken, selectedProviderKey, owner]);
  const providerCreationState = providerCreationStates.find(item => item.providerKey === selectedProviderKey &&
    (selectedProviderConnectionId === null || item.connectorId === selectedProviderConnectionId));
  const managementState = managementStates.find(item => item.connectorId === connectorIntent?.connectorId);
  const providerManagementState = managementStates.find(item => item.connectorId === selectedProviderConnectionId);
  const privateAuthorization = usePrivateMcpAuthorization({ client, identity, admitted, readGeneration,
    intent: connectorIntent,
    blocked: Boolean((managementState && managementState.kind !== "rejected") || preparationState?.kind === "running" || preparationState?.kind === "completed"),
    ...(onAuthorizationNavigate ? { onAuthorizationNavigate } : {}),
  });
  const [apiIntent, setApiIntent] = useState<{ profileId: string; window: object } | null>(null);
  const selectedCustomApiId = apiIntent?.profileId ?? null;
  const apiWindow = useRef<{ intent: object; controller: AbortController } | null>(null);
  useLayoutEffect(() => {
    const window = apiIntent?.window;
    const wait = window ? { intent: window, controller: new AbortController() } : null;
    apiWindow.current = wait;
    return () => { if (apiWindow.current === wait) apiWindow.current = null; wait?.controller.abort(); };
  }, [apiIntent?.window, owner]);
  const apiCommandState = apiManagementStates.find(item => item.profileId === selectedCustomApiId);
  const [providerQuery, setProviderQuery] = useState("");
  const [connectorQuery, setConnectorQuery] = useState("");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<
    "all" | keyof typeof MCP_CATEGORY_MESSAGES
  >("all");
  const [displayNameDraft, setDisplayName] = useState<string | null>(null);
  const [descriptionDraft, setDescription] = useState<string | null>(null);
  const displayName = displayNameDraft ?? editor?.connector.display_name ?? "";
  const description = descriptionDraft ?? editor?.connector.description ?? "";
  const [deleteId, setDeleteId] = useState<string | null>(null);
  // Once the owner confirms deletion, hide that row immediately rather than
  // leaving a stale card visible while the background projection refreshes.
  // This is a confirmed projection transition, not an optimistic fake.
  const [confirmedRemovedConnectorIds, setConfirmedRemovedConnectorIds] =
    useState<ReadonlySet<string>>(() => new Set());
  const [factsOwner, setFactsOwner] = useState(owner);
  if (factsOwner !== owner) {
    setFactsOwner(owner);
    if (factsOwner.identity !== owner.identity || factsOwner.client !== owner.client) {
      setSelectedProviderKey(null); setSelectedProviderConnectionId(null); setProviderWindowToken({});
    }
    setEditor(null);
    setActionId(null);
    setActionError(false);
    setDeleteId(null);
    setConfirmedRemovedConnectorIds(new Set());
  }
  const surfaceRef = useRef<HTMLElement | null>(null);
  const editorReturnFocusRef = useRef<HTMLElement | null>(createdDetail?.returnFocusRef?.current ?? null);
  const catalogReturnFocusRef = useRef<HTMLElement | null>(null);
  const providerReturnFocusRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const fallback = surfaceRef.current?.querySelector<HTMLElement>('input[type="search"]') ?? null;
    if (connectorIntent && !editorReturnFocusRef.current?.isConnected) editorReturnFocusRef.current = fallback;
    if (selectedCustomApiId && !editorReturnFocusRef.current?.isConnected) editorReturnFocusRef.current = fallback;
    if (selectedProviderKey && !providerReturnFocusRef.current?.isConnected) providerReturnFocusRef.current = fallback;
  }, [owner, connectorIntent, selectedCustomApiId, selectedProviderKey]);
  const authorizationWindow = useMemo(() => ({ ...owner, providerWindowToken, selectedProviderKey, editor: connectorIntent?.window }),
    [owner, providerWindowToken, selectedProviderKey, connectorIntent?.window]);
  const startOAuthPopup = useMcpOAuthPopup({
    ...(onAuthorizationNavigate ? { onAuthorizationNavigate } : {}),
    lifecycle: authorizationWindow,
    onReload: () => { if (ownerRef.current === owner && admitted) { reload("connectors"); setDetailRetry(value => value + 1); } },
  });
  const {
    providerState,
    connectorState,
    providerProjection,
    connectorProjection,
    reload,
  } = useMcpProjection({
    client,
    identity,
    admitted: admitted && !createdDetail,
    readGeneration,
    cursor,
    view,
    connectorRefreshKey: refreshKey,
  });
  const customApiState = useCustomApiProjection({
    client,
    identity,
    admitted: admitted && !createdDetail,
    readGeneration,
    refreshKey,
  });

  // Provider card artwork is rendered from owner-owned `cover_image_url` in
  // McpProviderDirectory; this coordinator never substitutes local assets.
  const directory = useMcpProviderDirectory({ client, identity, admitted: admitted && !createdDetail, readGeneration,
    seed: providerProjection, query: providerQuery, category: categoryFilter });
  const providers = [...new Map([...(providerProjection?.items ?? EMPTY_PROVIDERS), ...directory.items]
    .map(provider => [provider.provider_key, provider])).values()];
  const directoryError = directory.error || (providerQuery.trim() === "" && categoryFilter === "all" && providerState.error);
  const retryDirectory = () => {
    if (directory.error) directory.retry();
    else reload("providers");
  };
  const connectors = (connectorProjection?.items ?? []).filter(
    (connector) => !confirmedRemovedConnectorIds.has(connector.connector_id),
  );
  const relations = useMcpProviderRelations({ client, identity, admitted: admitted && !createdDetail, readGeneration, refreshKey,
    enabled: view === "catalog" || catalogOpen || (providerWindowToken.fromDirectory === true && selectedProviderKey !== null) });
  const addedProviderKeys = new Set(relations.items.filter(item => item.status !== "revoked" && !confirmedRemovedConnectorIds.has(item.connector_id)).map(item => item.provider_key));
  const directoryConnections = relations.items.filter(item => item.provider_key === selectedProviderKey && item.status !== "revoked" && !confirmedRemovedConnectorIds.has(item.connector_id));
  const resolvingDirectory = providerWindowToken.fromDirectory === true && selectedProviderConnectionId === null && (!providerCreationState || providerCreationState.kind === "rejected");
  // Freeze a unique locator only after the complete management observation.
  // Private servers retain explicit selection and their own editor.
  if (admitted && resolvingDirectory && relations.complete && !relations.error && directoryConnections.length === 1 && !directoryConnections[0]!.server_id)
    setSelectedProviderConnectionId(directoryConnections[0]!.connector_id, true, bindingFor(directoryConnections[0]!));
  const customApis = customApiState.data?.items ?? [];
  const providerConnectionDetail = useMcpProviderConnection({ client, identity, admitted, readGeneration,
    connectorId: selectedProviderConnectionId ?? providerCreationState?.connectorId ?? null, providerKey: selectedProviderKey,
    ...(providerConnectionIntent?.binding ? { binding: providerConnectionIntent.binding } : {}),
    known: !providerConnectionIntent?.exact && view === "connections" && !connectorState.loading && !connectorState.error
      ? connectors.find(item => item.connector_id === selectedProviderConnectionId) : undefined, retry: detailRetry });
  const selectedProviderConnection = providerConnectionDetail.connection;
  const providerDetail = useMcpProviderDetail({ client, identity, admitted, readGeneration,
    providerKey: selectedProviderKey, known: providers.find(item => item.provider_key === selectedProviderKey), retry: detailRetry });
  const selectedProvider = admitted && (selectedProviderConnectionId === null || selectedProviderConnection?.provider_key === selectedProviderKey)
    ? providerDetail.provider : null;
  const apiDetail = useCustomApiDetail({ client, identity, admitted, readGeneration,
    profileId: selectedCustomApiId, known: customApiState.dataCurrent
      ? customApis.find(item => item.profile_id === selectedCustomApiId) : undefined, retry: detailRetry });
  const selectedCustomApi = apiDetail.profile;
  const providersByKey = new Map(
    providers.map((provider) => [provider.provider_key, provider]),
  );
  const connectorRefreshing =
    connectorState.loading || connectorState.requestIdentity !== identity;
  const refreshing =
    view === "catalog" ? directory.loading : connectorRefreshing;
  const plaza = embedded && !settingsLayout && initialView === "catalog";
  const galleryProps = { profiles: customApis, admitted, confirmed: customApiState.dataCurrent,
    query: providerQuery, category: categoryFilter };
  const hasVisibleCustomApis = plaza && visibleCustomApiGalleryProfiles(galleryProps).length > 0;
  const selectCustomApi = (profile: (typeof customApis)[number], trigger: HTMLElement) => {
    if (ownerRef.current !== owner || !admitted || (view === "catalog" && !customApiState.dataCurrent)) return;
    editorReturnFocusRef.current = trigger;
    setActionError(false);
    setApiIntent({ profileId: profile.profile_id, window: {} });
  };
  const customApiContinuation = <>
    {customApiState.loadMoreError ? <Alert variant="destructive" role="alert"><AlertDescription>{t("mcp.loadError")}</AlertDescription></Alert> : null}
    {customApiState.hasMore ? <Button type="button" variant="outline" disabled={customApiState.loadingMore}
      aria-busy={customApiState.loadingMore} onClick={() => void customApiState.loadMore()}>
      {customApiState.loadingMore ? t("mcp.loading") : t("rail.loadMore")} · API
    </Button> : null}
    {customApiState.loadMoreError && !customApiState.hasMore ? <Button type="button" variant="outline" onClick={customApiState.reload}>{t("mcp.retry")}</Button> : null}
  </>;

  const hideConfirmedRemovedConnector = (connectorId: string) => {
    setConfirmedRemovedConnectorIds((current) => {
      if (current.has(connectorId)) return current;
      return new Set([...current, connectorId]);
    });
  };

  const resetEditor = () => {
    setEditor(null);
    setConnectorIntent(null);
    setDeleteId(null);
    setDisplayName(null);
    setDescription(null);
    createdDetail?.onClose();
  };
  const runAction = async (
    id: string,
    action: () => Promise<unknown>,
    onSuccess?: (result: unknown) => void,
  ) => {
    const wait = providerWindow.current ?? editorWindow.current;
    const current = () => ownerRef.current === owner && wait !== null && !wait.controller.signal.aborted &&
      (providerWindow.current === wait || editorWindow.current === wait);
    if (!owner.admitted || !current()) return;
    setActionId(id);
    setActionError(false);
    try {
      const result = await action();
      // A confirmed old-generation write still retires this exact actor's
      // projection, but never publishes its private ACK or changes current UI.
      invalidateMcpConnectorProjection(client, identity);
      if (!current()) return;
      resetEditor();
      onSuccess?.(result);
    } catch {
      if (current()) setActionError(true);
    } finally {
      if (current()) setActionId(null);
    }
  };
  const runApiManagement = async (input?: CustomApiManagementIntent) => {
    const wait = apiWindow.current;
    if (!apiIntent || !wait || wait.intent !== apiIntent.window || ownerRef.current !== owner || !admitted) return;
    const confirmed = input
      ? await apiManagement.submit(input, commandBoundary, wait.controller.signal)
      : await apiManagement.resume(apiIntent.profileId, commandBoundary, wait.controller.signal);
    if (!confirmed || ownerRef.current !== owner || apiWindow.current !== wait) return;
    if (apiManagement.finish(apiIntent.profileId, commandBoundary)) setApiIntent(null);
  };
  const runManagement = async (origin: "editor" | "provider", connectorId: string, input?: McpManagementIntent) => {
    const wait = origin === "editor" ? editorWindow.current : providerWindow.current;
    const currentWindow = () => origin === "editor" ? editorWindow.current : providerWindow.current;
    const expectedWindow = origin === "editor" ? connectorIntent?.window : providerWindowToken;
    const expectedConnector = origin === "editor" ? connectorIntent?.connectorId : selectedProviderConnectionId;
    if (!wait || wait.intent !== expectedWindow || connectorId !== expectedConnector || ownerRef.current !== owner || !admitted) return;
    const operation = input?.operation ?? management.getSnapshot().find(item => item.connectorId === connectorId)?.operation;
    const confirmed = input ? await management.submit(input, commandBoundary, wait.controller.signal) : await management.resume(connectorId, commandBoundary, wait.controller.signal);
    if (!confirmed || ownerRef.current !== owner || currentWindow() !== wait || !management.finish(connectorId, commandBoundary)) return;
    if (origin === "editor" && operation === "update_server") {
      // Keep the configuration mounted, but retire old CAS/actions before an
      // exact post-save connector/server read. The page can retain its cards;
      // those older list facts must not unlock another save or Try.
      setEditor(null);
      setConnectorIntent(current => current?.window === expectedWindow ? {
        ...current, exact: true,
        binding: { connectorType: "mcp", ...(current.serverId ? { serverId: current.serverId } : {}) },
        configurationSaved: {},
      } : current);
      return;
    }
    if (operation === "disconnect" || operation === "delete_server") {
      hideConfirmedRemovedConnector(connectorId);
      const creation = providerCreation.getSnapshot().find(item => item.connectorId === connectorId);
      if (creation) providerCreation.finish(creation.providerKey, commandBoundary);
    }
    if (origin === "editor") resetEditor();
    else { setSelectedProviderKey(null); setSelectedProviderConnectionId(null); }
  };
  const beginEdit = (connector: McpConnector, returnFocus: HTMLElement, exact = false) => {
    if (!owner.admitted || ownerRef.current !== owner) return;
    editorReturnFocusRef.current = returnFocus;
    providerReturnFocusRef.current = returnFocus;
    setDeleteId(null);
    setActionError(false);
    setEditor(null);
    if (!connector.server_id && (connector.connector_type === "mcp" || exact)) {
      setProviderWindowToken({});
      setSelectedProviderConnectionId(connector.connector_id, exact, exact ? bindingFor(connector) : undefined);
      setSelectedProviderKey(connector.provider_key);
      setConnectorIntent(null);
      return;
    }
    setProviderWindowToken({});
    setConnectorIntent({ connectorId: connector.connector_id, providerKey: connector.provider_key, exact, ...(exact ? { binding: bindingFor(connector) } : {}), ...(connector.server_id ? { serverId: connector.server_id } : {}), entered: false, window: {} });
  };
  const connectorId = connectorIntent?.connectorId;
  const serverId = connectorIntent?.serverId;
  const detailHandoff = createdFacts && connectorIntent?.exact && createdFacts.server.server_id === serverId &&
    createdFacts.connector.connector_id === connectorId && createdFacts.connector.provider_key === connectorIntent.providerKey ? createdFacts : null;
  const exactEditorConnection = useMcpProviderConnection({ client, identity, admitted, readGeneration,
    connectorId: connectorIntent?.exact ? connectorId ?? null : null, providerKey: connectorIntent?.providerKey ?? null,
    known: detailHandoff?.connector, retry: detailRetry, ...(connectorIntent?.binding ? { binding: connectorIntent.binding } : {}) });
  const [editorReadScope, setEditorReadScope] = useState<object | null>(() => exactEditorConnection.readScope);
  // A server read belongs to the exact connector observation that admitted it.
  // Retire both facts before committing a new revision/retry, even if the next
  // connector response reuses the same object. Never expose old CAS actions.
  if (connectorIntent?.exact && editorReadScope !== exactEditorConnection.readScope) {
    setEditorReadScope(exactEditorConnection.readScope);
    setEditor(null);
  }
  const selectedConnector = connectorIntent?.exact ? exactEditorConnection.connection ?? undefined
    : connectorProjection?.items.find(item => item.connector_id === connectorId);
  const providerReady = Boolean(serverId) || providerProjection !== undefined;
  const selectedConnectorProvider = serverId ? undefined : providers.find(item => item.provider_key === selectedConnector?.provider_key);
  useEffect(() => {
    if (!admitted || !connectorId || !selectedConnector || (!serverId && !providerReady) || detailHandoff) return;
    let active = true;
    const controller = new AbortController();
    const read = async () => {
      try {
        // Never replace the selected aggregate with another row, even if its
        // display name/provider matches or the page has changed underneath it.
        if (selectedConnector.server_id !== serverId) throw Error("selected MCP binding changed");
        const server = serverId && client.getPrivateMcpServer ? await client.getPrivateMcpServer(serverId, controller.signal) : undefined;
        if (!active || ownerRef.current !== owner) return;
        if (serverId && (!server || server.server_id !== serverId)) throw Error("MCP detail identity mismatch");
        if (!server && (selectedConnectorProvider || selectedConnector.connector_type === "mcp")) {
          setProviderWindowToken({});
          setSelectedProviderConnectionId(selectedConnector.connector_id);
          setSelectedProviderKey(selectedConnector.provider_key);
          setConnectorIntent(null);
          return;
        }
        setEditor({ kind: "edit", connector: selectedConnector, ...(server ? { server } : {}) });
        setConnectorIntent(current => current?.connectorId === connectorId ? { ...current, entered: true } : current);
      } catch {
        if (active && ownerRef.current === owner) setActionError(true);
      }
    };
    void read();
    return () => { active = false; controller.abort(); };
  }, [admitted, client, connectorId, serverId, selectedConnector, selectedConnectorProvider, providerReady, detailRetry, owner, detailHandoff]);
  const connectProvider = (
    provider: McpConnectorProvider,
    onSuccess?: () => void,
  ) => {
    const wait = providerWindow.current;
    if (!wait || ownerRef.current !== owner || !admitted) return;
    const current = () => ownerRef.current === owner && providerWindow.current === wait && !wait.controller.signal.aborted;
    // A retained hint only reserves a gesture window. The server binding and
    // CAS are always reread below; this is not an authorization fact.
    const reservePopup = Boolean(provider.connection_server_id || providerCreationState?.requiresOAuth);
    let authorizationStarted = false;
    void runAction(`connect:${provider.provider_key}`, async () => {
      const prepare = async (signal: AbortSignal) => {
        if (!client.getMcpConnector) throw new Error("MCP exact detail unavailable");
        const connectorId = await providerCreation.run({
          provider_key: provider.provider_key, connector_type: "mcp",
          display_name: provider.display_name, description: provider.description ?? "",
        }, commandBoundary, signal);
        if (!connectorId || !current() || signal.aborted) throw new Error("MCP creation not confirmed in this window");
        // A known locator is not current owner state. Read both aggregates
        // after Create, including a changed OAuth server binding/CAS.
        const connector = await client.getMcpConnector(connectorId, signal);
        if (!current() || signal.aborted) throw new Error("MCP detail window retired");
        const freshProvider = await client.getMcpConnectorProvider(provider.provider_key, signal);
        if (!current() || signal.aborted || connector.connector_id !== connectorId ||
          connector.provider_key !== provider.provider_key || connector.connector_type !== "mcp" ||
          freshProvider.provider_key !== provider.provider_key || !freshProvider.enabled)
          throw new Error("MCP creation binding retired");
        setSelectedProviderConnectionId(connectorId);
        if (connector.status === "active" || !freshProvider.connection_server_id) return null;
        if (!reservePopup) {
          providerCreation.requireOAuthPopup(provider.provider_key, commandBoundary);
          throw new Error("MCP authorization now requires a new user gesture");
        }
        if (connector.status === "revoked") throw new Error("connector was revoked");
        const authorize = connector.status === "error" ? client.reconnectMcpConnectorAuthorization : client.beginMcpConnectorAuthorization;
        const started = await authorize(connectorId, {
          server_id: freshProvider.connection_server_id, expected_state_version: connector.state_version,
        }, signal);
        authorizationStarted = true;
        return { connectorId, authorizationUrl: started.authorization.authorization_url, expiresAt: started.authorization.expires_at };
      };
      if (reservePopup) await startOAuthPopup(prepare);
      else await prepare(wait.controller.signal);
      if (!current() || !providerCreation.finish(provider.provider_key, commandBoundary)) throw new Error("MCP creation window retired");
    }, () => { if (!authorizationStarted) onSuccess?.(); });
  };
  const restartAuthorization = (connector: McpConnector, serverId: string) => {
    void runAction(`reconnect:${connector.connector_id}`, async () => {
      await startOAuthPopup(async (signal) => {
        const started = await client.reconnectMcpConnectorAuthorization(
          connector.connector_id,
          {
            server_id: serverId,
            expected_state_version: connector.state_version,
          },
          signal,
        );
        return {
          connectorId: connector.connector_id,
          authorizationUrl: started.authorization.authorization_url,
          expiresAt: started.authorization.expires_at,
        };
      });
    }, () => {
      const creation = providerCreation.getSnapshot().find(item => item.connectorId === connector.connector_id);
      if (creation) providerCreation.finish(creation.providerKey, commandBoundary);
    });
  };
  const submitEdit = (
    event: FormEvent<HTMLFormElement>,
    editorValue: McpConnectorEditor,
  ) => {
    event.preventDefault();
    if (!displayName.trim()) return;
    const { connector, server } = editorValue;
    if (!admitted || management.isBlocked(connector.connector_id)) return;
    if (server) {
      void runManagement("editor", connector.connector_id, { operation: "update_server", connectorId: connector.connector_id, serverId: server.server_id, input: {
        expected_state_version: server.state_version, display_name: displayName.trim(), ...(description.trim() ? { notes: description.trim() } : { clear_notes: true }),
      } });
    } else void runManagement("editor", connector.connector_id, { operation: "update_connector", connectorId: connector.connector_id, ...(connector.server_id ? { serverId: connector.server_id } : {}), input: {
      display_name: displayName.trim(), description: description.trim(), expected_state_version: connector.state_version,
    } });
  };

  const openCatalog = (target?: HTMLElement) => {
    if (ownerRef.current !== owner || !admitted) return;
    catalogReturnFocusRef.current =
      target ??
      surfaceRef.current?.querySelector<HTMLElement>(
        `.${styles.emptyConnections} button`,
      ) ??
      null;
    setCatalogOpen(true);
  };
  const openProvider = (
    provider: McpConnectorProvider,
    trigger: HTMLElement,
  ) => {
    if (ownerRef.current !== owner || !admitted) return;
    providerReturnFocusRef.current = trigger;
    setActionError(false);
    setProviderWindowToken({ fromDirectory: true });
    setSelectedProviderConnectionId(null, true);
    setSelectedProviderKey(provider.provider_key);
  };
  return (
    <section
      ref={surfaceRef}
      className={styles.surface}
      data-testid="mcp-projection-read"
      data-embedded={embedded || undefined}
      data-settings-layout={settingsLayout || undefined}
      data-presentation={plaza ? "plaza" : undefined}
      aria-busy={(!createdDetail && refreshing) || undefined}
    >
      {createdDetail ? null : <>
      <header className={styles.header}>
        {plaza ? <h1>{t("rail.plugins")}</h1> : settingsLayout ? null : <h2>{t("rail.navPlugins")}</h2>}
        <McpSettingsToolbar
          view={view}
          settingsLayout={settingsLayout}
          plazaLayout={plaza}
          query={view === "connections" ? connectorQuery : providerQuery}
          onQueryChange={
            view === "connections" ? setConnectorQuery : setProviderQuery
          }
          /* The catalog plaza owns its own directory search. The embedded
             Settings connections view is a different Manus surface and keeps
             its search field beside Browse/Create. */
          showSearch={!embedded || settingsLayout}
          disabled={!admitted}
          onBrowse={(target) => {
            if (ownerRef.current !== owner || !admitted) return;
            if (view === "catalog" && onManageConnectors) {
              onManageConnectors(target);
              return;
            }
            if (settingsLayout && view === "connections")
              return openCatalog(target);
            setRefreshError(false);
            setView((current) =>
              current === "connections" ? "catalog" : "connections",
            );
          }}
          {...(onCreateMcp ? { onCreate: (mode: McpCreateMode, target?: HTMLElement | null) => { if (ownerRef.current === owner && admitted) onCreateMcp(mode, target); } } : {})}
        />
      </header>
      <div className={styles.body}>
      {view === "catalog" && directoryError ? (
        <ProjectionError onRetry={retryDirectory} />
      ) : null}
      {view === "connections" &&
      connectorProjection === undefined &&
      connectorRefreshing ? (
        <ProjectionPending view="connections" />
      ) : null}
      {view === "connections" && admitted && customApiState.error ? (
        <ProjectionError onRetry={() => {
          if (ownerRef.current === owner && admitted) customApiState.reload();
        }} />
      ) : null}
      {view === "connections" && (connectorState.error || refreshError) ? (
        <ProjectionError
          onRetry={() => {
            setRefreshError(false);
            reload("connectors");
          }}
        />
      ) : null}
      {(actionError || (admitted && connectorIntent !== null && connectorProjection !== undefined && !selectedConnector)) &&
      (connectorIntent === null || !connectorIntent.entered) &&
      selectedProviderKey === null &&
      selectedCustomApiId === null ? (
        <ActionError {...(connectorIntent ? { onRetry: () => { if (!admitted || ownerRef.current !== owner) return; setActionError(false); if (!connectorIntent.exact && (!selectedConnector || connectorState.error)) reload("connectors"); else setDetailRetry(value => value + 1); } } : {})} />
      ) : null}

      {view === "catalog" ? (
        <div className={styles.content}>
          <McpProviderDirectory
            providers={directory.items}
            hasMore={directory.hasMore}
            loading={directory.loading}
            onLoadMore={directory.loadMore}
            {...(directory.items.length === 0 ? hasVisibleCustomApis || (plaza && categoryFilter === "all" && customApiState.error)
              ? { resultsPlaceholder: null }
              : !admitted || directory.loading || (plaza && categoryFilter === "all" && customApiState.loading)
                ? { resultsPlaceholder: <ProjectionPending view="catalog" /> } : {} : {})}
            query={providerQuery}
            onQueryChange={setProviderQuery}
            showSearch={embedded}
            presentation={embedded ? "plaza" : "dialog"}
            addedProviderKeys={addedProviderKeys}
                relationsComplete={relations.complete && !relations.error}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            onSelectProvider={openProvider}
          />
          {plaza ? <McpCustomApiGallery {...galleryProps} onSelect={selectCustomApi} /> : null}
          {plaza && admitted && categoryFilter === "all" ? <>
            {customApiState.error ? <ProjectionError onRetry={() => {
              if (ownerRef.current === owner && admitted) customApiState.reload();
            }} /> : null}
            {customApiContinuation}
          </> : null}
        </div>
      ) : null}
      {view === "connections" && admitted ? managementStates.filter(item => item.kind !== "rejected" && !connectors.some(connector => connector.connector_id === item.connectorId)).map(item =>
        <Button key={item.connectorId} type="button" variant="outline" className="max-w-full" onClick={event => {
          editorReturnFocusRef.current = event.currentTarget; setActionError(false); setEditor(null);
          setConnectorIntent({ connectorId: item.connectorId, ...(item.serverId ? { serverId: item.serverId } : {}), entered: true, window: {} });
        }}><span className="truncate">{t(item.kind === "completed" ? "mcp.creationDone" : "mcp.retryOriginal")} · {item.connectorId}</span></Button>) : null}
      {view === "connections" && admitted ? apiManagementStates.filter(item =>
        item.kind !== "rejected" && !customApis.some(profile => profile.profile_id === item.profileId)
      ).map(item => <Button key={item.profileId} type="button" variant="outline" className="max-w-full" onClick={event => {
        editorReturnFocusRef.current = event.currentTarget;
        setApiIntent({ profileId: item.profileId, window: {} });
      }}><span className="truncate">{t(item.kind === "completed" ? "mcp.creationDone" : "mcp.retryOriginal")} · {item.profileId}</span></Button>) : null}
      {view === "connections" && (connectorProjection !== undefined || customApis.length > 0) ? (
        <div className={styles.content}>
          <McpConnectionList
            connectors={connectors}
            customApis={customApis}
            providers={providers}
            query={connectorQuery}
            brandName={brandName}
            onBrowse={() =>
              settingsLayout ? openCatalog() : setView("catalog")
            }
            onEdit={(connector, trigger) => void beginEdit(connector, trigger)}
            onSelectCustomApi={selectCustomApi}
            previousEnabled={history.length > 0 && actionId === null}
            nextEnabled={
              Boolean(connectorProjection?.next_cursor) && actionId === null
            }
            onPrevious={() => {
              const previous = history.at(-1) ?? null;
              setRefreshError(false);
              setHistory((items) => items.slice(0, -1));
              setCursor(previous);
            }}
            onNext={() => {
              const next = connectorProjection?.next_cursor;
              if (!next || next === cursor || history.includes(next))
                return setRefreshError(true);
              setRefreshError(false);
              setHistory((items) => [...items, cursor]);
              setCursor(next);
            }}
          />
          {customApiContinuation}
        </div>
      ) : null}

      </div>
      <McpProviderCatalogDialog
        open={catalogOpen}
        addedProviderKeys={addedProviderKeys}
        relationsComplete={relations.complete && !relations.error}
        {...(directory.items.length > 0 || !directory.loading ? { providers: directory.items } : {})}
        hasMore={directory.hasMore}
        onLoadMore={directory.loadMore}
        loading={directory.loading}
        error={directoryError}
        query={providerQuery}
        categoryFilter={categoryFilter}
        returnFocusRef={catalogReturnFocusRef}
        onOpenChange={setCatalogOpen}
        onQueryChange={setProviderQuery}
        onCategoryFilterChange={setCategoryFilter}
        onRetry={retryDirectory}
        onSelectProvider={openProvider}
        {...(onCreateMcp ? { onCreate: (mode: McpCreateMode, target?: HTMLElement | null) => { if (ownerRef.current === owner && admitted) onCreateMcp(mode, target); } } : {})}
      />
      </>}
      {activePublication ? <McpProjectPublicationDialog client={client} commands={publication} boundary={commandBoundary}
        target={activePublication.target} onSourceRead={() => { if (createdDetail) retireCreatedMcpDetail(createdDetail.target); }} onClose={() => setPublicationIntent(null)} /> : null}
      {!activePublication && connectorIntent?.serverId && (connectorIntent.exact || connectorIntent.entered || editor?.server) ? (
        <CustomMcpDetailDialog
          iconClient={client.mcpIcons} iconBoundary={commandBoundary}
          key={connectorIntent.serverId}
          connector={editor?.server ? editor.connector : null}
          server={editor?.server ?? null}
          pendingError={admitted && (actionError || (connectorIntent.exact ? exactEditorConnection.error : connectorState.error || (connectorProjection !== undefined && !selectedConnector)))}
          onRetry={() => { if (ownerRef.current !== owner || !admitted) return; setActionError(false); if (!connectorIntent.exact && (!selectedConnector || connectorState.error)) reload("connectors"); else setDetailRetry(value => value + 1); }}
          admitted={admitted}
          publicationAvailable={editor?.server?.transport === "streamable_http" && publication.available && publicationState.recovery === "ready" && publicationState.phase !== "busy" &&
            editor?.connector.connector_type === "mcp" && editor.server?.status !== "disabled" && editor.connector.status !== "revoked" &&
            (publicationState.phase === "idle" || publicationState.target?.serverId === editor.server?.server_id &&
              publicationState.target?.connectorId === editor.connector.connector_id && publicationState.target?.providerKey === editor.connector.provider_key)}
          publicationRecoveryError={publication.available && publicationState.recovery === "error"}
          onRetryPublicationRecovery={() => {
            if (!connectorIntent || !admitted || ownerRef.current !== owner ||
              editorWindow.current?.intent !== connectorIntent.window || publication.getSnapshot().recovery !== "error") return;
            void publication.restore(commandBoundary);
          }}
          onPublish={() => {
            if (!editor?.server || editor.server.transport !== "streamable_http" || !connectorIntent || !admitted || ownerRef.current !== owner ||
              editorWindow.current?.intent !== connectorIntent.window || !preparation.recoveryReady() ||
              management.isBlocked(editor.connector.connector_id) || privateAuthorization.busy || actionId !== null ||
              preparation.getSnapshot().some(item => item.serverId === editor.server!.server_id && item.kind !== "rejected") ||
              editor.connector.connector_type !== "mcp" || editor.connector.status === "revoked" || editor.server.status === "disabled" ||
              editor.server.server_id !== connectorIntent.serverId || editor.connector.server_id !== editor.server.server_id ||
              editor.connector.connector_id !== connectorIntent.connectorId || editor.connector.provider_key !== connectorIntent.providerKey) return;
            const target = { serverId: editor.server.server_id, connectorId: editor.connector.connector_id, providerKey: editor.connector.provider_key };
            if (publication.open(target, commandBoundary)) setPublicationIntent({ target, window: connectorIntent.window, owner });
          }}
          managementCommand={managementState}
          {...(connectorIntent.configurationSaved ? { configurationSaved: connectorIntent.configurationSaved } : {})}
          onResumeManagement={() => { if (connectorIntent) void runManagement("editor", connectorIntent.connectorId); }}
          preparationState={preparationState?.kind ?? "idle"}
          preparationFailure={preparationState?.failure}
          preparationCanResume={connectorIntent.serverId ? preparation.canResume(connectorIntent.serverId, undefined, connectorIntent.window) : false}
          preparationCanInspect={connectorIntent.serverId ? preparation.canInspect(connectorIntent.serverId) : false}
          preparationRecoveryReady={preparation.recoveryReady()}
          preparationRecoveryError={preparation.recoveryFailed()}
          onRetryPreparationRecovery={() => { void preparation.restore({ subject: identity, admitted, generation: readGeneration }); }}
          actionId={preparationState?.kind === "running" || preparationState?.inspection === "running" ? connectorIntent.connectorId : actionId}
          actionError={actionError || managementState?.kind === "rejected" || privateAuthorization.error}
          authorizationBusy={privateAuthorization.busy}
          onAuthorize={() => {
            if (!editor?.server || !connectorIntent || ownerRef.current !== owner || !admitted ||
              editorWindow.current?.intent !== connectorIntent.window || !preparation.recoveryReady() || management.isBlocked(editor.connector.connector_id)) return;
            const preparing = preparation.getSnapshot().find(item => item.serverId === editor.server!.server_id);
            if (preparing?.kind === "running" || preparing?.kind === "completed") return;
            void privateAuthorization.authorize(editor.connector, editor.server);
          }}
          deleteId={deleteId}
          returnFocusRef={editorReturnFocusRef}
          onClose={resetEditor}
          onSaveConfiguration={(input) => {
            if (!editor?.server || !client.updatePrivateMcpServer) return;
            const server = editor.server;
            const notesChanged = input.notes !== (server.notes ?? "");
            const nameChanged = input.display_name !== server.display_name;
            const urlChanged = input.server_url !== server.server_url;
            const headersChanged =
              input.header_upserts.length > 0 || input.header_removals.length > 0;

            // The Platform owner deliberately puts a server back into the
            // preparation state when its endpoint or headers change.  Do not
            // resend those values while saving a label or note: doing so made
            // a harmless metadata edit look like a transport change and
            // disconnected a prepared connector.
            if (!notesChanged && !nameChanged && !urlChanged && !headersChanged && input.icon === undefined && input.clear_icon !== true)
              return;
            void runManagement("editor", editor.connector.connector_id, { operation: "update_server", connectorId: editor.connector.connector_id, serverId: server.server_id, input: {
              ...(input.icon === undefined ? {} : { icon: input.icon }),
              ...(input.clear_icon === true ? { clear_icon: true as const } : {}),
              expected_state_version: server.state_version,
              ...(nameChanged ? { display_name: input.display_name } : {}),
              ...(urlChanged ? { server_url: input.server_url } : {}),
              ...(notesChanged ? input.notes ? { notes: input.notes } : { clear_notes: true } : {}),
              ...(input.header_upserts.length ? { header_upserts: input.header_upserts } : {}),
              ...(input.header_removals.length ? { header_removals: input.header_removals } : {}),
            } });
          }}
          {...(startTrial === null ? {} : { onTrial: () => {
            if (!editor?.server || !admitted || ownerRef.current !== owner || !connectorIntent ||
              editorWindow.current?.intent !== connectorIntent.window || !preparation.recoveryReady() ||
              preparation.getSnapshot().some(item => item.serverId === editor.server!.server_id && item.kind !== "rejected") || management.isBlocked(editor.connector.connector_id) ||
              editor.server.availability !== "available" || editor.connector.availability !== "available" ||
              editor.server.prepare_status !== "ready" || !editor.server.connection_id || !editor.connector.enabled || editor.connector.status !== "active") return false;
            if (!startTrial({ connectionId: editor.server.connection_id, name: editor.server.display_name })) return false;
            resetEditor();
            return true;
          } })}
          onPrepare={() => {
            if (!editor?.server || !admitted || ownerRef.current !== owner || !preparation.available) return;
            const target = { serverId: editor.server.server_id, connectorId: editor.connector.connector_id,
              version: editor.server.state_version };
            const window = editorWindow.current;
            if (!window || window.intent !== connectorIntent.window) return;
            const boundary = { subject: identity, admitted, generation: readGeneration };
            const current = () => ownerRef.current === owner && editorWindow.current === window;
            setActionError(false);
            if (preparation.canInspect(target.serverId) && !preparation.canResume(target.serverId, window.controller.signal)) {
              void preparation.inspect(target.serverId, target.connectorId, boundary, window.controller.signal, window.intent).then(inspected => {
                if (current() && !inspected) setActionError(true);
              }).catch(() => { if (current()) setActionError(true); });
              return;
            }
            void preparation.prepare(target, boundary, window.controller.signal).then(confirmed => {
              if (!current()) return;
              if (confirmed) { preparation.finish(target.serverId, boundary); resetEditor(); }
              else if (preparation.getSnapshot().find(item => item.serverId === target.serverId)?.kind !== "unknown") setActionError(true);
            }).catch(() => { if (current()) setActionError(true); });
          }}
          onDisconnect={() => {
            if (!editor) return;
            void runManagement("editor", editor.connector.connector_id, { operation: "disconnect", connectorId: editor.connector.connector_id, ...(editor.server ? { serverId: editor.server.server_id } : {}), input: { expected_state_version: editor.connector.state_version } });
          }}
          onDeleteIntent={() => editor && setDeleteId(editor.connector.connector_id)}
          onCancelDelete={() => setDeleteId(null)}
          onDelete={() => {
            if (!editor?.server) return;
            void runManagement("editor", editor.connector.connector_id, { operation: "delete_server", connectorId: editor.connector.connector_id, serverId: editor.server.server_id, input: { expected_state_version: editor.server.state_version } });
          }}
        />
      ) : null}
      <McpConnectorEditorDialog
        open={Boolean(connectorIntent?.entered && !connectorIntent.serverId)}
        pendingError={admitted && (actionError || connectorState.error || (connectorProjection !== undefined && !selectedConnector))}
        onRetryPending={() => { if (ownerRef.current !== owner || !admitted) return; setActionError(false); reload("connectors"); setDetailRetry(value => value + 1); }}
        editor={
          editor?.server ? null : editor
        }
        // Connection rows without a private server do not need a remote
        // configuration read. A custom MCP stays on the list until its typed
        // detail is ready; no generic loading dialog exists in this path.
        displayName={displayName}
        description={description}
        actionId={actionId}
        actionError={actionError || managementState?.kind === "rejected"}
        deleteId={deleteId}
        admitted={admitted}
        managementCommand={managementState}
        onResumeManagement={() => { if (connectorIntent) void runManagement("editor", connectorIntent.connectorId); }}
        providersByKey={providersByKey}
        surfaceRef={surfaceRef}
        returnFocusRef={editorReturnFocusRef}
        onDisplayNameChange={value => { if (!managementState || managementState.kind === "rejected") setDisplayName(value); }}
        onDescriptionChange={value => { if (!managementState || managementState.kind === "rejected") setDescription(value); }}
        onSubmit={submitEdit}
        onClose={resetEditor}
        onDeleteIntent={setDeleteId}
        onCancelDelete={() => setDeleteId(null)}
        onRetryAuthorization={(connectorId, serverId) => {
          const connector = connectors.find(
            (candidate) => candidate.connector_id === connectorId,
          );
          if (connector) restartAuthorization(connector, serverId);
        }}
        onToggleEnabled={(editorValue) => void runManagement("editor", editorValue.connector.connector_id, { operation: "set_enabled", connectorId: editorValue.connector.connector_id, ...(editorValue.connector.server_id ? { serverId: editorValue.connector.server_id } : {}), input: { enabled: !editorValue.connector.enabled, expected_state_version: editorValue.connector.state_version } })}
        onDelete={(editorValue) => void runManagement("editor", editorValue.connector.connector_id, { operation: "disconnect", connectorId: editorValue.connector.connector_id, ...(editorValue.connector.server_id ? { serverId: editorValue.connector.server_id } : {}), input: { expected_state_version: editorValue.connector.state_version } })}
      />
      <McpProviderDetailDialog
        open={selectedProviderKey !== null}
        pendingError={admitted && (providerDetail.error || providerConnectionDetail.error)}
        onRetry={() => { if (ownerRef.current !== owner || !admitted) return; setDetailRetry(value => value + 1); reload("providers"); reload("connectors"); }}
        admitted={admitted}
        creationCommand={providerCreationState}
        onResumeCreation={() => { if (selectedProvider) connectProvider(selectedProvider); }}
        managementCommand={providerManagementState}
        onResumeManagement={() => { if (selectedProviderConnectionId) void runManagement("provider", selectedProviderConnectionId); }}
        provider={selectedProvider}
        connection={selectedProviderConnection}
        {...(resolvingDirectory ? { connectionLookup: { connections: directoryConnections, complete: relations.complete, error: relations.error, retry: relations.retry },
          onSelectConnection: (connection: McpConnector) => {
            if (!relations.complete || relations.error || ownerRef.current !== owner || !admitted ||
              !directoryConnections.some(item => item.connector_id === connection.connector_id)) return;
            const target = providerReturnFocusRef.current;
            if (!target) return;
            if (connection.server_id) { setSelectedProviderKey(null); setSelectedProviderConnectionId(null); }
            beginEdit(connection, target, true);
          } } : {})}
        actionId={actionId}
        actionError={actionError || providerManagementState?.kind === "rejected"}
        returnFocusRef={providerReturnFocusRef}
        onClose={() => {
          setSelectedProviderKey(null);
          setSelectedProviderConnectionId(null);
          setActionId(null);
          setActionError(false);
        }}
        onConnect={(provider) =>
          connectProvider(provider, () => {
            setSelectedProviderKey(null);
            if (settingsLayout) setCatalogOpen(false);
            else setView("connections");
          })
        }
        onReconnect={(connection, provider) => {
          const serverId = provider.connection_server_id;
          if (serverId) restartAuthorization(connection, serverId);
        }}
        onToggleEnabled={(connection) => void runManagement("provider", connection.connector_id, { operation: "set_enabled", connectorId: connection.connector_id, ...(connection.server_id ? { serverId: connection.server_id } : {}), input: { enabled: !connection.enabled, expected_state_version: connection.state_version } })}
        onRemoveConnection={(connection) => void runManagement("provider", connection.connector_id, { operation: "disconnect", connectorId: connection.connector_id, ...(connection.server_id ? { serverId: connection.server_id } : {}), input: { expected_state_version: connection.state_version } })}
        {...(onPrompt ? { onPrompt: (prompt: string) => { if (ownerRef.current === owner && admitted) onPrompt(prompt); } } : {})}
      />
      {selectedCustomApiId ? (
        <CustomApiDetailDialog
          iconClient={client.mcpIcons} iconBoundary={commandBoundary}
          key={selectedCustomApiId}
          profile={selectedCustomApi}
          busy={apiCommandState?.kind === "running"}
          admitted={admitted}
          command={apiCommandState}
          canUpdate={apiManagement.canUpdate}
          canRemove={apiManagement.canRemove}
          onResume={() => { void runApiManagement(); }}
          pendingError={admitted && apiDetail.error}
          onRetry={() => { if (ownerRef.current === owner && admitted) customApiState.reload(); setDetailRetry(value => value + 1); }}
          actionError={apiCommandState?.kind === "rejected"}
          returnFocusRef={editorReturnFocusRef}
          onClose={() => setApiIntent(null)}
          onSave={(input) => {
            if (!selectedCustomApi) return;
            void runApiManagement({ operation: "update", profileId: selectedCustomApi.profile_id, input });
          }}
          onDelete={() => {
            if (!selectedCustomApi) return;
            void runApiManagement({ operation: "remove", profileId: selectedCustomApi.profile_id, input: { expected_state_version: selectedCustomApi.state_version } });
          }}
        />
      ) : null}
    </section>
  );
}

function ProjectionPending({ view }: { view: McpProjectionView }) {
  const t = useT();
  return (
    <div
      className={
        view === "connections"
          ? styles.pendingConnections
          : styles.pendingCatalog
      }
      aria-busy="true"
    >
      <span className="sr-only" role="status">
        {t("mcp.loading")}
      </span>
      <div className={styles.projectionSkeleton} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function ProjectionError({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <Alert variant="destructive" role="alert" className={styles.alert}>
      <AlertDescription>{t("mcp.loadError")}</AlertDescription>
      <Button type="button" variant="outline" onClick={onRetry}>
        {t("mcp.retry")}
      </Button>
    </Alert>
  );
}

function ActionError({ onRetry }: { onRetry?: () => void }) {
  const t = useT();
  return (
    <Alert variant="destructive" role="alert" className={styles.alert}>
      <AlertDescription>{t("mcp.actionFailed")}</AlertDescription>
      {onRetry ? <Button type="button" variant="outline" onClick={onRetry}>{t("mcp.retry")}</Button> : null}
    </Alert>
  );
}
