import { restoreModelDiscoveryParent } from "./bff-model-discovery-parent"
// Test-only exact Public21.2 ->21.1.1 inverse from the fixed owner artifact.
import {createHash} from "node:crypto"
const proof = {
  "profile": "personal-skill-history-public-v1",
  "parent_version": "21.1.1",
  "version": "21.2.0",
  "parent_sha256": "eff6676131081b20ba36fd4be243075c568ebd27358662a9c09fe3216b097848",
  "current_sha256": "2c56fd63faa5ed7759133046dfda147bf1d360ddfb32f7570e55df38e487f786",
  "parent_inventory_sha256": "387a209ef237d0844347ba5f12dd341e4a33c29dcfb7c309d947724e8c38d1e1",
  "current_inventory_sha256": "298efad0d55ca307791b2a5290853a2dfe8d4afe92ed592bd0e333beea421494",
  "operation_id": "listPersonalSkillVersions",
  "inverse": [
    {
      "at": 3,
      "count": 1,
      "current_sha256": "35b6e5501a43ad3643ad938e5de9154a3c5fcb64d616012ef0209c54d216d233",
      "previous": "  version: 21.1.1\n"
    },
    {
      "at": 7052,
      "count": 32,
      "current_sha256": "727fcc2ae02e5d1cd0e8deaf359ea742520c9beff38003a7a9ba91cb545906bd",
      "previous": ""
    },
    {
      "at": 18677,
      "count": 44,
      "current_sha256": "881ec2bb9e512d2aac9f4dc3b2d9e2774d79414073ff37ff9942de965183d855",
      "previous": ""
    },
    {
      "at": 24253,
      "count": 8,
      "current_sha256": "0443496eaf5a770cb8845634aa368b2bdcbac301522d8a232bc9f60fc3e8f3b2",
      "previous": ""
    }
  ]
} as const
const hash=(s:string)=>createHash("sha256").update(s).digest("hex")
// Exact inverse of the fixed Public22 confirmation increment. The historical
// Public21.2 proof below remains byte-for-byte unchanged.
const publicationProof = {
  "profile": "skill-publication-precondition-public-v1",
  "parent_version": "21.2.0",
  "version": "22.0.0",
  "parent_sha256": "2c56fd63faa5ed7759133046dfda147bf1d360ddfb32f7570e55df38e487f786",
  "current_sha256": "65019688691a6d6933146be66d4e7a1293f0dc92418a6f259a983529031b5c27",
  "inverse": [
    {
      "at": 3,
      "count": 1,
      "current_sha256": "88eb7c997b7ff4fb24299e8d2c075b202906e273cea8d6aac13285ed48ce0e2d",
      "previous": "  version: 21.2.0\n"
    },
    {
      "at": 5330,
      "count": 1,
      "current_sha256": "cb8680b8f9c3bf6e0a2c11d7b3e4b1614ff288f30b1c31c3773aab4253cf5faf",
      "previous": "        Public10 corrective preactivation command on the existing /v1 route. Requires a closed JSON audience and expected_state_version, both frozen into the same trusted owner command digest and wire. BFF fixes PERSONAL visibility and re-admits the current IAM subject and tenant on every replay. Platform alone validates the exact draft, CAS and current package/optional cover, then atomically publishes and returns its durable event receipt. Unknown ACK recovery replays the same body/key/CAS; no empty-body fallback or BFF receipt/outbox is added.\n"
    },
    {
      "at": 5339,
      "count": 1,
      "current_sha256": "5c2ed64fa69f6eff546596fd4794f96464e5e530f33be34a6819a8e0e263713a",
      "previous": "              $ref: '#/components/schemas/SkillAudienceRequest'\n"
    },
    {
      "at": 9564,
      "count": 1,
      "current_sha256": "db9072b13c1fc78aefb15a871562bfbecbe67b25e4146451b09eb25a06ecb7e7",
      "previous": "        no fallback.\n"
    },
    {
      "at": 17328,
      "count": 1,
      "current_sha256": "058499769d48f867046d95ad46816bcb0e8fde86719df48644b9cc20f50fc85b",
      "previous": ""
    },
    {
      "at": 17332,
      "count": 7,
      "current_sha256": "e74794941606cfd9d40e094f78ce6d4fc7eb5da5d6275c5f76d23538191e6bc1",
      "previous": ""
    },
    {
      "at": 17569,
      "count": 1,
      "current_sha256": "13106c2128bc873d133797277b9e4e4871638d687107ff1a436a1eab3bbb2499",
      "previous": ""
    },
    {
      "at": 17571,
      "count": 2,
      "current_sha256": "9e830b446bf9af35ff9f8684ffe098381f688b09e8ff0f0f320f43cce6054792",
      "previous": ""
    },
    {
      "at": 17615,
      "count": 37,
      "current_sha256": "ab62b31c0c84c7ba8d1842288a14ed2ea9fd4b5053291118a6a8cf4365e92841",
      "previous": ""
    }
  ]
} as const
function restorePublicationConfirmation(bytes: Uint8Array): Buffer {
 const source=Buffer.from(bytes).toString("utf8")
 if(hash(source)!==publicationProof.current_sha256)throw Error("Publication confirmation fixed source drift")
 const lines=source.split(/(?<=\n)/u)
 for(const h of [...publicationProof.inverse].reverse()){
  if(hash(lines.slice(h.at,h.at+h.count).join(""))!==h.current_sha256)throw Error("Publication confirmation inverse drift")
  lines.splice(h.at,h.count,h.previous)
 }
 const parent=lines.join("")
 if(hash(parent)!==publicationProof.parent_sha256)throw Error("Publication confirmation complete parent drift")
 return Buffer.from(parent)
}
export function restorePersonalHistory(bytes:Uint8Array):Buffer {
 bytes=restoreCreditInitializationParent(bytes)
 bytes=restorePublicIdentityMatrix(bytes)
 bytes=restoreDeletedSeries(bytes)
 bytes=restorePublicationConfirmation(bytes)
 const source=Buffer.from(bytes).toString("utf8")
 if(hash(source)!==proof.current_sha256)throw Error("Personal history fixed source drift")
 const lines=source.split(/(?<=\n)/u)
 for(const h of [...proof.inverse].reverse()){
  if(hash(lines.slice(h.at,h.at+h.count).join(""))!==h.current_sha256)throw Error("Personal history inverse drift")
  lines.splice(h.at,h.count,h.previous)
 }
 const parent=lines.join("")
 if(hash(parent)!==proof.parent_sha256)throw Error("Personal history complete parent drift")
 return Buffer.from(parent)
}

