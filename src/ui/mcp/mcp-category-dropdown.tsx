"use client";

import type { Ref } from "react";
import { ChevronDown, ListFilter } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/i18n/context";

import { MCP_CATEGORY_MESSAGES, MCP_CATEGORY_OPTIONS } from "./mcp-projection-types";
import styles from "./mcp-projection-read.module.css";

type Category = "all" | keyof typeof MCP_CATEGORY_MESSAGES;

/** The same owner category selection, placed by each directory's layout. */
export function McpCategoryDropdown({ value, onChange, triggerRef, onOpenChange }: {
  value: Category;
  triggerRef?: Ref<HTMLButtonElement>;
  onOpenChange?: (open: boolean) => void;
  onChange: (value: Category) => void;
}) {
  const t = useT();
  return (
    <DropdownMenu {...(onOpenChange ? { onOpenChange } : {})}>
      <DropdownMenuTrigger asChild>
        <Button ref={triggerRef} type="button" variant="outline" className={styles.filterTrigger}>
          <ListFilter aria-hidden="true" />
          {value === "all" ? t("mcp.categoryAll") : t(MCP_CATEGORY_MESSAGES[value])}
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={styles.filterMenu}>
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => onChange("all")}>
            {t("mcp.categoryAll")}
          </DropdownMenuItem>
          {MCP_CATEGORY_OPTIONS.map((category) => (
            <DropdownMenuItem key={category} onSelect={() => onChange(category)}>
              {t(MCP_CATEGORY_MESSAGES[category])}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
