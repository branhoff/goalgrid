#include "check.h"
#include "model/goalgrid.h"

static void test_level(void) {
  CHECK(goalgrid_level((GoalDay){0, 0}) == 0);
  CHECK(goalgrid_level((GoalDay){0, 5}) == 0);
  CHECK(goalgrid_level((GoalDay){1, 5}) == 1);
  CHECK(goalgrid_level((GoalDay){1, 3}) == 1);
  CHECK(goalgrid_level((GoalDay){2, 4}) == 2);
  CHECK(goalgrid_level((GoalDay){1, 3}) == 1);  // 33%: top of the lowest bucket
  CHECK(goalgrid_level((GoalDay){2, 3}) == 2);  // 66%: top of the middle bucket
  CHECK(goalgrid_level((GoalDay){3, 4}) == 3);
  CHECK(goalgrid_level((GoalDay){1, 1}) == 4);
  CHECK(goalgrid_level((GoalDay){66, 100}) == 2);
  CHECK(goalgrid_level((GoalDay){67, 100}) == 3);
  CHECK(goalgrid_level((GoalDay){3, 4}) == 3);
  CHECK(goalgrid_level((GoalDay){4, 4}) == 4);
  CHECK(goalgrid_level((GoalDay){5, 4}) == 4);
}

static void test_roll(void) {
  GoalGrid grid;
  goalgrid_init(&grid, 100);
  goalgrid_set_today(&grid, 2, 3);

  goalgrid_roll_to(&grid, 100);  // same day: no-op
  CHECK(goalgrid_day(&grid, 0).completed == 2);

  goalgrid_roll_to(&grid, 99);  // past: ignored
  CHECK(grid.epoch_day == 100);

  goalgrid_roll_to(&grid, 102);
  CHECK(grid.epoch_day == 102);
  CHECK(goalgrid_day(&grid, 0).total == 0);
  CHECK(goalgrid_day(&grid, 1).total == 0);
  CHECK(goalgrid_day(&grid, 2).completed == 2);
  CHECK(goalgrid_day(&grid, 2).total == 3);

  goalgrid_set_today(&grid, 9, 9);
  goalgrid_roll_to(&grid, 102 + GOALGRID_CAPACITY + 5);  // gap wider than history wipes it
  CHECK(grid.epoch_day == 102 + GOALGRID_CAPACITY + 5);
  CHECK(goalgrid_day(&grid, 0).total == 0);
  goalgrid_set_today(&grid, 9, 9);
  goalgrid_roll_to(&grid, grid.epoch_day + GOALGRID_CAPACITY);  // exactly the history length
  CHECK(goalgrid_day(&grid, 0).total == 0);
  for (int i = 0; i < GOALGRID_CAPACITY; i++) {
    CHECK(goalgrid_day(&grid, i).completed == 0);
  }
}

static void test_roll_shifts_the_whole_history(void) {
  GoalGrid grid;
  goalgrid_init(&grid, 500);
  for (int i = 0; i < GOALGRID_CAPACITY; i++) {
    grid.days[i] = (GoalDay){(uint8_t)(i + 1), (uint8_t)(i + 50)};
  }

  const int shift = 3;
  goalgrid_roll_to(&grid, 500 + (uint32_t)shift);

  for (int i = 0; i < shift; i++) {
    CHECK(goalgrid_day(&grid, i).completed == 0 && goalgrid_day(&grid, i).total == 0);
  }
  for (int i = shift; i < GOALGRID_CAPACITY; i++) {
    CHECK(goalgrid_day(&grid, i).completed == i - shift + 1);
    CHECK(goalgrid_day(&grid, i).total == i - shift + 50);
  }
}

static void test_day_bounds(void) {
  GoalGrid grid;
  // Non-zero epoch bytes sit just before days[], so an off-by-one read is visible.
  goalgrid_init(&grid, 0x05050505u);
  const int outside[] = {-1, -100, GOALGRID_CAPACITY, GOALGRID_CAPACITY + 50};
  for (size_t i = 0; i < sizeof(outside) / sizeof(outside[0]); i++) {
    const GoalDay day = goalgrid_day(&grid, outside[i]);
    CHECK(day.completed == 0 && day.total == 0);
  }
}

static void test_load(void) {
  GoalGrid grid;
  goalgrid_init(&grid, 5);
  goalgrid_set_today(&grid, 1, 1);

  const uint8_t odd[] = {1, 2, 3};
  CHECK(!goalgrid_load(&grid, 50, odd, sizeof(odd)));
  CHECK(grid.epoch_day == 5 && goalgrid_day(&grid, 0).completed == 1);  // untouched

  const uint8_t pairs[] = {2, 4, 0, 5, 6, 7};
  CHECK(goalgrid_load(&grid, 50, pairs, sizeof(pairs)));
  CHECK(grid.epoch_day == 50);
  CHECK(goalgrid_day(&grid, 0).completed == 2 && goalgrid_day(&grid, 0).total == 4);
  CHECK(goalgrid_day(&grid, 1).completed == 0 && goalgrid_day(&grid, 1).total == 5);
  CHECK(goalgrid_day(&grid, 2).completed == 6 && goalgrid_day(&grid, 2).total == 7);
  CHECK(goalgrid_day(&grid, 3).total == 0);  // beyond supplied data

  uint8_t big[(GOALGRID_CAPACITY + 10) * 2];
  for (size_t i = 0; i < sizeof(big); i++) {
    big[i] = 1;
  }
  CHECK(goalgrid_load(&grid, 60, big, sizeof(big)));  // excess ignored, no overflow
  CHECK(goalgrid_day(&grid, GOALGRID_CAPACITY - 1).total == 1);
}

static void test_days_ago(void) {
  const int cur = GOALGRID_CURRENT_WEEK_ROW;

  // Today sits in the current-week row, at its weekday column.
  CHECK(goalgrid_days_ago(5, cur, 5) == 0);
  CHECK(goalgrid_days_ago(5, cur, 0) == 5);   // Sunday of this week
  CHECK(goalgrid_days_ago(5, cur, 6) == -1);  // tomorrow (Saturday)

  // Previous week: same column is exactly 7 days earlier.
  CHECK(goalgrid_days_ago(5, cur - 1, 5) == 7);
  CHECK(goalgrid_days_ago(5, cur - 1, 0) == 12);

  // Next week is entirely in the future.
  CHECK(goalgrid_days_ago(5, cur + 1, 0) == -2);
  CHECK(goalgrid_days_ago(5, cur + 1, 6) == -8);

  // Every past cell stays inside the stored history, for every weekday.
  for (int wd = 0; wd < GOALGRID_DAYS_PER_WEEK; wd++) {
    for (int row = 0; row < GOALGRID_WEEKS; row++) {
      for (int col = 0; col < GOALGRID_DAYS_PER_WEEK; col++) {
        CHECK(goalgrid_days_ago(wd, row, col) < GOALGRID_CAPACITY);
      }
    }
  }
}

void test_grid_behaviour(void) {
  test_level();
  test_roll();
  test_roll_shifts_the_whole_history();
  test_day_bounds();
  test_load();
  test_days_ago();
}
