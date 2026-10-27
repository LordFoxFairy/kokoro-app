import { afterEach, expect, it, vi } from "vitest"
import { projectDeletionBrowserHeadersValid } from "@/contract/project-deletion"
import { projectRenameBrowserCacheControl } from "@/contract/project-rename"
import { getProjectResource, deleteProjectResource } from "@/features/app/project-resource-access"
import { deleteProject, readProjectDeletion } from "@/features/app/project-delete"
const projectId = "project_12345678-1234-1234-1234-123456789abc"
const resource = { asset_id: "asset-one", filename: "notes.txt", mime_type: "text/plain", size_bytes: "3", content_sha256: "a".repeat(64), scan_state: "clean" }
const response = (value: unknown, status = 200, cache = projectRenameBrowserCacheControl) => new Response(JSON.stringify(value), {
 status, headers: { "content-type": "application/json;charset=utf-8", "cache-control": cache },
})
afterEach(() => vi.restoreAllMocks())
it("accepts the deployed private max-age0 browser profile for resource metadata/delete and Project delete/status", async () => {
 expect(projectRenameBrowserCacheControl).toBe("private, no-store, max-age=0")
 expect(projectDeletionBrowserHeadersValid(new Headers({"content-type":"application/json;charset=utf-8","cache-control":projectRenameBrowserCacheControl}))).toBe(true)
 vi.spyOn(globalThis,"fetch").mockResolvedValueOnce(response({data:{resource},meta:{request_id:"r"}})).mockResolvedValueOnce(response({data:{asset_id:resource.asset_id,deleted_at:"2026-10-27T00:00:00.000Z",replayed:false},meta:{request_id:"r"}})).mockResolvedValueOnce(response({data:{project_id:projectId,logical_release_state:"pending",physical_cleanup_state:"pending"}},202)).mockResolvedValueOnce(response({data:{project_id:projectId,logical_release_state:"released",physical_cleanup_state:"pending"}}))
 const signal=new AbortController().signal
 expect((await getProjectResource(projectId,resource.asset_id,signal)).asset_id).toBe(resource.asset_id)
 await expect(deleteProjectResource({projectRef:projectId,assetId:resource.asset_id,key:"original-resource-key",body:null},signal)).resolves.toBeUndefined()
 expect((await deleteProject({projectId,idempotencyKey:"original-project-key",body:null},signal)).project_id).toBe(projectId)
 expect((await readProjectDeletion(projectId,signal)).logical_release_state).toBe("released")
})
it.each(["private, max-age=0","public, no-store, max-age=0","private, no-store, max-age=60","private, no-store","no-store","public, max-age=60"])("rejects unsafe or incomplete browser cache profile %s", async cache => {
 expect(projectDeletionBrowserHeadersValid(new Headers({"content-type":"application/json;charset=utf-8","cache-control":cache}))).toBe(false)
 vi.spyOn(globalThis,"fetch").mockResolvedValueOnce(response({data:{resource},meta:{request_id:"r"}},200,cache)).mockResolvedValueOnce(response({data:{project_id:projectId,logical_release_state:"pending",physical_cleanup_state:"pending"}},202,cache))
 await expect(getProjectResource(projectId,resource.asset_id,new AbortController().signal)).rejects.toMatchObject({code:"invalid_response",verifiedOwner:false})
 await expect(deleteProject({projectId,idempotencyKey:"original-project-key",body:null},new AbortController().signal)).rejects.toMatchObject({code:"invalid_headers",verifiedOwner:false})
})
it("admits a real resource GET with proxy-enforced cache headers instead of disabling the detail", async () => {
 vi.spyOn(globalThis,"fetch").mockResolvedValueOnce(response({data:{resource},meta:{request_id:"r"}}))
 await expect(getProjectResource(projectId,resource.asset_id,new AbortController().signal)).resolves.toEqual(resource)
})
