#ifndef GOALGRID_UI_MATRIX_LAYER_H_
#define GOALGRID_UI_MATRIX_LAYER_H_

#include <pebble.h>

#include "../model/goalgrid.h"

// A Layer that draws a GitHub-style contribution grid for a GoalGrid.
typedef struct MatrixLayer MatrixLayer;

MatrixLayer *matrix_layer_create(GRect frame);
void matrix_layer_destroy(MatrixLayer *matrix);
Layer *matrix_layer_get_layer(const MatrixLayer *matrix);

// The grid is borrowed, not copied; call layer_mark_dirty after it changes.
void matrix_layer_set_grid(MatrixLayer *matrix, const GoalGrid *grid, int today_weekday);

// Height needed to draw the calendar at `width`, capped so it fits in
// `max_height`. Give the layer exactly this height; it top-aligns its content.
int matrix_layer_content_height(int width, int max_height);
// Rows of empty pixels above the weekday letters / below the last row, so
// callers can balance visible margins.
#define MATRIX_LAYER_TOP_INSET 3
#define MATRIX_LAYER_BOTTOM_INSET 2

#endif  // GOALGRID_UI_MATRIX_LAYER_H_
