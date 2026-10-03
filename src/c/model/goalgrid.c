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
    goalgrid_init(grid, epoch_day);
    return;
  }
  memmove(&grid->days[shift], &grid->days[0], (GOALGRID_CAPACITY - shift) * sizeof(GoalDay));
  memset(&grid->days[0], 0, shift * sizeof(GoalDay));
  grid->epoch_day = epoch_day;
}

void goalgrid_set_today(GoalGrid *grid, uint8_t completed, uint8_t total) {
  grid->days[0].completed = completed;
  grid->days[0].total = total;
}

bool goalgrid_load(GoalGrid *grid, uint32_t epoch_day, const uint8_t *pairs, size_t len) {
  if (len % 2 != 0) {
    return false;
  }
  goalgrid_init(grid, epoch_day);
  for (size_t i = 0; i < len / 2 && i < GOALGRID_CAPACITY; i++) {
    grid->days[i].completed = pairs[2 * i];
    grid->days[i].total = pairs[2 * i + 1];
  }
  return true;
}

GoalDay goalgrid_day(const GoalGrid *grid, int days_ago) {
  if (days_ago < 0 || days_ago >= GOALGRID_CAPACITY) {
    return (GoalDay){0, 0};
  }
  return grid->days[days_ago];
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
