#ifndef GOALGRID_UI_MATRIX_LAYER_H_
#define GOALGRID_UI_MATRIX_LAYER_H_

#include <pebble.h>

#include "../model/goalgrid.h"
#include "theme.h"

// A Layer that draws a GitHub-style contribution grid for a GoalGrid.
typedef struct MatrixLayer MatrixLayer;

MatrixLayer *matrix_layer_create(GRect frame);
void matrix_layer_destroy(MatrixLayer *matrix);
Layer *matrix_layer_get_layer(const MatrixLayer *matrix);

// The grid is borrowed, not copied; call layer_mark_dirty after it changes.
void matrix_layer_set_grid(MatrixLayer *matrix, const GoalGrid *grid, int today_weekday);

// Choose the color scheme (color screens only); redraws.
void matrix_layer_set_theme(MatrixLayer *matrix, Theme theme);

#endif  // GOALGRID_UI_MATRIX_LAYER_H_
