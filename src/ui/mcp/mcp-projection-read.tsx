"use client";

import { type FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { HubClient } from "@/hub/client";
import type {
  McpConnector,
  McpConnectorProvider,
} from "@/hub/mcp-connector.schema";
import { useT } from "@/i18n/context";

import { useCustomApiManagementCommands, useMcpManagementCommands, useMcpPreparationCommands } from "./connector-command-context";
import { McpConnectionList } from "./mcp-connection-list";
import { McpConnectorEditorDialog } from "./mcp-connector-editor-dialog";
import { CustomMcpDetailDialog } from "./custom-mcp-detail-dialog";
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
import { useMcpProviderConnection } from "./use-mcp-provider-connection";
import { useCustomApiProjection } from "./use-custom-api-projection";
import { invalidateMcpConnectorProjection, useMcpProjection } from "./use-mcp-projection";

import type { CustomApiManagementIntent } from "./custom-api-management-commands";

import type { McpManagementIntent } from "./mcp-management-commands";

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
}) {
  const t = useT();
  const preparation = useMcpPreparationCommands(client, identity);
  const preparationStates = useSyncExternalStore(preparation.subscribe, preparation.getSnapshot, preparation.getSnapshot);
  const apiManagement = useCustomApiManagementCommands(client, identity);
  const apiManagementStates = useSyncExternalStore(apiManagement.subscribe, apiManagement.getSnapshot, apiManagement.getSnapshot);
  const management = useMcpManagementCommands(client, identity);
  const managementStates = useSyncExternalStore(management.subscribe, management.getSnapshot, management.getSnapshot);
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
  const [editor, setEditor] = useState<McpConnectorEditor | null>(null);
  // Only exact locators and typed input survive an admission recheck.
  const [connectorIntent, setConnectorIntent] = useState<{ connectorId: string; serverId?: string; entered: boolean; window: object } | null>(null);
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
  const [providerWindowToken, setProviderWindowToken] = useState<object>({});
  const providerWindow = useRef<{ intent: object; controller: AbortController } | null>(null);
  const [selectedProviderKey, setSelectedProviderKey] = useState<string | null>(null);
  const [selectedProviderConnectionId, setSelectedProviderConnectionId] = useState<string | null>(null);
  useLayoutEffect(() => {
    const wait = selectedProviderKey ? { intent: providerWindowToken, controller: new AbortController() } : null;
    providerWindow.current = wait;
    return () => { if (providerWindow.current === wait) providerWindow.current = null; wait?.controller.abort(); };
  }, [providerWindowToken, selectedProviderKey, owner]);
  const managementState = managementStates.find(item => item.connectorId === connectorIntent?.connectorId);
  const providerManagementState = managementStates.find(item => item.connectorId === selectedProviderConnectionId);
  const privateAuthorization = usePrivateMcpAuthorization({ client, identity, admitted, readGeneration,
    intent: connectorIntent,
    blocked: Boolean((managementState && managementState.kind !== "rejected") || (preparationState && preparationState.kind !== "rejected")),
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
  const [detailRetry, setDetailRetry] = useState(0);
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
    setEditor(null);
    setActionId(null);
    setActionError(false);
    setDeleteId(null);
    setConfirmedRemovedConnectorIds(new Set());
  }
  const surfaceRef = useRef<HTMLElement | null>(null);
  const editorReturnFocusRef = useRef<HTMLElement | null>(null);
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
    admitted,
    readGeneration,
    cursor,
    view,
    connectorRefreshKey: refreshKey,
  });
  const customApiState = useCustomApiProjection({
    client,
    identity,
    admitted,
    readGeneration,
    refreshKey,
  });

  // Provider card artwork is rendered from owner-owned `cover_image_url` in
  // McpProviderDirectory; this coordinator never substitutes local assets.
  const directory = useMcpProviderDirectory({ client, identity, admitted, readGeneration,
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
  const connectedProviderKeys = new Set(
    connectors
      .filter((connector) => connector.status === "active")
      .map((connector) => connector.provider_key),
  );
  const customApis = customApiState.data?.items ?? [];
  const providerConnectionDetail = useMcpProviderConnection({ client, identity, admitted, readGeneration,
    connectorId: selectedProviderConnectionId, providerKey: selectedProviderKey,
    known: view === "connections" && !connectorState.loading && !connectorState.error
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
    if (operation === "disconnect" || operation === "delete_server") hideConfirmedRemovedConnector(connectorId);
    if (origin === "editor") resetEditor();
    else { setSelectedProviderKey(null); setSelectedProviderConnectionId(null); }
  };
  const beginEdit = (connector: McpConnector, returnFocus: HTMLElement) => {
    if (!owner.admitted || ownerRef.current !== owner) return;
    editorReturnFocusRef.current = returnFocus;
    providerReturnFocusRef.current = returnFocus;
    setDeleteId(null);
    setActionError(false);
    setEditor(null);
    if (!connector.server_id && connector.connector_type === "mcp") {
      setProviderWindowToken({});
      setSelectedProviderConnectionId(connector.connector_id);
      setSelectedProviderKey(connector.provider_key);
      setConnectorIntent(null);
      return;
    }
    setConnectorIntent({ connectorId: connector.connector_id, ...(connector.server_id ? { serverId: connector.server_id } : {}), entered: false, window: {} });
  };
  const connectorId = connectorIntent?.connectorId;
  const serverId = connectorIntent?.serverId;
  const selectedConnector = connectorProjection?.items.find(item => item.connector_id === connectorId);
  const providerReady = Boolean(serverId) || providerProjection !== undefined;
  const selectedConnectorProvider = serverId ? undefined : providers.find(item => item.provider_key === selectedConnector?.provider_key);
  useEffect(() => {
    if (!admitted || !connectorId || !selectedConnector || (!serverId && !providerReady)) return;
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
  }, [admitted, client, connectorId, serverId, selectedConnector, selectedConnectorProvider, providerReady, detailRetry, owner]);
  const connectProvider = (
    provider: McpConnectorProvider,
    onSuccess?: () => void,
  ) => {
    void runAction(
      `connect:${provider.provider_key}`,
      async () => {
        let connector: McpConnector | undefined;
        if (provider.connection_server_id !== undefined) {
          await startOAuthPopup(async (signal) => {
            connector = await client.createMcpConnector({
              provider_key: provider.provider_key,
              connector_type: "mcp",
              display_name: provider.display_name,
              description: provider.description ?? "",
            });
            invalidateMcpConnectorProjection(client, identity);
            if (signal.aborted || ownerRef.current !== owner) throw new Error("MCP command retired");
            if (connector.status !== "pending")
              throw new Error("connector does not require authorization");
            const started = await client.beginMcpConnectorAuthorization(
              connector.connector_id,
              {
                server_id: provider.connection_server_id!,
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
        } else {
          connector = await client.createMcpConnector({
            provider_key: provider.provider_key,
            connector_type: "mcp",
            display_name: provider.display_name,
            description: provider.description ?? "",
          });
          if (!connector) {
            throw new Error("connector authorization server is unavailable");
          }
        }
        if (!connector) {
          throw new Error("connector creation did not return a connector");
        }
        return connector;
      },
      (result) => {
        if (provider.connection_server_id !== undefined) {
          // Keep the issuing detail alive while the external authorization
          // window is active. Closing it (or opening another detail) retires
          // that wait instead of allowing a stale popup to navigate later.
          setSelectedProviderConnectionId((result as McpConnector).connector_id);
        } else onSuccess?.();
      },
    );
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
    setProviderWindowToken({});
    setSelectedProviderConnectionId(null);
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
      aria-busy={refreshing || undefined}
    >
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
        <ActionError {...(connectorIntent ? { onRetry: () => { if (!admitted || ownerRef.current !== owner) return; setActionError(false); if (!selectedConnector || connectorState.error) reload("connectors"); else setDetailRetry(value => value + 1); } } : {})} />
      ) : null}

      {view === "catalog" ? (
        <div className={styles.content}>
          <McpProviderDirectory
            providers={directory.items}
            hasMore={directory.hasMore}
            loading={directory.loading}
            onLoadMore={directory.loadMore}
            {...(directory.items.length === 0 && (!admitted || directory.loading) ? { resultsPlaceholder: <ProjectionPending view="catalog" /> } : {})}
            query={providerQuery}
            onQueryChange={setProviderQuery}
            showSearch={embedded}
            presentation={embedded ? "plaza" : "dialog"}
            connectedProviderKeys={connectedProviderKeys}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            onSelectProvider={openProvider}
          />
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
      {view === "connections" && connectorProjection ? (
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
            onSelectCustomApi={(profile, trigger) => {
              editorReturnFocusRef.current = trigger;
              setActionError(false);
              setApiIntent({ profileId: profile.profile_id, window: {} });
            }}
            previousEnabled={history.length > 0 && actionId === null}
            nextEnabled={
              Boolean(connectorProjection.next_cursor) && actionId === null
            }
            onPrevious={() => {
              const previous = history.at(-1) ?? null;
              setRefreshError(false);
              setHistory((items) => items.slice(0, -1));
              setCursor(previous);
            }}
            onNext={() => {
              const next = connectorProjection.next_cursor;
              if (!next || next === cursor || history.includes(next))
                return setRefreshError(true);
              setRefreshError(false);
              setHistory((items) => [...items, cursor]);
              setCursor(next);
            }}
          />
          {customApiState.loadMoreError ? <Alert variant="destructive" role="alert"><AlertDescription>{t("mcp.loadError")}</AlertDescription></Alert> : null}
          {customApiState.hasMore ? <Button type="button" variant="outline" disabled={customApiState.loadingMore}
            aria-busy={customApiState.loadingMore} onClick={() => void customApiState.loadMore()}>
            {customApiState.loadingMore ? t("mcp.loading") : t("rail.loadMore")} · API
          </Button> : null}
          {customApiState.loadMoreError && !customApiState.hasMore ? <Button type="button" variant="outline" onClick={customApiState.reload}>{t("mcp.retry")}</Button> : null}
        </div>
      ) : null}

      </div>
      <McpProviderCatalogDialog
        open={catalogOpen}
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
      {connectorIntent?.serverId && (connectorIntent.entered || editor?.server) ? (
        <CustomMcpDetailDialog
          key={connectorIntent.serverId}
          connector={editor?.server ? editor.connector : null}
          server={editor?.server ?? null}
          pendingError={admitted && (actionError || connectorState.error || (connectorProjection !== undefined && !selectedConnector))}
          onRetry={() => { if (ownerRef.current !== owner || !admitted) return; setActionError(false); if (!selectedConnector || connectorState.error) reload("connectors"); else setDetailRetry(value => value + 1); }}
          admitted={admitted}
          managementCommand={managementState}
          onResumeManagement={() => { if (connectorIntent) void runManagement("editor", connectorIntent.connectorId); }}
          preparationState={preparationState?.kind ?? "idle"}
          preparationFailure={preparationState?.failure}
          actionId={preparationState?.kind === "running" ? connectorIntent.connectorId : actionId}
          actionError={actionError || managementState?.kind === "rejected" || privateAuthorization.error}
          authorizationBusy={privateAuthorization.busy}
          onAuthorize={() => {
            if (!editor?.server || !connectorIntent || ownerRef.current !== owner || !admitted ||
              editorWindow.current?.intent !== connectorIntent.window || management.isBlocked(editor.connector.connector_id)) return;
            const preparing = preparation.getSnapshot().find(item => item.serverId === editor.server!.server_id);
            if (preparing && preparing.kind !== "rejected") return;
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
            if (!notesChanged && !nameChanged && !urlChanged && !headersChanged)
              return;
            void runManagement("editor", editor.connector.connector_id, { operation: "update_server", connectorId: editor.connector.connector_id, serverId: server.server_id, input: {
              expected_state_version: server.state_version,
              ...(nameChanged ? { display_name: input.display_name } : {}),
              ...(urlChanged ? { server_url: input.server_url } : {}),
              ...(notesChanged ? input.notes ? { notes: input.notes } : { clear_notes: true } : {}),
              ...(input.header_upserts.length ? { header_upserts: input.header_upserts } : {}),
              ...(input.header_removals.length ? { header_removals: input.header_removals } : {}),
            } });
          }}
          onPrepare={() => {
            if (!editor?.server || !admitted || ownerRef.current !== owner || !preparation.available) return;
            const target = { serverId: editor.server.server_id, connectorId: editor.connector.connector_id,
              version: editor.server.state_version };
            const window = editorWindow.current;
            if (!window || window.intent !== connectorIntent.window) return;
            const boundary = { subject: identity, admitted, generation: readGeneration };
            const current = () => ownerRef.current === owner && editorWindow.current === window;
            setActionError(false);
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
        managementCommand={providerManagementState}
        onResumeManagement={() => { if (selectedProviderConnectionId) void runManagement("provider", selectedProviderConnectionId); }}
        provider={selectedProvider}
        connection={selectedProviderConnection}
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
