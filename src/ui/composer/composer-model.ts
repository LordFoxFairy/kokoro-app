import type { ModelCandidate } from "@/contract/http"

export function modelSelector(model: ModelCandidate): string {
  return `${model.provider}:${model.name}`
}

export function modelLabel(model: ModelCandidate): string {
  return model.display_name ?? model.name
}

function isNewModel(model: ModelCandidate): boolean {
  return model.name.endsWith("-new")
}

export function modelTriggerLabel(model: ModelCandidate): string {
  const label = modelLabel(model)
  if (!isNewModel(model)) return label
  return label.replace(/\s*(?:[-–—:]\s*)?(?:new|\u65b0)$/iu, "").trim() || model.name.replace(/-new$/u, "")
}

export function modelNewBadgeLabel(model: ModelCandidate): string | null {
  if (!isNewModel(model)) return null
  return modelLabel(model).match(/(?:^|\s)(new|\u65b0)$/iu)?.[1] ?? model.name.slice(-3)
}
