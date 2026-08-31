/** Browser-safe projection of a System navigation entry. */
export type RuntimeNavigationItem = {
  key: string
  label: string
  icon?: string
  featureFlag?: string
}

export type RuntimeFeatureFlag = {
  key: string
  enabled: boolean
}
