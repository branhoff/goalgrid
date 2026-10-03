#include "matrix_layer.h"

#define CELL_GAP 2
#define HEADER_H 16
#define BIG_CELL_MIN 24

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

static GColor prv_level_color(uint8_t level) {
#ifdef PBL_COLOR
  static const GColor palette[GOALGRID_LEVELS] = {
      GColorDarkGray, GColorDarkGreen, GColorIslamicGreen, GColorGreen, GColorSpringBud,
  };
  return palette[level];
#else
  return level >= 2 ? GColorWhite : GColorBlack;
#endif
}

static void prv_draw_centered(const Painter *painter, const char *text, GRect box, GColor color) {
  graphics_context_set_text_color(painter->ctx, color);
  graphics_draw_text(painter->ctx, text, painter->font, box, GTextOverflowModeFill,
                     GTextAlignmentCenter, NULL);
}

static void prv_draw_cell(const Painter *painter, GRect rect, int days_ago) {
  GContext *ctx = painter->ctx;
  char label[4];
  snprintf(label, sizeof(label), "%d", goalgrid_day_of_month(painter->grid->epoch_day - days_ago));

  // Gothic glyphs sit high in their box; nudge so numbers look centered.
  const int line_h = rect.size.h >= BIG_CELL_MIN ? 18 : 14;
  GRect text_box =
      GRect(rect.origin.x, rect.origin.y + (rect.size.h - line_h) / 2 - 3, rect.size.w, line_h + 4);

  if (days_ago < 0) {
    // Future: outline only (color screens), so it never reads as "nothing done".
#ifdef PBL_COLOR
    graphics_context_set_stroke_color(ctx, GColorDarkGray);
    graphics_draw_rect(ctx, rect);
#endif
    prv_draw_centered(painter, label, text_box, PBL_IF_COLOR_ELSE(GColorLightGray, GColorWhite));
    return;
  }

  const uint8_t level = goalgrid_level(goalgrid_day(painter->grid, days_ago));
  graphics_context_set_fill_color(ctx, prv_level_color(level));
  graphics_fill_rect(ctx, rect, 0, GCornerNone);
  if (level == 0) {
    graphics_context_set_stroke_color(ctx, GColorWhite);
    graphics_draw_rect(ctx, rect);
  }
  if (days_ago == 0) {
    graphics_context_set_stroke_color(ctx, GColorWhite);
    graphics_draw_rect(ctx, rect);
    graphics_draw_rect(ctx, grect_crop(rect, 1));
  }
  prv_draw_centered(painter, label, text_box, level >= 2 ? GColorBlack : GColorWhite);
}

static int prv_cell_size(int width, int height) {
  const int cell_w = width / GOALGRID_DAYS_PER_WEEK;
  const int cell_h = (height - HEADER_H) / GOALGRID_WEEKS;
  return cell_w < cell_h ? cell_w : cell_h;
}

int matrix_layer_content_height(int width, int max_height) {
  return HEADER_H + GOALGRID_WEEKS * prv_cell_size(width, max_height);
}

static void prv_draw_header(const Painter *painter, int x0, int cell, int today_weekday) {
  for (int col = 0; col < GOALGRID_DAYS_PER_WEEK; col++) {
    const GRect box = GRect(x0 + col * cell, -2, cell - CELL_GAP, HEADER_H);
    prv_draw_centered(
        painter, WEEKDAY_LETTERS[col], box,
        col == today_weekday ? GColorWhite : PBL_IF_COLOR_ELSE(GColorLightGray, GColorWhite));
  }
}

static void prv_update_proc(Layer *layer, GContext *ctx) {
  const MatrixData *data = layer_get_data(layer);
  if (!data->grid) {
    return;
  }

  const GRect bounds = layer_get_bounds(layer);
  const int cell = prv_cell_size(bounds.size.w, bounds.size.h);
  // The last cell's trailing gap is not visible, so leave it out when centering.
  const int grid_w = cell * GOALGRID_DAYS_PER_WEEK - CELL_GAP;
  const int x0 = (bounds.size.w - grid_w) / 2;
  const int y0 = 0;

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
      const int days_ago = goalgrid_days_ago(data->today_weekday, row, col);
      const GRect rect =
          GRect(x0 + col * cell, y0 + HEADER_H + row * cell, cell - CELL_GAP, cell - CELL_GAP);
      prv_draw_cell(&cells, rect, days_ago);
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
