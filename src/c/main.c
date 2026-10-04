#include <pebble.h>

#include "model/goalgrid.h"
#include "model/layout.h"
#include "ui/matrix_layer.h"

#define PERSIST_KEY_GRID 1
#define INBOX_SIZE 512
#define OUTBOX_SIZE 64
#define REFRESH_MINUTES 30
#define REFRESH_DEBOUNCE_SEC 10

_Static_assert(sizeof(GoalGrid) <= PERSIST_DATA_MAX_LENGTH, "grid must fit one persist key");

static Window *s_window;
static TextLayer *s_time_layer;
static TextLayer *s_date_layer;
static MatrixLayer *s_matrix;
static GoalGrid s_grid;
static int s_today_weekday;
static time_t s_last_request;

static uint32_t prv_today_epoch_day(const struct tm *now) {
  return goalgrid_epoch_day(now->tm_year + 1900, now->tm_mon + 1, now->tm_mday);
}

static void prv_load_grid(const struct tm *now) {
  const uint32_t today = prv_today_epoch_day(now);
  if (persist_get_size(PERSIST_KEY_GRID) == (int)sizeof(s_grid) &&
      persist_read_data(PERSIST_KEY_GRID, &s_grid, sizeof(s_grid)) == (int)sizeof(s_grid)) {
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
  // Day and weekday are redundant: the grid boxes today under its weekday column, so the
  // header carries only what the grid can't show -- the month (3-letter) and year.
  strftime(s_date_buffer, sizeof(s_date_buffer), "%b %Y", now);
  text_layer_set_text(s_time_layer, s_time_buffer[0] == ' ' ? s_time_buffer + 1 : s_time_buffer);
  text_layer_set_text(s_date_layer, s_date_buffer);

  goalgrid_roll_to(&s_grid, prv_today_epoch_day(now));
  s_today_weekday = now->tm_wday;
  matrix_layer_set_grid(s_matrix, &s_grid, s_today_weekday);
}

// The watch defines "today": it tells the phone which local day the window ends on.
static void prv_request_grid(void) {
  const time_t t = time(NULL);
  DictionaryIterator *out;
  if (app_message_outbox_begin(&out) != APP_MSG_OK) {
    return;
  }
  dict_write_uint8(out, MESSAGE_KEY_REQUEST_GRID, 1);
  dict_write_uint32(out, MESSAGE_KEY_GRID_EPOCH_DAY, prv_today_epoch_day(localtime(&t)));
  app_message_outbox_send();
  s_last_request = t;
}

// A wrist flick lands as a tap/shake: Pebble has no raise-to-wake event, so this is how we
// refresh when the user looks. Debounced so repeated flicks don't spam the phone.
static void prv_tap_handler(AccelAxisType axis, int32_t direction) {
  if (time(NULL) - s_last_request >= REFRESH_DEBOUNCE_SEC) {
    prv_request_grid();
  }
}

static void prv_tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  prv_update();
  if (tick_time->tm_min % REFRESH_MINUTES == 0) {
    prv_request_grid();
  }
}

static void prv_apply_grid(DictionaryIterator *iter, const Tuple *epoch_day) {
  const Tuple *types = dict_find(iter, MESSAGE_KEY_GRID_TYPES);
  const Tuple *values = dict_find(iter, MESSAGE_KEY_GRID_VALUES);
  const Tuple *names = dict_find(iter, MESSAGE_KEY_GRID_NAMES);
  const GoalPayload payload = {
      .types = types ? types->value->data : NULL,
      .goal_count = types ? types->length : 0,
      .names = names ? names->value->cstring : NULL,
      .values = values ? values->value->data : NULL,
      .values_len = values ? values->length : 0,
  };
  if (!goalgrid_load(&s_grid, epoch_day->value->uint32, &payload)) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "rejected grid payload (%d goals)", (int)payload.goal_count);
    return;
  }
  if (s_matrix) {
    prv_update();
  }
}

static void prv_inbox_received(DictionaryIterator *iter, void *context) {
  if (dict_find(iter, MESSAGE_KEY_READY)) {
    prv_request_grid();
  }
  const Tuple *epoch_day = dict_find(iter, MESSAGE_KEY_GRID_EPOCH_DAY);
  if (epoch_day) {
    prv_apply_grid(iter, epoch_day);
  }
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

  const Layout layout =
      layout_compute(bounds.size.w, bounds.size.h, PBL_IF_ROUND_ELSE(true, false));
  s_time_layer = prv_text_layer_create(root, GRect(0, layout.time_y, bounds.size.w, LAYOUT_TIME_H),
                                       FONT_KEY_BITHAM_42_BOLD);
  s_date_layer = prv_text_layer_create(root, GRect(0, layout.date_y, bounds.size.w, LAYOUT_DATE_H),
                                       FONT_KEY_GOTHIC_18_BOLD);
  s_matrix = matrix_layer_create(GRect(layout.cal_x, layout.cal_y, layout.cal_w, layout.cal_h));
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
