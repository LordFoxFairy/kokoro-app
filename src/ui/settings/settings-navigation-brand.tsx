import { useRef, type ReactNode } from "react";
import { ChevronsUpDown, Search, X } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";

import styles from "./settings-modal.module.css";

type SettingsNavigationBrandProps = {
  brandName: string;
  scopeLabel: string;
  searchLabel: string;
  clearLabel: string;
  children?: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
};

/** Identity and filtering are isolated from the tab rail so changing either
 * compact navigation or account presentation cannot alter the other. */
export function SettingsNavigationBrand({
  brandName,
  scopeLabel,
  searchLabel,
  clearLabel,
  children,
  value,
  onValueChange,
}: SettingsNavigationBrandProps) {
  const searchRef = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <div className={styles.brand}>
        <div className={styles.brandIdentity}>
          <Avatar className={styles.brandAvatar}>
            <AvatarFallback>
              {brandName.trim().charAt(0).toUpperCase() || "K"}
            </AvatarFallback>
          </Avatar>
          <div className={styles.brandCopy}>
            <p className={styles.brandName}>{brandName}</p>
            <span className={styles.brandMeta}>{scopeLabel}</span>
          </div>
          <ChevronsUpDown className={styles.brandSwitcher} aria-hidden="true" />
        </div>
      </div>
      <div className={styles.searchToolbar}>
      <div className={styles.settingsSearch}>
        <Search aria-hidden="true" />
        <Input
          ref={searchRef}
          value={value}
          aria-label={searchLabel}
          placeholder={searchLabel}
          onChange={(event) => onValueChange(event.target.value)}
        />
        {value.length > 0 ? <button type="button" className={styles.searchClear} aria-label={clearLabel} onClick={() => { onValueChange(""); searchRef.current?.focus(); }}><X aria-hidden="true" /></button> : null}
      </div>
      {children}
      </div>
    </>
  );
}
