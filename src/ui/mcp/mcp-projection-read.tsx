"use client";

import { type FormEvent, useRef, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { HubClient } from "@/hub/client";
import {
  customApiProfileSchema,
  type CustomApiProfile,
} from "@/hub/custom-api.schema";
import type {
  McpConnector,
  McpConnectorProvider,
} from "@/hub/mcp-connector.schema";
import { useT } from "@/i18n/context";

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
import { useCustomApiProjection } from "./use-custom-api-projection";
import { useMcpProjection } from "./use-mcp-projection";

/**
 * Product-level MCP surface coordinator. It owns user intent and owner commands;
 * projection reads, card lists and modal presentation stay in their dedicated
 * components so each can evolve independently without a second data source.
 */
export function McpProjectionRead({
  client,
  identity,
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
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<string | null>>([]);
  const [view, setView] = useState<McpProjectionView>(initialView);
  const [refreshError, setRefreshError] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);
  const [editor, setEditor] = useState<McpConnectorEditor | null>(null);
  const [selectedProvider, setSelectedProvider] =
    useState<McpConnectorProvider | null>(null);
  const [selectedProviderConnection, setSelectedProviderConnection] =
    useState<McpConnector | null>(null);
  const [selectedCustomApi, setSelectedCustomApi] =
    useState<CustomApiProfile | null>(null);
  const [providerQuery, setProviderQuery] = useState("");
  const [connectorQuery, setConnectorQuery] = useState("");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<
    "all" | keyof typeof MCP_CATEGORY_MESSAGES
  >("all");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  // Once the owner confirms deletion, hide that row immediately rather than
  // leaving a stale card visible while the background projection refreshes.
  // This is a confirmed projection transition, not an optimistic fake.
  const [confirmedRemovedConnectorIds, setConfirmedRemovedConnectorIds] =
    useState<ReadonlySet<string>>(() => new Set());
  const [editorLoading, setEditorLoading] = useState(false);
  const surfaceRef = useRef<HTMLElement | null>(null);
  const editorReturnFocusRef = useRef<HTMLElement | null>(null);
  const catalogReturnFocusRef = useRef<HTMLElement | null>(null);
  const providerReturnFocusRef = useRef<HTMLElement | null>(null);
  const startOAuthPopup = useMcpOAuthPopup({
    ...(onAuthorizationNavigate ? { onAuthorizationNavigate } : {}),
    onReload: () => reload("connectors"),
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
    cursor,
    view,
    connectorRefreshKey: refreshKey,
  });
  const customApiState = useCustomApiProjection({
    client,
    identity,
    refreshKey,
  });

  // Provider card artwork is rendered from owner-owned `cover_image_url` in
  // McpProviderDirectory; this coordinator never substitutes local assets.
  const providers = providerProjection?.items ?? [];
  const connectors = (connectorProjection?.items ?? []).filter(
    (connector) => !confirmedRemovedConnectorIds.has(connector.connector_id),
  );
  const connectedProviderKeys = new Set(
    connectors
      .filter((connector) => connector.status === "active")
      .map((connector) => connector.provider_key),
  );
  const customApis = customApiState.data?.items ?? [];
  const providersByKey = new Map(
    providers.map((provider) => [provider.provider_key, provider]),
  );
  const providerRefreshing =
    providerState.loading || providerState.requestIdentity !== identity;
  const connectorRefreshing =
    connectorState.loading || connectorState.requestIdentity !== identity;
  const refreshing =
    view === "catalog" ? providerRefreshing : connectorRefreshing;

  const hideConfirmedRemovedConnector = (connectorId: string) => {
    setConfirmedRemovedConnectorIds((current) => {
      if (current.has(connectorId)) return current;
      return new Set([...current, connectorId]);
    });
  };

  const resetEditor = () => {
    setEditor(null);
    setDeleteId(null);
    setDisplayName("");
    setDescription("");
  };
  const runAction = async (
    id: string,
    action: () => Promise<unknown>,
    onSuccess?: (result: unknown) => void,
  ) => {
    setActionId(id);
    setActionError(false);
    try {
      const result = await action();
      resetEditor();
      onSuccess?.(result);
      reload("connectors");
    } catch {
      setActionError(true);
    } finally {
      setActionId(null);
    }
  };
  const beginEdit = async (
    connector: McpConnector,
    returnFocus: HTMLElement,
  ) => {
    editorReturnFocusRef.current = returnFocus;
    setDeleteId(null);
    setActionError(false);
    // Do not manufacture an intermediate dialog while retrieving owner-only
    // configuration. Manus keeps the list steady and opens the actual detail
    // once its data is ready; the old branch opened a generic “Edit / Loading”
    // dialog that visibly jumped between two unrelated layouts.
    const isCustomMcp = Boolean(connector.server_id);
    setEditor(null);
    setEditorLoading(true);
    try {
      const server =
        connector.server_id && client.getPrivateMcpServer
          ? await client.getPrivateMcpServer(connector.server_id)
          : undefined;
      if (!server) {
        const provider = providersByKey.get(connector.provider_key);
        if (provider) {
          setSelectedProviderConnection(connector);
          setSelectedProvider(provider);
          return;
        }
      }
      setDisplayName(server?.display_name ?? connector.display_name ?? "");
      setDescription(server?.notes ?? connector.description ?? "");
      setEditor({ kind: "edit", connector, ...(server ? { server } : {}) });
    } catch {
      // Do not fall back to the legacy generic editor if a custom MCP read
      // fails. Keep the list stable and expose the action failure in its own
      // surface instead of presenting an editor with absent configuration.
      if (isCustomMcp) setEditor(null);
      setActionError(true);
    } finally {
      setEditorLoading(false);
    }
  };
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
      onSuccess,
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
    if (server && client.updatePrivateMcpServer) {
      void runAction(server.server_id, async () => {
        await client.updatePrivateMcpServer!(server.server_id, {
          expected_state_version: server.state_version,
          display_name: displayName.trim(),
          ...(description.trim()
            ? { notes: description.trim() }
            : { clear_notes: true }),
        });
      });
      return;
    }
    void runAction(connector.connector_id, () =>
      client.updateMcpConnector(connector.connector_id, {
        display_name: displayName.trim(),
        description: description.trim(),
        expected_state_version: connector.state_version,
      }),
    );
  };
  const openCatalog = (target?: HTMLElement) => {
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
    providerReturnFocusRef.current = trigger;
    setActionError(false);
    setSelectedProviderConnection(null);
    setSelectedProvider(provider);
  };
  return (
    <section
      ref={surfaceRef}
      className={styles.surface}
      data-testid="mcp-projection-read"
      data-embedded={embedded || undefined}
      data-settings-layout={settingsLayout || undefined}
      aria-busy={refreshing || undefined}
    >
      <header className={styles.header}>
        {settingsLayout ? null : <h2>{t("rail.navPlugins")}</h2>}
        <McpSettingsToolbar
          view={view}
          settingsLayout={settingsLayout}
          query={view === "connections" ? connectorQuery : providerQuery}
          onQueryChange={
            view === "connections" ? setConnectorQuery : setProviderQuery
          }
          showSearch={!embedded}
          onBrowse={(target) => {
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
          {...(onCreateMcp ? { onCreate: onCreateMcp } : {})}
        />
      </header>

      {view === "catalog" &&
      providerProjection === undefined &&
      providerRefreshing ? (
        <ProjectionPending view="catalog" />
      ) : null}
      {view === "catalog" && providerState.error ? (
        <ProjectionError onRetry={() => reload("providers")} />
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
      {actionError &&
      editor === null &&
      selectedProvider === null &&
      selectedCustomApi === null ? (
        <ActionError />
      ) : null}

      {view === "catalog" && providerProjection ? (
        <div className={styles.content}>
          <McpProviderDirectory
            providers={providers}
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
              setSelectedCustomApi(profile);
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
        </div>
      ) : null}

      <McpProviderCatalogDialog
        open={catalogOpen}
        {...(providerProjection ? { providers: providerProjection.items } : {})}
        loading={providerRefreshing}
        error={providerState.error}
        query={providerQuery}
        categoryFilter={categoryFilter}
        returnFocusRef={catalogReturnFocusRef}
        onOpenChange={setCatalogOpen}
        onQueryChange={setProviderQuery}
        onCategoryFilterChange={setCategoryFilter}
        onRetry={() => reload("providers")}
        onSelectProvider={openProvider}
        {...(onCreateMcp ? { onCreate: onCreateMcp } : {})}
      />
      {editor?.server ? (
        <CustomMcpDetailDialog
          key={`${editor.server.server_id}:${editor.server.state_version}`}
          connector={editor.connector}
          server={editor.server}
          actionId={actionId}
          actionError={actionError}
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
            void runAction(editor.server.server_id, () =>
              client.updatePrivateMcpServer!(editor.server!.server_id, {
                expected_state_version: editor.server!.state_version,
                ...(nameChanged ? { display_name: input.display_name } : {}),
                ...(urlChanged ? { server_url: input.server_url } : {}),
                ...(notesChanged
                  ? input.notes
                    ? { notes: input.notes }
                    : { clear_notes: true }
                  : {}),
                ...(input.header_upserts.length
                  ? { header_upserts: input.header_upserts }
                  : {}),
                ...(input.header_removals.length
                  ? { header_removals: input.header_removals }
                  : {}),
              }),
            );
          }}
          onPrepare={() => {
            if (!editor?.server || !client.preparePrivateMcpServer) return;
            void runAction(editor.connector.connector_id, () =>
              client.preparePrivateMcpServer!(
                editor.server!.server_id,
                editor.server!.state_version,
              ),
            );
          }}
          onDisconnect={() => {
            if (!editor) return;
            void runAction(
              editor.connector.connector_id,
              () =>
                client.removeMcpConnector(editor.connector.connector_id, {
                  expected_state_version: editor.connector.state_version,
                }),
              () => {
                hideConfirmedRemovedConnector(editor.connector.connector_id);
                editorReturnFocusRef.current = null;
              },
            );
          }}
          onDeleteIntent={() =>
            editor && setDeleteId(editor.connector.connector_id)
          }
          onCancelDelete={() => setDeleteId(null)}
          onDelete={() => {
            if (!editor?.server || !client.deletePrivateMcpServer) return;
            void runAction(
              editor.connector.connector_id,
              () =>
                client.deletePrivateMcpServer!(
                  editor.server!.server_id,
                  editor.server!.state_version,
                ),
              () => {
                hideConfirmedRemovedConnector(editor.connector.connector_id);
                editorReturnFocusRef.current = null;
              },
            );
          }}
        />
      ) : null}
      <McpConnectorEditorDialog
        editor={
          editor?.server || (editorLoading && editor?.connector.server_id)
            ? null
            : editor
        }
        // Connection rows without a private server do not need a remote
        // configuration read. A custom MCP stays on the list until its typed
        // detail is ready; no generic loading dialog exists in this path.
        displayName={displayName}
        description={description}
        actionId={actionId}
        actionError={actionError}
        deleteId={deleteId}
        providersByKey={providersByKey}
        surfaceRef={surfaceRef}
        returnFocusRef={editorReturnFocusRef}
        onDisplayNameChange={setDisplayName}
        onDescriptionChange={setDescription}
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
        onToggleEnabled={(editorValue) =>
          void runAction(editorValue.connector.connector_id, () =>
            client.setMcpConnectorEnabled(editorValue.connector.connector_id, {
              enabled: !editorValue.connector.enabled,
              expected_state_version: editorValue.connector.state_version,
            }),
          )
        }
        onDelete={(editorValue) =>
          void runAction(
            editorValue.connector.connector_id,
            () =>
              editorValue.server && client.deletePrivateMcpServer
                ? client.deletePrivateMcpServer(
                    editorValue.server.server_id,
                    editorValue.server.state_version,
                  )
                : client.removeMcpConnector(
                    editorValue.connector.connector_id,
                    {
                      expected_state_version:
                        editorValue.connector.state_version,
                    },
                  ),
            () => {
              hideConfirmedRemovedConnector(editorValue.connector.connector_id);
              editorReturnFocusRef.current = null;
            },
          )
        }
      />
      <McpProviderDetailDialog
        provider={selectedProvider}
        connection={selectedProviderConnection}
        actionId={actionId}
        actionError={actionError}
        returnFocusRef={providerReturnFocusRef}
        onClose={() => {
          setSelectedProvider(null);
          setSelectedProviderConnection(null);
          setActionError(false);
        }}
        onConnect={(provider) =>
          connectProvider(provider, () => {
            setSelectedProvider(null);
            if (settingsLayout) setCatalogOpen(false);
            else setView("connections");
          })
        }
        onReconnect={(connection, provider) => {
          const serverId = provider.connection_server_id;
          if (serverId) restartAuthorization(connection, serverId);
        }}
        onToggleEnabled={(connection) =>
          void runAction(connection.connector_id, () =>
            client.setMcpConnectorEnabled(connection.connector_id, {
              enabled: !connection.enabled,
              expected_state_version: connection.state_version,
            }),
          )
        }
        onRemoveConnection={(connection) =>
          void runAction(
            connection.connector_id,
            () =>
              client.removeMcpConnector(connection.connector_id, {
                expected_state_version: connection.state_version,
              }),
            () => {
              hideConfirmedRemovedConnector(connection.connector_id);
              setSelectedProvider(null);
              setSelectedProviderConnection(null);
            },
          )
        }
        {...(onPrompt ? { onPrompt } : {})}
      />
      {selectedCustomApi ? (
        <CustomApiDetailDialog
          key={`${selectedCustomApi.profile_id}:${selectedCustomApi.state_version}`}
          profile={selectedCustomApi}
          busy={actionId === selectedCustomApi.profile_id}
          actionError={actionError}
          returnFocusRef={editorReturnFocusRef}
          onClose={() => {
            setSelectedCustomApi(null);
            setActionError(false);
          }}
          onSave={(input) => {
            if (!client.updateCustomApi) return;
            void runAction(
              selectedCustomApi.profile_id,
              () =>
                client.updateCustomApi!(selectedCustomApi.profile_id, input),
              (result) => {
                // The mutation response is the owner-confirmed projection.
                // Apply it before the background re-read so immediately
                // reopening the detail cannot show the prior note/version.
                customApiState.replace(customApiProfileSchema.parse(result));
                customApiState.reload();
                setSelectedCustomApi(null);
              },
            );
          }}
          onDelete={() => {
            if (!client.removeCustomApi) return;
            void runAction(
              selectedCustomApi.profile_id,
              () =>
                client.removeCustomApi!(selectedCustomApi.profile_id, {
                  expected_state_version: selectedCustomApi.state_version,
                }),
              () => {
                customApiState.remove(selectedCustomApi.profile_id);
                customApiState.reload();
                setSelectedCustomApi(null);
                editorReturnFocusRef.current = null;
              },
            );
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

function ActionError() {
  const t = useT();
  return (
    <Alert variant="destructive" role="alert" className={styles.alert}>
      <AlertDescription>{t("mcp.actionFailed")}</AlertDescription>
    </Alert>
  );
}
