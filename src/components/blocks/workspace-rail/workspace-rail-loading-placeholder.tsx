import { itemStyles } from "./workspace-rail-styles";

type WorkspaceRailLoadingPlaceholderProps = {
  label: string;
  testId: string;
};

/**
 * Keeps the rail's final row geometry during an owner read without exposing a
 * transient text, spinner or skeleton loading state. The accessible name still announces the
 * pending read while sighted users retain the surrounding rail rhythm.
 */
export function WorkspaceRailLoadingPlaceholder({
  label,
  testId,
}: WorkspaceRailLoadingPlaceholderProps) {
  return (
    <div
      className={itemStyles.loadingPlaceholder}
      role="status"
      aria-label={label}
      data-testid={testId}
    >
    </div>
  );
}
