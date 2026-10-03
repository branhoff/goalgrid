#include "goalgrid.h"

#include <string.h>

uint32_t goalgrid_epoch_day(int year, int month, int day) {
  // Howard Hinnant's days_from_civil, shifted so March is month 0.
  year -= month <= 2;
  const int era = year / 400;
  const int yoe = year - era * 400;
  const int doy = (153 * (month + (month > 2 ? -3 : 9)) + 2) / 5 + day - 1;
  const int doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return (uint32_t)(era * 146097 + doe - 719468);
}

int goalgrid_weekday(uint32_t epoch_day) {
  // 1970-01-01 was a Thursday (4).
  return (int)((epoch_day + 4) % 7);
}

void goalgrid_init(GoalGrid *grid, uint32_t epoch_day) {
  memset(grid, 0, sizeof(*grid));
  grid->epoch_day = epoch_day;
}

void goalgrid_roll_to(GoalGrid *grid, uint32_t epoch_day) {
  if (epoch_day <= grid->epoch_day) {
    return;
  }
  const uint32_t shift = epoch_day - grid->epoch_day;
  if (shift >= GOALGRID_CAPACITY) {
    memset(grid->values, 0, sizeof(grid->values));  // keep the goal definitions
    grid->epoch_day = epoch_day;
    return;
  }
  for (int goal = 0; goal < GOALGRID_MAX_GOALS; goal++) {
    uint8_t *series = grid->values[goal];
    memmove(&series[shift], &series[0], GOALGRID_CAPACITY - shift);
    memset(&series[0], 0, shift);
  }
  grid->epoch_day = epoch_day;
}

static void copy_names(GoalGrid *grid, const char *names) {
  for (int goal = 0; names != NULL && goal < grid->goal_count; goal++) {
    const char *end = strchr(names, '\n');
    size_t len = end != NULL ? (size_t)(end - names) : strlen(names);
    len = len < GOALGRID_NAME_LEN - 1 ? len : GOALGRID_NAME_LEN - 1;
    memcpy(grid->names[goal], names, len);
    names = end != NULL ? end + 1 : NULL;
  }
}

static bool payload_valid(const GoalPayload *payload) {
  if (payload->goal_count > GOALGRID_MAX_GOALS ||
      payload->values_len != payload->goal_count * GOALGRID_CAPACITY) {
    return false;
  }
  if (payload->goal_count > 0 && (payload->types == NULL || payload->values == NULL)) {
    return false;
  }
  for (size_t goal = 0; goal < payload->goal_count; goal++) {
    if (payload->types[goal] > GOAL_COUNT) {
      return false;
    }
  }
  return true;
}

bool goalgrid_load(GoalGrid *grid, uint32_t epoch_day, const GoalPayload *payload) {
  if (!payload_valid(payload)) {
    return false;
  }
  GoalGrid loaded;
  goalgrid_init(&loaded, epoch_day);
  loaded.goal_count = (uint8_t)payload->goal_count;
  if (payload->goal_count > 0) {
    memcpy(loaded.types, payload->types, payload->goal_count);
    memcpy(loaded.values, payload->values, payload->values_len);
  }
  copy_names(&loaded, payload->names);
  *grid = loaded;
  return true;
}

GoalDay goalgrid_day(const GoalGrid *grid, int days_ago) {
  GoalDay day = {0, 0};
  if (days_ago < 0 || days_ago >= GOALGRID_CAPACITY) {
    return day;
  }
  day.total = grid->goal_count;
  for (int goal = 0; goal < grid->goal_count; goal++) {
    day.completed = (uint8_t)(day.completed + (grid->values[goal][days_ago] > 0 ? 1 : 0));
  }
  return day;
}

uint8_t goalgrid_level(GoalDay day) {
  if (day.total == 0 || day.completed == 0) {
    return 0;
  }
  if (day.completed >= day.total) {
    return 4;
  }
  const unsigned pct = (unsigned)day.completed * 100 / day.total;
  if (pct <= 33) {
    return 1;
  }
  if (pct <= 66) {
    return 2;
  }
  return 3;
}

int goalgrid_days_ago(int today_weekday, int row, int col) {
  const int today_linear = GOALGRID_CURRENT_WEEK_ROW * GOALGRID_DAYS_PER_WEEK + today_weekday;
  return today_linear - (row * GOALGRID_DAYS_PER_WEEK + col);
}

int goalgrid_day_of_month(uint32_t epoch_day) {
  // Howard Hinnant's civil_from_days (day part only).
  const uint32_t z = epoch_day + 719468;
  const uint32_t era = z / 146097;
  const uint32_t doe = z - era * 146097;
  const uint32_t yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  const uint32_t doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  const uint32_t mp = (5 * doy + 2) / 153;
  return (int)(doy - (153 * mp + 2) / 5 + 1);
}
