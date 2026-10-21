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
export function restorePersonalHistory(bytes:Uint8Array):Buffer {
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
