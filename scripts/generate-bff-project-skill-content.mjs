import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import YAML from 'yaml'
const root = new URL('../', import.meta.url)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const pin = JSON.parse(await readFile(new URL('contract/bff-project-skill-content-source.json', root), 'utf8'))
assert.equal(pin.owner, 'kokoro-bff'); assert.equal(pin.candidate, false)
assert.equal(pin.owner_commit, '0b67e0eab4918264a7270b828d558e631bdfb3f5')
assert.equal(pin.policy_owner_commit, '966ec5e7b0804185349a5f5413091d8e9e792bc9')
assert.equal(pin.public_source_path, 'contract/openapi/v1/openapi.yaml'); assert.equal(pin.policy_source_path, 'contract/skill-download-policy.json')
const bytes = await readFile(new URL('src/generated/bff-public-openapi.yaml', root))
const policyBytes = await readFile(new URL('src/generated/bff-skill-download-policy.json', root))
assert.equal(hash(bytes), pin.public_source_sha256); assert.equal(hash(bytes), '9e6a8dddea847ecfd2905f378f4f76022b6cc49a1a4352a2e7abb4e73b3f1328')
assert.equal(hash(policyBytes), pin.policy_source_sha256); assert.equal(hash(policyBytes), '4b84ccddb70421fc3f5f48766c4fd87fafb7d94f00eb9774f75b627f4f361925')
const spec = YAML.parse(bytes.toString('utf8')), policy = JSON.parse(policyBytes.toString('utf8'))
assert.equal(spec.info.version, pin.openapi_version); assert.equal(policy.version, pin.policy_version)
const path = '/v1/projects/{projectId}/skill-installations/{installation_id}/package', operation = spec.paths[path].get
assert.equal(operation.operationId, 'getProjectSkillInstallationPackage')
assert.equal(operation['x-kokoro-permission'], 'product.skill.installation.read')
const resolve = schema => schema.$ref ? schema.$ref.slice(2).split('/').reduce((node, key) => node[key], spec) : schema
function render(input) {
 const s = resolve(input)
 if (s.allOf) {
  assert.equal(s.allOf.length, 2)
  assert.equal(s.allOf[0].$ref, '#/components/schemas/SkillPackageInspectionErrorResponse')
  const base = resolve(s.allOf[0]), variants = s.allOf[1].oneOf ?? [s.allOf[1]]
  const schemas = variants.map(variant => {
   const merged = structuredClone(base), constraints = variant.properties?.error?.properties
   assert.ok(constraints); assert.ok(Object.keys(constraints).every(key => ['code','retryable'].includes(key)))
   merged.properties.error = structuredClone(resolve(merged.properties.error))
   Object.assign(merged.properties.error.properties, constraints)
   return render(merged)
  })
  return schemas.length === 1 ? schemas[0] : `z.union([${schemas.join(',')}])`
 }
 if ('const' in s) return `z.literal(${JSON.stringify(s.const)})`
 if (s.enum) return `z.enum(${JSON.stringify(s.enum)})`
 if (s.oneOf || s.anyOf) { const variants = (s.oneOf ?? s.anyOf).map(render); return variants.length === 1 ? variants[0] : `z.union([${variants.join(',')}])` }
 if (s.type === 'null') return 'z.null()'
 if (s.type === 'boolean') return 'z.boolean()'
 if (s.type === 'object') {
  assert.equal(s.additionalProperties, false)
  return `z.object({${Object.entries(s.properties).map(([k,v]) => `${JSON.stringify(k)}:${render(v)}${s.required?.includes(k) ? '' : '.optional()'}`).join(',')}}).strict()`
 }
 if (s.type === 'array') return `z.array(${render(s.items)})${s.minItems === undefined ? '' : `.min(${s.minItems})`}${s.maxItems === undefined ? '' : `.max(${s.maxItems})`}`
 if (s.type === 'integer') return `z.number().int()${s.minimum === undefined ? '' : `.min(${s.minimum})`}${s.maximum === undefined ? '' : `.max(${s.maximum})`}`
 assert.equal(s.type, 'string')
 return `z.string()${s.minLength === undefined ? '' : `.min(${s.minLength})`}${s.maxLength === undefined ? '' : `.max(${s.maxLength})`}${s.pattern ? `.regex(new RegExp(${JSON.stringify(s.pattern.replace(/\$$/u,'(?![\\s\\S])'))},'u'))` : ''}${s.format === 'date-time' ? '.datetime({offset:true})' : ''}`
}
const projectDownload = policy.operations.find(item => item.qualifier === "project_installation")
assert.ok(projectDownload); assert.equal(projectDownload.method, "POST")
const parameters = operation.parameters.map(resolve)
const errors = Object.entries(operation.responses).filter(([status]) => status !== '200').map(([status, input]) => ({ status: Number(status), schema: resolve(input).content['application/json'].schema }))
assert.equal(policy.byte_operation.path, '/skill-downloads/{handle}'); assert.equal(policy.byte_operation.method, 'GET')
const { byte_operation: byteOperation, ...policyParent } = policy; policyParent.version = 2
assert.equal(hash(Buffer.from(JSON.stringify(policyParent, null, 2) + '\n')), '454d0980e647ef7a7679bb8e986350c3aa5933092ed96df3661bb48e1de1584f')
const output = `// Generated from the fixed BFF Public28.9 and independent download policy3. Do not edit.\nimport { z } from 'zod'\nexport const projectSkillContentProvenance=${JSON.stringify(pin)} as const\nexport const projectPackageOperation=${JSON.stringify({method:"GET",path,operationId:operation.operationId})} as const\nexport const projectDownloadOperation=${JSON.stringify({method:projectDownload.method,path:projectDownload.path})} as const\nexport const projectContentIdSchema=${render(parameters[0].schema)}\nexport const projectContentInstallationIdSchema=${render(parameters[1].schema)}\nexport const projectContentFilePathSchema=${render(parameters[2].schema)}\nexport const projectPackageResponseSchema=${render(resolve(operation.responses['200']).content['application/json'].schema)}\nexport const projectPackageErrors=[${errors.map(e=>`{status:${e.status},schema:${render(e.schema)}}`).join(',')}]\nexport const downloadMetadataResponseSchema=${render(policy.operations[0].responses['200'])}\nexport const skillDownloadByteOperation=${JSON.stringify(byteOperation)} as const\nexport const skillDownloadHandleSchema=${render(byteOperation.parameterSchema)}\nexport const skillDownloadByteErrors=[${byteOperation.responses.errors.map(e=>`{status:${e.status},schema:${render(e.schema)}}`).join(',')}]\nexport const skillDownloadBudgetMs=${policy.budgetMs}\nexport const skillDownloadPolicy=${JSON.stringify(policy)} as const\nexport const skillDownloadErrorSchemas=[${policy.operations.flatMap(o=>o.responses.errors.map(e=>`{qualifier:${JSON.stringify(o.qualifier)},status:${e.status},schema:${render(e.schema)}}`)).join(',')}]\n`
const destination = new URL('src/generated/bff-project-skill-content.ts', root)
assert.ok(['--write','--check'].includes(process.argv[2]))
if(process.argv[2] === '--write') await writeFile(destination, output)
else assert.equal(await readFile(destination,'utf8'), output, 'Project Skill content artifact drift')
