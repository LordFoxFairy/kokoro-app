import type { RefObject } from "react"
import { Grid2X2, List, LoaderCircle, Search, SlidersHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useT } from "@/i18n/context"

import type { LibraryUrlState } from "./kokoro-library-model"
import styles from "./kokoro-library-surface.module.css"

type LibraryHeaderProps = Pick<LibraryUrlState, "query" | "view" | "favoritesOnly"> & {
  searching: boolean
  updateUrlState: (patch: Partial<LibraryUrlState>) => void
  onOpenFiles: () => void
  sourceFocusRef: RefObject<HTMLButtonElement | null>
}

/** Controls belong to the title bar; personal uploads remain a separate source. */
export function LibraryHeader({ searching, query, view, favoritesOnly, updateUrlState, onOpenFiles, sourceFocusRef }: LibraryHeaderProps) {
  const t = useT()
  return <header className={styles.header}>
    <h1>{t("rail.navDatabase")}</h1>
    <div className={styles.tools}>
      <label className={styles.search}>
        {searching ? <LoaderCircle className={styles.querySpinner} aria-hidden="true" /> : <Search aria-hidden="true" />}
        <Input aria-busy={searching} value={query} aria-label={t("library.search")} placeholder={t("library.search")} onChange={(event) => updateUrlState({ query: event.target.value })} onKeyDown={(event) => {
          if (event.key === "Escape" && query !== "") { event.preventDefault(); updateUrlState({ query: "" }) }
        }} />
      </label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button ref={sourceFocusRef} type="button" variant="outline" size="icon-sm" className={styles.viewOptions} aria-label={t("library.viewOptions")} data-active={favoritesOnly || undefined}><SlidersHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{t("library.viewOptions")}</DropdownMenuLabel>
          <DropdownMenuCheckboxItem checked={favoritesOnly} onCheckedChange={(checked) => updateUrlState({ favoritesOnly: checked })}>{t("library.favorites")}</DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onOpenFiles}>{t("library.filesTab")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ToggleGroup type="single" value={view} onValueChange={(value) => { if (value) updateUrlState({ view: value as LibraryUrlState["view"] }) }} className={styles.viewToggle} aria-label={t("library.viewAria")}>
        <ToggleGroupItem value="grid" className={styles.viewButton} aria-label={t("library.gridView")}><Grid2X2 aria-hidden="true" /></ToggleGroupItem>
        <ToggleGroupItem value="list" className={styles.viewButton} aria-label={t("library.listView")}><List aria-hidden="true" /></ToggleGroupItem>
      </ToggleGroup>
    </div>
  </header>
}
