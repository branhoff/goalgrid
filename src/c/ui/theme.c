#include "theme.h"

#include "../model/goalgrid.h"

Theme theme_from_byte(uint8_t value) {
  return value == THEME_LIGHT ? THEME_LIGHT : THEME_DARK;
}

#ifdef PBL_COLOR
// Dark: black background, more done -> brighter green (the GitHub dark-contributions ramp).
// Light: white background, more done -> darker green (the GitHub light ramp).
static const GColor DARK_FILL[GOALGRID_LEVELS] = {
    GColorDarkGray, GColorDarkGreen, GColorIslamicGreen, GColorGreen, GColorScreaminGreen,
};
static GColor prv_light_fill(uint8_t level) {
  switch (level) {
    case 1:
      return GColorFromRGB(170, 255, 170);
    case 2:
      return GColorFromRGB(85, 255, 85);
    case 3:
      return GColorKellyGreen;
    case 4:
      return GColorDarkGreen;
    default:
      return GColorLightGray;
  }
}
#endif

GColor theme_background(Theme theme) {
#ifdef PBL_COLOR
  return theme == THEME_LIGHT ? GColorWhite : GColorBlack;
#else
  (void)theme;
  return GColorBlack;
#endif
}

GColor theme_chrome_text(Theme theme) {
#ifdef PBL_COLOR
  return theme == THEME_LIGHT ? GColorBlack : GColorWhite;
#else
  (void)theme;
  return GColorWhite;
#endif
}

GColor theme_muted_text(Theme theme) {
#ifdef PBL_COLOR
  return theme == THEME_LIGHT ? GColorDarkGray : GColorLightGray;
#else
  (void)theme;
  return GColorWhite;
#endif
}

GColor theme_cell_fill(Theme theme, uint8_t level) {
#ifdef PBL_COLOR
  return theme == THEME_LIGHT ? prv_light_fill(level) : DARK_FILL[level];
#else
  (void)theme;
  (void)level;
  return GColorBlack;
#endif
}

GColor theme_cell_text(Theme theme, uint8_t level) {
#ifdef PBL_COLOR
  // Keep the number legible on its fill: dark/light each invert past their mid green.
  if (theme == THEME_LIGHT) {
    return level >= 3 ? GColorWhite : GColorBlack;
  }
  return level >= 2 ? GColorBlack : GColorWhite;
#else
  (void)theme;
  return level == GOALGRID_LEVELS - 1 ? GColorBlack : GColorWhite;
#endif
}
