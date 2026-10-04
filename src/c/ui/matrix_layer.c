#include "matrix_layer.h"

#include "../model/layout.h"

#define BIG_CELL_MIN 24
#define TODAY_MARK_SIZE 3

struct MatrixLayer {
  Layer *layer;
};

typedef struct {
  const GoalGrid *grid;
  int today_weekday;
} MatrixData;

typedef struct {
  GContext *ctx;
  GFont font;
  const GoalGrid *grid;
} Painter;

static const char *const WEEKDAY_LETTERS[GOALGRID_DAYS_PER_WEEK] = {
    "S", "M", "T", "W", "T", "F", "S",
};

static GColor prv_text_color(uint8_t level) {
#ifdef PBL_COLOR
  return level >= 2 ? GColorBlack : GColorWhite;
#else
  return level == GOALGRID_LEVELS - 1 ? GColorBlack : GColorWhite;
#endif
}

// Color screens shade five levels of green. One-bit screens cannot, so they show
// four states: outline (nothing done), double outline (some done), solid (all done).
static void prv_paint_body(GContext *ctx, GRect rect, uint8_t level) {
#ifdef PBL_COLOR
  // SpringBud (#AAFF00) read yellow on hardware; ScreaminGreen is a true, brighter light green.
  static const GColor palette[GOALGRID_LEVELS] = {
      GColorDarkGray, GColorDarkGreen, GColorIslamicGreen, GColorGreen, GColorScreaminGreen,
  };
  graphics_context_set_fill_color(ctx, palette[level]);
  graphics_fill_rect(ctx, rect, 0, GCornerNone);
  graphics_context_set_stroke_color(ctx, GColorWhite);
  if (level == 0) {
    graphics_draw_rect(ctx, rect);
  }
#else
  const bool all_done = level == GOALGRID_LEVELS - 1;
  graphics_context_set_fill_color(ctx, all_done ? GColorWhite : GColorBlack);
  graphics_fill_rect(ctx, rect, 0, GCornerNone);
  graphics_context_set_stroke_color(ctx, GColorWhite);
  if (!all_done) {
    graphics_draw_rect(ctx, rect);
  }
  if (level > 0 && !all_done) {
    graphics_draw_rect(ctx, grect_crop(rect, 1));
  }
#endif
}

static void prv_mark_today(GContext *ctx, GRect rect, uint8_t level) {
#ifdef PBL_COLOR
  // A 1px red outline is nearly invisible on-watch: use a 2px border plus a top-left square.
  graphics_context_set_stroke_color(ctx, GColorRed);
  graphics_draw_rect(ctx, rect);
  graphics_draw_rect(ctx, grect_crop(rect, 1));
  graphics_context_set_fill_color(ctx, GColorRed);
  graphics_fill_rect(ctx,
                     GRect(rect.origin.x + 1, rect.origin.y + 1, TODAY_MARK_SIZE, TODAY_MARK_SIZE),
                     0, GCornerNone);
#else
  graphics_context_set_fill_color(ctx, prv_text_color(level));
  graphics_fill_rect(ctx,
                     GRect(rect.origin.x + 2, rect.origin.y + 2, TODAY_MARK_SIZE, TODAY_MARK_SIZE),
                     0, GCornerNone);
#endif
}

static void prv_draw_centered(const Painter *painter, const char *text, GRect box, GColor color) {
  graphics_context_set_text_color(painter->ctx, color);
  graphics_draw_text(painter->ctx, text, painter->font, box, GTextOverflowModeFill,
                     GTextAlignmentCenter, NULL);
}

// Gothic glyphs sit high in their box; nudge so numbers look centered.
static GRect prv_text_box(GRect rect) {
  const int line_h = rect.size.h >= BIG_CELL_MIN ? 18 : 14;
  return GRect(rect.origin.x, rect.origin.y + (rect.size.h - line_h) / 2 - 3, rect.size.w,
               line_h + 4);
}

// Days with nothing to judge: the future, or any day when no goals exist yet.
static void prv_draw_unjudged(const Painter *painter, GRect rect, const char *label) {
#ifdef PBL_COLOR
  graphics_context_set_stroke_color(painter->ctx, GColorDarkGray);
  graphics_draw_rect(painter->ctx, rect);
#endif
  prv_draw_centered(painter, label, prv_text_box(rect),
                    PBL_IF_COLOR_ELSE(GColorLightGray, GColorWhite));
}

