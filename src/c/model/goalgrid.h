#ifndef GOALGRID_MODEL_GOALGRID_H_
#define GOALGRID_MODEL_GOALGRID_H_

// Pure goal-tracking model. Deliberately free of <pebble.h> so it can be
// compiled and unit-tested on the host (see tests/ and CMakeLists.txt).

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define GOALGRID_WEEKS 3  // previous, current, next
#define GOALGRID_CURRENT_WEEK_ROW 1
#define GOALGRID_DAYS_PER_WEEK 7
enum { GOALGRID_CAPACITY = GOALGRID_WEEKS * GOALGRID_DAYS_PER_WEEK };
#define GOALGRID_LEVELS 5  // 0 = nothing done ... 4 = every goal met

typedef struct {
  uint8_t completed;
  uint8_t total;
} GoalDay;

typedef struct {
  uint32_t epoch_day;               // day number of days[0]
  GoalDay days[GOALGRID_CAPACITY];  // days[k] is k days before epoch_day
} GoalGrid;

// Days since 1970-01-01 for a civil date (year >= 1970, month 1-12, day 1-31).
uint32_t goalgrid_epoch_day(int year, int month, int day);

// Day of week for an epoch day: 0 = Sunday ... 6 = Saturday.
int goalgrid_weekday(uint32_t epoch_day);

void goalgrid_init(GoalGrid *grid, uint32_t epoch_day);

// Advance to a later day, shifting history. Earlier or equal days are ignored;
// gaps longer than the capacity clear the whole grid.
void goalgrid_roll_to(GoalGrid *grid, uint32_t epoch_day);

void goalgrid_set_today(GoalGrid *grid, uint8_t completed, uint8_t total);

// Replace the whole grid from the wire format sent by the phone: `len` bytes of
// [completed, total] pairs, index 0 = today. Fails (grid untouched) on an odd
// length; pairs beyond the capacity are ignored, missing pairs stay empty.
bool goalgrid_load(GoalGrid *grid, uint32_t epoch_day, const uint8_t *pairs, size_t len);

// Returns an empty day when days_ago is out of range.
GoalDay goalgrid_day(const GoalGrid *grid, int days_ago);

// Intensity bucket 0..GOALGRID_LEVELS-1 for a day.
uint8_t goalgrid_level(GoalDay day);

int goalgrid_day_of_month(uint32_t epoch_day);

// Calendar layout: rows are weeks (previous, current, next), columns are
// weekdays (Sunday first). Returns how many days before today the cell at
// (row, col) is; negative means it is in the future.
int goalgrid_days_ago(int today_weekday, int row, int col);

#endif  // GOALGRID_MODEL_GOALGRID_H_
