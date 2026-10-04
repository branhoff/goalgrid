#include "layout.h"

#include "goalgrid.h"

enum { kRoundMargin = 2, kFitAttempts = 4, kMinSidePad = 2, kRoundBottomWeight = 2 };

static int isqrt(int value) {
  int root = 0;
  while ((root + 1) * (root + 1) <= value) {
    root++;
  }
  return root;
}

int layout_chord_half_width(int radius, int dy) {
  const int squared = radius * radius - dy * dy;
  return squared > 0 ? isqrt(squared) : 0;
}

int layout_cell_size(int width, int height) {
  const int cell_w = width / GOALGRID_DAYS_PER_WEEK;
  const int cell_h = (height - LAYOUT_HEADER_H) / GOALGRID_WEEKS;
  return cell_w < cell_h ? cell_w : cell_h;
}

int layout_grid_width(const Layout *layout) {
  return layout->cell * GOALGRID_DAYS_PER_WEEK - LAYOUT_CELL_GAP;
}

// Gaps above the time and below the date are equal; the bottom gap is
// `bottom_weight` times as big. Round screens weight it so the calendar sits
// where the circle is still wide.
static Layout place(int screen_w, int screen_h, int cal_w, int bottom_weight) {
  const int text_visible_h = LAYOUT_TIME_H + LAYOUT_DATE_GLYPH_BOTTOM - LAYOUT_TIME_GLYPH_TOP;
  Layout l = {.cal_w = cal_w};
  l.cell = layout_cell_size(cal_w, screen_h - text_visible_h - 12);
  l.cal_h = LAYOUT_HEADER_H + GOALGRID_WEEKS * l.cell;
  const int cal_visible_h = l.cal_h - LAYOUT_CAL_TOP_INSET - LAYOUT_CELL_GAP;
  const int gap = (screen_h - text_visible_h - cal_visible_h) / (2 + bottom_weight);
  l.time_y = gap - LAYOUT_TIME_GLYPH_TOP;
  l.date_y = l.time_y + LAYOUT_TIME_H;
  l.cal_y = l.date_y + LAYOUT_DATE_GLYPH_BOTTOM + gap - LAYOUT_CAL_TOP_INSET;
  l.cal_x = (screen_w - cal_w) / 2;
  return l;
}

// Widest grid that fits the circle at the calendar's bottom edge.
static int round_grid_limit(int screen_w, const Layout *l) {
  const int radius = screen_w / 2;
  const int bottom = l->cal_y + l->cal_h - LAYOUT_CELL_GAP;
  return 2 * (layout_chord_half_width(radius, bottom - radius) - kRoundMargin);
}

Layout layout_compute(int screen_w, int screen_h, bool round) {
  const int side_pad = round ? screen_w / 10 : kMinSidePad;
  int cal_w = screen_w - 2 * side_pad;
  const int bottom_weight = round ? kRoundBottomWeight : 1;
  Layout l = place(screen_w, screen_h, cal_w, bottom_weight);
  for (int attempt = 0; round && attempt < kFitAttempts; attempt++) {
    const int limit = round_grid_limit(screen_w, &l);
    if (layout_grid_width(&l) <= limit) {
      break;
    }
    cal_w = limit + LAYOUT_CELL_GAP;
    l = place(screen_w, screen_h, cal_w, bottom_weight);
  }
  return l;
}
