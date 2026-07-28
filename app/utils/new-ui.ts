export const NEW_UI_DESKTOP_MIN_WIDTH = 900;
export const NEW_UI_DEFAULT_ENABLED = false;

export interface NewUiModeInput {
  enabled: boolean;
  width: number;
  isApp: boolean;
  routeEligible: boolean;
}

export function resolveNewUiMode({
  enabled,
  width,
  isApp,
  routeEligible,
}: NewUiModeInput) {
  return (
    enabled && !isApp && routeEligible && width >= NEW_UI_DESKTOP_MIN_WIDTH
  );
}