const deleteProof={
  "current": "50ce4c54225ee7e87099f2b4a8b62b13d9f3fba186dad853648601cf734c3759",
  "parent": "65019688691a6d6933146be66d4e7a1293f0dc92418a6f259a983529031b5c27",
  "inverse": [
    {
      "at": 3,
      "count": 1,
      "hash": "07908206eae194c5e6fd21718119cb75b72c98154efa7edad10ecdba775a942d",
      "previous": "  version: 22.0.0\n"
    },
    {
      "at": 5090,
      "count": 38,
      "hash": "dcb20f93afe13f2a39951a8fbb3ed0fc953ac707cfa422ad0d51505170272879",
      "previous": ""
    },
    {
      "at": 17680,
      "count": 34,
      "hash": "fbeb7d1a26c63e1f9df665f94b64be206fb3e3caa1ef4649815bbafa0f579615",
      "previous": ""
    },
    {
      "at": 21821,
      "count": 1,
      "hash": "6b4b57fbc44acf4aba31c5a2df9b71736dfaeb76ed558c2fbf4e25e0561ee456",
      "previous": ""
    }
  ]
} as const
function restoreDeletedSeries(bytes:Uint8Array):Buffer {
 const source=Buffer.from(bytes).toString("utf8")
 if(hash(source)!==deleteProof.current)throw Error("Deleted series fixed source drift")
 const lines=source.split(/(?<=\n)/u)
 for(const h of [...deleteProof.inverse].reverse()){
  if(hash(lines.slice(h.at,h.at+h.count).join(""))!==h.hash)throw Error("Deleted series inverse drift")
  lines.splice(h.at,h.count,h.previous)
 }
 const parent=lines.join("")
 if(hash(parent)!==deleteProof.parent)throw Error("Deleted series complete parent drift")
 return Buffer.from(parent)
}

