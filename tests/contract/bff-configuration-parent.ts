// Test-only exact additive inverse. No runtime compatibility path.
import {createHash} from "node:crypto";
const proof={
  "current_sha256": "4db8bab6159a2f36061f8b292fba9074ea2614adab2a1489bf9d1b3b066b6fe3",
  "parent_sha256": "a902a20ad95e46c01bfc8f5a80260c14565cfe557137759d5ecd42bc1a60f7c2",
  "operations": [
    "listAdminModelProviders",
    "createAdminModelProvider",
    "getAdminModelProviderCreation",
    "listAdminModelDefinitions",
    "createAdminModelDefinition",
    "listAdminModelFeatures",
    "publishAdminModelRevision",
    "updateAdminModelLabel",
    "createAdminModelRevision",
    "createAdminModelLabel"
  ],
  "inverse": [
    {
      "at": 3,
      "count": 1,
      "current_sha256": "888214c3bf925c9c0ce758f49ea69005b54b0b883f781bdd897bf7a075e58f4c",
      "previous": "  version: 21.0.0\n"
    },
    {
      "at": 3084,
      "count": 67,
      "current_sha256": "a2583919bfcf5ca7522d25fc2047cd06eac573d88be45e1c9c157c3a24002875",
      "previous": ""
    },
    {
      "at": 3180,
      "count": 67,
      "current_sha256": "23beb5ea7010dafb60c870e5d1922eabbbb13c30697b1e982c97897c6fd23f86",
      "previous": ""
    },
    {
      "at": 13580,
      "count": 541,
      "current_sha256": "3234c77ed399d51adbb681cc8b7574b168dd31522d3a0672b3c4d15bf851ac93",
      "previous": ""
    },
    {
      "at": 14560,
      "count": 396,
      "current_sha256": "6e94b0b422fb59cb4a176f9d2d3bbebd922ec4304d6f080acc6e7338d0722222",
      "previous": ""
    }
  ],
  "current_inventory_sha256": "387a209ef237d0844347ba5f12dd341e4a33c29dcfb7c309d947724e8c38d1e1",
  "parent_inventory_sha256": "463376c78cf549fc35ded0d27ec4fe322edda42109867818a740300b81f15452"
} as const;
const hash=(v:Uint8Array|string)=>createHash("sha256").update(v).digest("hex");
const projectUnionAddition =
  " Personal and project installations form a union when project_id is present; the complete exact project installation takes precedence for the same series, including disabled installations. Personal-only items remain; no latest substitution, automatic upgrade or execution authorization. Both scopes share the request deadline, the result remains limited to 1000 items, and current project access is rechecked before disclosure."
function restoreProjectUnionPatch(bytes: Uint8Array): Buffer {
  const source = Buffer.from(bytes).toString("utf8")
  if (!/^  version: 21\.1\.1$/mu.test(source)) throw Error("Public21.1.1 fixed version drift")
  const operation = source.match(/^  \/v1\/skill\.list:\n    get:\n(?:(?!^  \/)[\s\S])*/mu)?.[0]
  const description = operation?.match(/^      description: (.+)$/mu)?.[1]
  if (source.split(projectUnionAddition).length !== 2 || !description?.endsWith(projectUnionAddition))
    throw Error("Public21.1.1 project list description drift")
  const restored = source.replace(projectUnionAddition, "").replace(/^  version: 21\.1\.1$/mu, "  version: 21.1.0")
  if (hash(restored) !== proof.current_sha256) throw Error("Public21.1.1 exact model parent drift")
  return Buffer.from(restored)
}
export function restorePublic21(bytes:Uint8Array):Buffer {
 bytes=restoreProjectUnionPatch(bytes);
 if(hash(bytes)!==proof.current_sha256)throw Error("Public21.1 fixed source drift");
 const lines=Buffer.from(bytes).toString("utf8").split(/(?<=\n)/u);
 for(const h of [...proof.inverse].reverse()){
  if(hash(lines.slice(h.at,h.at+h.count).join(""))!==h.current_sha256)throw Error("Public21.1 inverse drift");
  lines.splice(h.at,h.count,h.previous);
 }
 const parent=Buffer.from(lines.join(""));if(hash(parent)!==proof.parent_sha256)throw Error("Public21 exact parent drift");return parent;
}
