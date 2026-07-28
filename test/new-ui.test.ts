import {
  NEW_UI_DEFAULT_ENABLED,
  NEW_UI_DESKTOP_MIN_WIDTH,
  resolveNewUiMode,
} from "../app/utils/new-ui";

describe("desktop new ui mode", () => {
  test.each([
    [false, 1280, false, true, false],
    [true, NEW_UI_DESKTOP_MIN_WIDTH - 1, false, true, false],
    [true, NEW_UI_DESKTOP_MIN_WIDTH, false, true, true],
    [true, 1280, true, true, false],
    [true, 1280, false, false, false],
    [true, 1280, false, true, true],
  ])(
    "enabled=%s width=%s isApp=%s routeEligible=%s => %s",
    (enabled, width, isApp, routeEligible, expected) => {
      expect(resolveNewUiMode({ enabled, width, isApp, routeEligible })).toBe(
        expected,
      );
    },
  );

  test("stays disabled by default for existing users", () => {
    expect(NEW_UI_DEFAULT_ENABLED).toBe(false);
  });
});
