#ifndef GOALGRID_UI_THEME_H_
#define GOALGRID_UI_THEME_H_

#include <pebble.h>

// The watchface's color scheme. Only color screens honor it; 1-bit screens render the
// same black-background scheme regardless (the theme_* accessors fall back to it).
typedef enum { THEME_DARK = 0, THEME_LIGHT = 1 } Theme;

// Clamp an arbitrary stored/received byte to a valid Theme (unknown values -> dark).
Theme theme_from_byte(uint8_t value);

GColor theme_background(Theme theme);                // window background
GColor theme_chrome_text(Theme theme);               // time/date, today's weekday letter
GColor theme_muted_text(Theme theme);                // unjudged numbers, other weekday letters
GColor theme_cell_fill(Theme theme, uint8_t level);  // a judged day's grid cell
GColor theme_cell_text(Theme theme, uint8_t level);  // the number drawn on that cell

#endif  // GOALGRID_UI_THEME_H_
