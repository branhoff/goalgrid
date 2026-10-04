#include <stdlib.h>

#include "check.h"
#include "model/goalgrid.h"
#include "model/layout.h"

static void test_chord_width(void) {
  CHECK(layout_chord_half_width(90, 0) == 90);
  CHECK(layout_chord_half_width(90, 90) == 0);
  CHECK(layout_chord_half_width(5, 3) == 4);
  CHECK(layout_chord_half_width(5, 4) == 3);
  CHECK(layout_chord_half_width(5, 9) == 0);  // outside the circle
  CHECK(layout_chord_half_width(5, -3) == 4);
}

static void test_cell_size(void) {
  CHECK(layout_cell_size(196, 500) == 28);                       // limited by width
  CHECK(layout_cell_size(500, LAYOUT_HEADER_H + 3 * 10) == 10);  // limited by height
}

static int visible_gap_above_time(const Layout *l) {
  return l->time_y + LAYOUT_TIME_GLYPH_TOP;
}

static int visible_gap_below_date(const Layout *l) {
  return (l->cal_y + LAYOUT_CAL_TOP_INSET) - (l->date_y + LAYOUT_DATE_GLYPH_BOTTOM);
}

static int visible_gap_below_calendar(const Layout *l, int screen_h) {
  return screen_h - (l->cal_y + l->cal_h - LAYOUT_CELL_GAP);
}

static void check_rectangular(int width, int height) {
  const Layout l = layout_compute(width, height, false);
  const int top = visible_gap_above_time(&l);
  const int middle = visible_gap_below_date(&l);
  const int bottom = visible_gap_below_calendar(&l, height);
  CHECK(abs(top - middle) <= 2 && abs(middle - bottom) <= 2);  // three near-equal gaps
  CHECK(top > 0 && bottom > 0);
  CHECK(l.cal_x >= 0 && l.cal_x + l.cal_w <= width);
  CHECK(layout_grid_width(&l) <= width);
}

static void test_rectangular_screens(void) {
  check_rectangular(200, 228);  // emery
  check_rectangular(144, 168);  // aplite, basalt, diorite
}

static bool inside_circle(int x, int y, int diameter) {
  const int dx = 2 * x - diameter;
  const int dy = 2 * y - diameter;
  return dx * dx + dy * dy <= diameter * diameter;
}

// Every corner of every calendar cell, header row included, must be on screen.
static void check_round(int diameter) {
  const Layout l = layout_compute(diameter, diameter, true);
  const int x0 = l.cal_x + (l.cal_w - layout_grid_width(&l)) / 2;
  const int y0 = l.cal_y + LAYOUT_HEADER_H;
  const int cell_side = l.cell - LAYOUT_CELL_GAP;
  for (int row = 0; row < GOALGRID_WEEKS; row++) {
    for (int col = 0; col < GOALGRID_DAYS_PER_WEEK; col++) {
      const int left = x0 + col * l.cell;
      const int top = y0 + row * l.cell;
      CHECK(inside_circle(left, top, diameter));
      CHECK(inside_circle(left + cell_side, top, diameter));
      CHECK(inside_circle(left, top + cell_side, diameter));
      CHECK(inside_circle(left + cell_side, top + cell_side, diameter));
    }
  }
  CHECK(l.cell >= 10);  // still legible
  CHECK(visible_gap_above_time(&l) > 0);
}

static void test_round_screens(void) {
  check_round(180);  // chalk
  check_round(240);
  check_round(260);
}

void test_layout(void) {
  test_chord_width();
  test_cell_size();
  test_rectangular_screens();
  test_round_screens();
}
