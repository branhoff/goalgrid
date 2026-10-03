#ifndef GOALGRID_MODEL_LAYOUT_H_
#define GOALGRID_MODEL_LAYOUT_H_

// Pure screen-layout math for the watchface, free of <pebble.h> so the geometry
// (margins, circular-bezel clipping) is unit-tested on the host.

#include <stdbool.h>

#define LAYOUT_TIME_H 46
#define LAYOUT_DATE_H 26
#define LAYOUT_HEADER_H 16
#define LAYOUT_CELL_GAP 2

// Blank pixel rows inside the system fonts' boxes, measured on the emulator.
#define LAYOUT_TIME_GLYPH_TOP 12
#define LAYOUT_DATE_GLYPH_BOTTOM 17
#define LAYOUT_CAL_TOP_INSET 3

typedef struct {
  int time_y;
  int date_y;
  int cal_x;
  int cal_y;
  int cal_w;
  int cal_h;
  int cell;
} Layout;

// Side length of a (square) calendar cell that fits width x height.
int layout_cell_size(int width, int height);

// Integer half-width of the chord of a circle `dy` pixels from its centre.
int layout_chord_half_width(int radius, int dy);

// Positions for the time, date and calendar on a screen; `round` screens also
// keep the whole calendar inside the circular bezel.
Layout layout_compute(int screen_w, int screen_h, bool round);

// Visible width of the calendar grid (the last cell's trailing gap is blank).
int layout_grid_width(const Layout *layout);

#endif  // GOALGRID_MODEL_LAYOUT_H_