// Exact final public-identity increment inverse; prior deletion/publication/history oracles stay unchanged.
const identityMatrixProof={
  "current": "f726cac620362524f92474ca9d647229280db308d16105820c718f9bc32db1ae",
  "parent": "50ce4c54225ee7e87099f2b4a8b62b13d9f3fba186dad853648601cf734c3759",
  "inverse": [
    {
      "at": 12464,
      "count": 120,
      "hash": "61ae7e77f19198205777043f869393a28759c8c81983ccb0a0fca5d65105def2",
      "previous": ""
    },
    {
      "at": 12595,
      "count": 1,
      "hash": "32a5d4e44f512bc2116301cc323909de09426de153ce7608ce15d5f833877648",
      "previous": "      description: Fresh current human and fixed Product tenant admission. Source facts are qualified by the owner; no anonymous access, latest fallback or write side effect. Personal and project installations form a union when project_id is present; the complete exact project installation takes precedence for the same series, including disabled installations. Personal-only items remain; no latest substitution, automatic upgrade or execution authorization. Both scopes share the request deadline, the result remains limited to 1000 items, and current project access is rechecked before disclosure.\n"
    },
    {
      "at": 17518,
      "count": 72,
      "hash": "43cee903643e136639a38eaf5fb952f83f41c70152aa20708bd6defe8a920d4f",
      "previous": ""
    }
  ]
} as const
function restorePublicIdentityMatrix(bytes:Uint8Array):Buffer {
 const source=Buffer.from(bytes).toString("utf8")
 if(hash(source)!==identityMatrixProof.current)throw Error("Public identity matrix fixed source drift")
 const lines=source.split(/(?<=\n)/u)
 for(const h of [...identityMatrixProof.inverse].reverse()){
  if(hash(lines.slice(h.at,h.at+h.count).join(""))!==h.hash)throw Error("Public identity matrix inverse drift")
  lines.splice(h.at,h.count,h.previous)
 }
 const parent=lines.join("")
 if(hash(parent)!==identityMatrixProof.parent)throw Error("Public identity matrix complete parent drift")
 return Buffer.from(parent)
}

// Test-only exact Public22.2 ->22.1 inverse. All prior historical oracles stay unchanged.
const creditInitializationProof = {
  "current": "365d61aa5b3b4c01a178f077914e03b5fdbaeebc95fe740b9be46ca8fadc3205",
  "parent": "f726cac620362524f92474ca9d647229280db308d16105820c718f9bc32db1ae",
  "inverse": [
    {
      "at": 3,
      "count": 1,
      "hash": "abff194a9116b263be030e9646671d894d2d05b45d1cf9fc1593e6e8cc075aa9",
      "previous": "  version: 22.1.0\n"
    },
    {
      "at": 7005,
      "count": 28,
      "hash": "5888e29f8feeec39c70bf05acdf44beea7f3e88f55c218b2058aa65c2543665b",
      "previous": ""
    }
  ]
} as const
export function restoreCreditInitializationParent(bytes: Uint8Array): Buffer {
  bytes = restoreModelDiscoveryParent(bytes)
  const source = Buffer.from(bytes).toString("utf8")
  if (hash(source) !== creditInitializationProof.current) throw Error("Credit initialization fixed source drift")
  const lines = source.split(/(?<=\n)/u)
  for (const h of [...creditInitializationProof.inverse].reverse()) {
    if (hash(lines.slice(h.at, h.at + h.count).join("")) !== h.hash) throw Error("Credit initialization inverse drift")
    lines.splice(h.at, h.count, h.previous)
  }
  const parent = lines.join("")
  if (hash(parent) !== creditInitializationProof.parent) throw Error("Credit initialization complete parent drift")
  return Buffer.from(parent)
}
