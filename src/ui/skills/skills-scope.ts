/** One shared vocabulary for the installed-skills scope filter.
 * Keeping this intent outside a rendered component lets the marketplace hand
 * a user into Settings without creating a second, divergent "my skills" view. */
export type SkillsScopeFilter = "all" | "personal" | "official" | "thirdParty"
