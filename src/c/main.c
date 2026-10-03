#include <pebble.h>

#include "model/goalgrid.h"
#include "ui/matrix_layer.h"

#define PERSIST_KEY_GRID 1
#define INBOX_SIZE 512
#define OUTBOX_SIZE 32

static Window *s_window;
static TextLayer *s_time_layer;
static TextLayer *s_date_layer;
static MatrixLayer *s_matrix;
static GoalGrid s_grid;
static int s_today_weekday;

static uint32_t prv_today_epoch_day(const struct tm *now) {
  return goalgrid_epoch_day(now->tm_year + 1900, now->tm_mon + 1, now->tm_mday);
}

static void prv_load_grid(const struct tm *now) {
  const uint32_t today = prv_today_epoch_day(now);
  if (persist_read_data(PERSIST_KEY_GRID, &s_grid, sizeof(s_grid)) == (int)sizeof(s_grid)) {
    goalgrid_roll_to(&s_grid, today);
  } else {
    goalgrid_init(&s_grid, today);
  }
}

static void prv_update(void) {
  const time_t t = time(NULL);
  const struct tm *now = localtime(&t);

  static char s_time_buffer[8];
  static char s_date_buffer[16];
  strftime(s_time_buffer, sizeof(s_time_buffer), clock_is_24h_style() ? "%H:%M" : "%l:%M", now);
  strftime(s_date_buffer, sizeof(s_date_buffer), "%a %b ", now);
  snprintf(s_date_buffer + strlen(s_date_buffer), sizeof(s_date_buffer) - strlen(s_date_buffer),
           "%d", now->tm_mday);
  text_layer_set_text(s_time_layer, s_time_buffer[0] == ' ' ? s_time_buffer + 1 : s_time_buffer);
  text_layer_set_text(s_date_layer, s_date_buffer);

  goalgrid_roll_to(&s_grid, prv_today_epoch_day(now));
  s_today_weekday = now->tm_wday;
  matrix_layer_set_grid(s_matrix, &s_grid, s_today_weekday);
}

static void prv_tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  prv_update();
}

// The phone pushes the whole grid (fixtures for now, a service later).
static void prv_inbox_received(DictionaryIterator *iter, void *context) {
  const Tuple *epoch_day = dict_find(iter, MESSAGE_KEY_GRID_EPOCH_DAY);
  Tuple *days = dict_find(iter, MESSAGE_KEY_GRID_DAYS);
  if (!epoch_day || !days) {
    return;
  }
  if (!goalgrid_load(&s_grid, epoch_day->value->uint32, days->value->data, days->length)) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "bad grid payload (%d bytes)", (int)days->length);
    return;
  }
  if (s_matrix) {
    prv_update();
  }
}

// A wrist tap asks the phone for the next fixture, for quick UI review.
// (Watchfaces cannot use the buttons: the OS reserves them for timeline/launcher.)
static void prv_tap_handler(AccelAxisType axis, int32_t direction) {
  DictionaryIterator *out;
  if (app_message_outbox_begin(&out) != APP_MSG_OK) {
    return;
  }
  dict_write_int32(out, MESSAGE_KEY_FIXTURE_STEP, 1);
  app_message_outbox_send();
}

static TextLayer *prv_text_layer_create(Layer *parent, GRect frame, const char *font_key) {
  TextLayer *layer = text_layer_create(frame);
  text_layer_set_background_color(layer, GColorClear);
  text_layer_set_text_color(layer, GColorWhite);
  text_layer_set_font(layer, fonts_get_system_font(font_key));
  text_layer_set_text_alignment(layer, GTextAlignmentCenter);
  layer_add_child(parent, text_layer_get_layer(layer));
  return layer;
}

static void prv_window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  const GRect bounds = layer_get_bounds(root);
  window_set_background_color(window, GColorBlack);

  // Vertical layout: the visible pixels of the time, date and calendar are
  // separated by three equal gaps (top margin, below the date, bottom margin).
  // The constants are glyph offsets of the system fonts used below.
  const int time_h = 46;
  const int date_h = 26;
  const int time_glyph_top = 12;     // blank rows above Bitham 42 digits
  const int date_glyph_bottom = 17;  // Gothic 18 baseline inside its box
  const int text_visible_h =
      time_h + date_glyph_bottom - time_glyph_top;  // time top -> date bottom

  const int side_pad = PBL_IF_ROUND_ELSE(bounds.size.w / 10, 2);
  const int cal_w = bounds.size.w - 2 * side_pad;
  const int cal_h = matrix_layer_content_height(cal_w, bounds.size.h - text_visible_h - 12);
  const int cal_visible_h = cal_h - MATRIX_LAYER_TOP_INSET - MATRIX_LAYER_BOTTOM_INSET;

  const int gap = (bounds.size.h - text_visible_h - cal_visible_h) / 3;
  const int time_y = gap - time_glyph_top;
  const int date_y = time_y + time_h;
  const int cal_y = date_y + date_glyph_bottom + gap - MATRIX_LAYER_TOP_INSET;

  s_time_layer =
      prv_text_layer_create(root, GRect(0, time_y, bounds.size.w, time_h), FONT_KEY_BITHAM_42_BOLD);
  s_date_layer =
      prv_text_layer_create(root, GRect(0, date_y, bounds.size.w, date_h), FONT_KEY_GOTHIC_18_BOLD);
  s_matrix = matrix_layer_create(GRect(side_pad, cal_y, cal_w, cal_h));
  layer_add_child(root, matrix_layer_get_layer(s_matrix));

  prv_update();
}

static void prv_window_unload(Window *window) {
  text_layer_destroy(s_time_layer);
  text_layer_destroy(s_date_layer);
  matrix_layer_destroy(s_matrix);
}

static void prv_init(void) {
  const time_t t = time(NULL);
  prv_load_grid(localtime(&t));

  s_window = window_create();
  app_message_register_inbox_received(prv_inbox_received);
  app_message_open(INBOX_SIZE, OUTBOX_SIZE);
  window_set_window_handlers(s_window, (WindowHandlers){
                                           .load = prv_window_load,
                                           .unload = prv_window_unload,
                                       });
  window_stack_push(s_window, true);
  tick_timer_service_subscribe(MINUTE_UNIT, prv_tick_handler);
  accel_tap_service_subscribe(prv_tap_handler);
}

static void prv_deinit(void) {
  accel_tap_service_unsubscribe();
  tick_timer_service_unsubscribe();
  persist_write_data(PERSIST_KEY_GRID, &s_grid, sizeof(s_grid));
  window_destroy(s_window);
}

int main(void) {
  prv_init();
  app_event_loop();
  prv_deinit();
}
