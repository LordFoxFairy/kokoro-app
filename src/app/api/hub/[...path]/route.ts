// Hub dispatch only. Keep route precedence; each concrete adapter owns its existing request boundary.
import { proxyProjectAccess } from "@/lib/server/project-access";
import { proxyProjectSkillContent } from "@/lib/server/project-skill-content";
import { proxyLibraryArtifactMutation } from "@/lib/server/library-artifact-mutation";
import { proxyLibraryFileDelete } from "@/lib/server/library-file-delete";
import { proxyProjectPins } from "@/lib/server/project-pins";
import { isProjectTaskFamily, proxyProjectTasks } from "@/lib/server/project-tasks";
import { isProjectWebsitesFamily, proxyProjectWebsites } from "@/lib/server/project-websites";
import { proxyProjectMcpRecommendations } from "@/lib/server/project-mcp-recommendations";
import { proxyMcpServerIcon } from "@/lib/server/mcp-server-icon";
import { mcpPublicationPath } from "@/hub/mcp-project-publication.schema";
import { proxyMcpProjectPublication } from "@/lib/server/mcp-project-publication";
import { proxyPersonalKnowledge } from "@/lib/server/personal-knowledge";
import { proxyProjectSkillSelection } from "@/lib/server/project-skill-selection";
import { proxyInstallation } from "@/lib/server/skill-installations";
import { NextResponse } from "next/server";
import { proxyProjectRename } from "@/lib/server/project-rename";
import { proxyMcpConnector } from "@/lib/server/mcp-connector";
import { proxyCustomApi } from "@/lib/server/custom-api";
import { proxySkillCover } from "@/lib/server/skill-cover";
import { proxyLocalSkillImport } from "@/lib/server/skill-local-import";
import { proxyGithubSkillImport } from "@/lib/server/skill-github-import";
import { proxySkillShare } from "@/lib/server/skill-share";
import { proxySkillPackage } from "@/lib/server/skill-package";
import { proxyPersonalSkillLifecycle } from "@/lib/server/personal-skill-lifecycle";
import { proxyHubBff } from "@/lib/server/hub-bff-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxyHubRequest(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  const libraryAt = path[0] === "self" ? 1 : 0;
  if (request.method === "DELETE" && path[libraryAt] === "library" && path[libraryAt + 1] === "files")
    return proxyLibraryFileDelete(request, path);
  if ((request.method === "DELETE" || request.method === "PUT") && path[libraryAt] === "library" && path[libraryAt + 1] === "artifacts")
    return proxyLibraryArtifactMutation(request, path);
  if (path[0] === "projects" && ["access", "grants"].includes(path[2] ?? "")) return proxyProjectAccess(request, path);
  if (isProjectTaskFamily(path)) return proxyProjectTasks(request, path);
  if (isProjectWebsitesFamily(path)) return proxyProjectWebsites(request, path);
  if ((path[0] === "self" && path[1] === "project-pins") || (path[0] === "projects" && path[2] === "pin") || (path[0] === "self" && path[1] === "projects" && path[3] === "pin") || (path[0] === "self" && path[1] === "self" && path[2] === "project-pins")) return proxyProjectPins(request, path);
  if (path[0] === "mcp" && path[1] === "servers" && path[3] === "icon") return proxyMcpServerIcon(request, path);
  if (mcpPublicationPath(path)) return proxyMcpProjectPublication(request, path);
  if (path.length === 3 && path[0] === "projects" && path[2] === "mcp-recommendations") return proxyProjectMcpRecommendations(request, path);
  if ((path[0] === "preferences" && path[1]?.startsWith("knowledge")) || (path[0] === "self" && path[1] === "preferences" && path[2]?.startsWith("knowledge")))
    return proxyPersonalKnowledge(request, path);
  // Retire the old browser `/self/mcp` namespace. MCP is a first-class private adapter route.
  if (path[0] === "self" && path[1] === "mcp")
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  if (path[0] === "connectors" && path[1] === "custom-apis")
    return proxyCustomApi(request, path);
  if (
    path[0] === "mcp" &&
    (path[1] === "icons" || path[1] === "servers" ||
      path[1] === "connectors" ||
      path[1] === "providers" ||
      path[1] === "authorization" ||
      (path[1] === "connections" &&
        (path.length > 2 || request.method !== "GET")))
  )
    return proxyMcpConnector(request, path);
  if (
    path[0] === "self" &&
    path[1] === "skills" &&
    (request.method === "DELETE" && path.length === 3 || path.length === 4 && ["versions", "withdraw"].includes(path[3] ?? ""))
  )
    return proxyPersonalSkillLifecycle(request, path);
  if ((path[0] === "projects" && path[2] === "skill-selection") || (path[0] === "self" && path[1] === "projects" && path[3] === "skill-selection")) return proxyProjectSkillSelection(request, path);
  if ((path[0] === "projects" && path[2] === "skills") || (path[0] === "self" && path[1] === "projects" && path[3] === "skills"))
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "cache-control": "no-store" } });
  if (path[0] === "skill-shares") return proxySkillShare(request, path);
  if (path[0] === "skills" && path[1] === "github")
    return proxyGithubSkillImport(request, path);
  if (path[0] === "skills" && path[1] === "local-imports")
    return proxyLocalSkillImport(request, path);
  if (path[0] === "projects" && path[2] === "skill-installations" && ["package", "download"].includes(path.at(-1) ?? "")) return proxyProjectSkillContent(request, path);
  if (path.at(-1) === "package" || (path[0] === "skill-installations" || path[0] === "self" && path[1] === "skills" && path[2] === "managed") && path.at(-1) === "download")
    return proxySkillPackage(request, path);
  if (path.at(-1) === "cover") return proxySkillCover(request, path);
  if (
    (path[0] === "projects" && path[2] === "name") ||
    (path[0] === "self" && path[1] === "projects" && path[3] === "name")
  )
    return proxyProjectRename(request, path);
  if (
    (path[0] === "projects" && path[2] === "skill-installations") ||
    (path[0] === "self" && path[1] === "projects" && path[3] === "skill-installations") ||
    path[0] === "skill-installations" ||
    (path[0] === "self" && path[1] === "skill-installations")
  )
    return proxyInstallation(request, path);
  return proxyHubBff(request, path);
}

export const GET = proxyHubRequest;
export const POST = proxyHubRequest;
export const PUT = proxyHubRequest;
export const PATCH = proxyHubRequest;
export const DELETE = proxyHubRequest;