static void prv_draw_cell(const Painter *painter, GRect rect, int days_ago) {
  char label[4];
  snprintf(label, sizeof(label), "%d", goalgrid_day_of_month(painter->grid->epoch_day - days_ago));

  if (days_ago < 0 || painter->grid->goal_count == 0) {
    // Not filled, so it never reads as "nothing done".
    prv_draw_unjudged(painter, rect, label);
    if (days_ago == 0) {
      prv_mark_today(painter->ctx, rect, 0);
    }
    return;
  }

  const uint8_t level = goalgrid_level(goalgrid_day(painter->grid, days_ago));
  prv_paint_body(painter->ctx, rect, level);
  if (days_ago == 0) {
    prv_mark_today(painter->ctx, rect, level);
  }
  prv_draw_centered(painter, label, prv_text_box(rect), prv_text_color(level));
}

static void prv_draw_header(const Painter *painter, int x0, int cell, int today_weekday) {
  for (int col = 0; col < GOALGRID_DAYS_PER_WEEK; col++) {
    const GRect box = GRect(x0 + col * cell, -2, cell - LAYOUT_CELL_GAP, LAYOUT_HEADER_H);
    const bool is_today = col == today_weekday;
    prv_draw_centered(painter, WEEKDAY_LETTERS[col], box,
                      is_today ? GColorWhite : PBL_IF_COLOR_ELSE(GColorLightGray, GColorWhite));
#ifndef PBL_COLOR
    if (is_today) {
      graphics_context_set_fill_color(painter->ctx, GColorWhite);
      graphics_fill_rect(painter->ctx, GRect(box.origin.x + box.size.w / 2 - 3, 14, 7, 1), 0,
                         GCornerNone);
    }
#endif
  }
}

static void prv_update_proc(Layer *layer, GContext *ctx) {
  const MatrixData *data = layer_get_data(layer);
  if (!data->grid) {
    return;
  }

  const GRect bounds = layer_get_bounds(layer);
  const int cell = layout_cell_size(bounds.size.w, bounds.size.h);
  const int x0 = (bounds.size.w - (cell * GOALGRID_DAYS_PER_WEEK - LAYOUT_CELL_GAP)) / 2;

  const Painter cells = {
      .ctx = ctx,
      .font = fonts_get_system_font(cell >= BIG_CELL_MIN ? FONT_KEY_GOTHIC_18_BOLD
                                                         : FONT_KEY_GOTHIC_14_BOLD),
      .grid = data->grid,
  };
  const Painter header = {
      .ctx = ctx,
      .font = fonts_get_system_font(FONT_KEY_GOTHIC_14_BOLD),
      .grid = data->grid,
  };

  prv_draw_header(&header, x0, cell, data->today_weekday);
  for (int row = 0; row < GOALGRID_WEEKS; row++) {
    for (int col = 0; col < GOALGRID_DAYS_PER_WEEK; col++) {
      const GRect rect = GRect(x0 + col * cell, LAYOUT_HEADER_H + row * cell,
                               cell - LAYOUT_CELL_GAP, cell - LAYOUT_CELL_GAP);
      prv_draw_cell(&cells, rect, goalgrid_days_ago(data->today_weekday, row, col));
    }
  }
}

MatrixLayer *matrix_layer_create(GRect frame) {
  MatrixLayer *matrix = malloc(sizeof(MatrixLayer));
  if (!matrix) {
    return NULL;
  }
  matrix->layer = layer_create_with_data(frame, sizeof(MatrixData));
  MatrixData *data = layer_get_data(matrix->layer);
  data->grid = NULL;
  data->today_weekday = 0;
  layer_set_update_proc(matrix->layer, prv_update_proc);
  return matrix;
}

void matrix_layer_destroy(MatrixLayer *matrix) {
  layer_destroy(matrix->layer);
  free(matrix);
}

Layer *matrix_layer_get_layer(const MatrixLayer *matrix) {
  return matrix->layer;
}

void matrix_layer_set_grid(MatrixLayer *matrix, const GoalGrid *grid, int today_weekday) {
  MatrixData *data = layer_get_data(matrix->layer);
  data->grid = grid;
  data->today_weekday = today_weekday;
  layer_mark_dirty(matrix->layer);
}
