// Build/test-only exact Public29 -> issued App Public28.37 inverse. Never a runtime fallback.
import { createHash } from "node:crypto"
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const inverse = [
  {
    "at": 3,
    "count": 1,
    "sha256": "673c4555ae187975aadde86eceac0b9d4a36188ec8915abae2068050989a67d5",
    "previous": "  version: 28.37.0\n"
  },
  {
    "at": 56,
    "count": 590,
    "sha256": "d06540f91c39b793739868bf81abf592edd9174628ad02124cacfba02ef2fd21",
    "previous": ""
  },
  {
    "at": 8175,
    "count": 7,
    "sha256": "a609757bf8fecc3a3f0d88599fa362746870989fdaf2743cc78babc0f7928069",
    "previous": ""
  },
  {
    "at": 8198,
    "count": 8,
    "sha256": "77e79d23a3646deb6fa458cefb2ad27b4f9a264d92e89ed3558be2d2a6e16e9f",
    "previous": ""
  },
  {
    "at": 8263,
    "count": 7,
    "sha256": "a609757bf8fecc3a3f0d88599fa362746870989fdaf2743cc78babc0f7928069",
    "previous": ""
  },
  {
    "at": 8280,
    "count": 8,
    "sha256": "77e79d23a3646deb6fa458cefb2ad27b4f9a264d92e89ed3558be2d2a6e16e9f",
    "previous": ""
  },
  {
    "at": 16346,
    "count": 83,
    "sha256": "f5f582f30de86be1c1353b7f741e01b12ddc5579188d696f1d4d2fafff058468",
    "previous": ""
  },
  {
    "at": 17041,
    "count": 171,
    "sha256": "966ac5f8b9012d437a1d1ee5b82c1a7a0bdcc0b776734829033e3d8da71582f7",
    "previous": ""
  },
  {
    "at": 17700,
    "count": 201,
    "sha256": "2dead0b3044cd9ae78c02d43b8c8a537090c3ad937d9dd03bc1a7c1a4adeb0ba",
    "previous": ""
  },
  {
    "at": 18719,
    "count": 59,
    "sha256": "be20b46aedd39eb68e09a95078c16ee163202ed46cf7524ba8391f893e16ad1d",
    "previous": ""
  },
  {
    "at": 23034,
    "count": 6,
    "sha256": "8a286f3fceb94311e3c2192988a047e44c9f82e5cfcd3386966d9ae07ed7bedb",
    "previous": "        data: { $ref: '#/components/schemas/LibraryArtifactItem' }\n"
  },
  {
    "at": 23860,
    "count": 8,
    "sha256": "ccdbb9bd327805e91615d62336a7574ce2eb836ca8e4c8a6c0d9264990ff7cf7",
    "previous": ""
  },
  {
    "at": 23869,
    "count": 3,
    "sha256": "fa1ad68c943274f344cd67f6d412e046f26fe67ca6578e44b9c263cc9f5921b8",
    "previous": ""
  },
  {
    "at": 23907,
    "count": 5,
    "sha256": "1104dd5c83d3d1256a5d666a216eae6508eb2cba0519f7a1e84b0744b0beb405",
    "previous": ""
  },
  {
    "at": 24316,
    "count": 5,
    "sha256": "3dd3e90027668a976be38c10967975303a8227bd0401faad93402e9d71714b63",
    "previous": ""
  },
  {
    "at": 24382,
    "count": 9,
    "sha256": "944ccfd7dced2e4db03b23786801a3a685a07de6a4e6a0b4560b4e384025874c",
    "previous": ""
  },
  {
    "at": 24573,
    "count": 5,
    "sha256": "1104dd5c83d3d1256a5d666a216eae6508eb2cba0519f7a1e84b0744b0beb405",
    "previous": ""
  },
  {
    "at": 24646,
    "count": 5,
    "sha256": "1104dd5c83d3d1256a5d666a216eae6508eb2cba0519f7a1e84b0744b0beb405",
    "previous": ""
  },
  {
    "at": 24666,
    "count": 5,
    "sha256": "1104dd5c83d3d1256a5d666a216eae6508eb2cba0519f7a1e84b0744b0beb405",
    "previous": ""
  },
  {
    "at": 24782,
    "count": 26,
    "sha256": "ff29fa36f90a555e1fa262d44e7c9f31cfe72d885a3234cf733ae97d7eb59f4f",
    "previous": ""
  },
  {
    "at": 24809,
    "count": 3,
    "sha256": "41685f707b911c6ff1bb1f5840a0b43238ccc41e01ced3667cfdd460889a5c44",
    "previous": ""
  },
  {
    "at": 24864,
    "count": 3,
    "sha256": "c8d43d5cc4f7c3e0b60a14812fd26fe854d0dc8e1248712c11d6f39d10dd2baf",
    "previous": "              items: { $ref: '#/components/schemas/PrivateDelivery' }\n"
  },
  {
    "at": 25260,
    "count": 5,
    "sha256": "a79f92ab488e14bb5e4330987b3219e19d6376298888a96c09db3c6698e5cfd1",
    "previous": ""
  },
  {
    "at": 25278,
    "count": 5,
    "sha256": "a79f92ab488e14bb5e4330987b3219e19d6376298888a96c09db3c6698e5cfd1",
    "previous": ""
  },
  {
    "at": 26027,
    "count": 4,
    "sha256": "79946d1c09440d3e5841836af66c3010aaaf857c9beb59352db4155b2929c46a",
    "previous": ""
  },
  {
    "at": 26048,
    "count": 6,
    "sha256": "b3139c02d5e4b170f4afcd0d5889a0d7cfffdef85fda81f0ed2e8901c443decc",
    "previous": "      required: [scheduling_state]\n"
  }
] as const
export function restorePublic2837ProjectCollaborationContract(source: string): string {
  if (!/^  version: 29\.0\.0$/mu.test(source)) return source
  if (hash(source) !== "45c54365e75a31684e1dbf841a0c68cd554bf022643919cac591c78ed4499509") throw Error("Public29 collaboration child drift")
  const lines = source.match(/[^\n]*\n|[^\n]+$/gu) ?? []
  for (const change of [...inverse].reverse()) {
    if (hash(lines.slice(change.at, change.at + change.count).join("")) !== change.sha256) throw Error("Public29 collaboration delta drift")
    lines.splice(change.at, change.count, ...(change.previous.match(/[^\n]*\n|[^\n]+$/gu) ?? []))
  }
  const parent = lines.join("")
  if (hash(parent) !== "737688c79fa4fad8216168656d0fe7e4131b496ef2b506e424dbff82d7dca2c8") throw Error("Public28.37 complete historical parent drift")
  return parent
}
