#include <string.h>

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
  CHECK(goalgrid_level((GoalDay){3, 0}) == 0);  // progress with no goals defined: nothing to show
  CHECK(goalgrid_level((GoalDay){66, 100}) == 2);
  CHECK(goalgrid_level((GoalDay){67, 100}) == 3);
  CHECK(goalgrid_level((GoalDay){3, 4}) == 3);
  CHECK(goalgrid_level((GoalDay){4, 4}) == 4);
  CHECK(goalgrid_level((GoalDay){5, 4}) == 4);
}

// Two goals with distinct, easy-to-track values: goal g, k days back = 10*(g+1) + k.
static GoalGrid sample_grid(uint32_t epoch_day) {
  GoalGrid grid;
  goalgrid_init(&grid, epoch_day);
  grid.goal_count = 2;
  strcpy(grid.names[0], "run");
  strcpy(grid.names[1], "read");
  for (int goal = 0; goal < 2; goal++) {
    for (int k = 0; k < GOALGRID_CAPACITY; k++) {
      grid.values[goal][k] = (uint8_t)(10 * (goal + 1) + k);
    }
  }
  return grid;
}

static void test_roll_ignores_same_and_earlier_days(void) {
  GoalGrid grid = sample_grid(100);
  goalgrid_roll_to(&grid, 100);
  goalgrid_roll_to(&grid, 99);
  CHECK(grid.epoch_day == 100);
  CHECK(grid.values[0][0] == 10 && grid.values[1][GOALGRID_CAPACITY - 1] == 40);
}

static void test_roll_shifts_every_goal(void) {
  GoalGrid grid = sample_grid(500);
  const int shift = 3;
  goalgrid_roll_to(&grid, 500 + (uint32_t)shift);
  CHECK(grid.epoch_day == 503);
  for (int goal = 0; goal < 2; goal++) {
    for (int k = 0; k < shift; k++) {
      CHECK(grid.values[goal][k] == 0);
    }
    for (int k = shift; k < GOALGRID_CAPACITY; k++) {
      CHECK(grid.values[goal][k] == 10 * (goal + 1) + (k - shift));
    }
  }
  CHECK(grid.goal_count == 2 && strcmp(grid.names[1], "read") == 0);
}

static void test_roll_past_the_history_keeps_goals_but_clears_values(void) {
  const uint32_t gaps[] = {GOALGRID_CAPACITY, GOALGRID_CAPACITY + 5};
  for (size_t i = 0; i < sizeof(gaps) / sizeof(gaps[0]); i++) {
    GoalGrid grid = sample_grid(100);
    goalgrid_roll_to(&grid, 100 + gaps[i]);
    CHECK(grid.epoch_day == 100 + gaps[i]);
    CHECK(grid.goal_count == 2 && strcmp(grid.names[0], "run") == 0);
    for (int k = 0; k < GOALGRID_CAPACITY; k++) {
      CHECK(grid.values[0][k] == 0 && grid.values[1][k] == 0);
    }
  }
}

static void test_day_counts_goals_with_progress(void) {
  GoalGrid grid = sample_grid(100);
  grid.values[1][2] = 0;
  const GoalDay day = goalgrid_day(&grid, 2);
  CHECK(day.completed == 1 && day.total == 2);
  const GoalDay first = goalgrid_day(&grid, 0);
  CHECK(first.completed == 2 && first.total == 2);
}

// A binary goal reports exactly 1 when done; that must count as progress.
static void test_a_value_of_one_counts_as_progress(void) {
  GoalGrid grid = sample_grid(100);
  grid.values[0][4] = 1;
  grid.values[1][4] = 0;
  CHECK(goalgrid_day(&grid, 4).completed == 1);
  grid.values[0][4] = 0;
  CHECK(goalgrid_day(&grid, 4).completed == 0);
}

static void test_day_outside_history_is_empty(void) {
  GoalGrid grid = sample_grid(0x05050505u);
  const int outside[] = {-1, -100, GOALGRID_CAPACITY, GOALGRID_CAPACITY + 50};
  for (size_t i = 0; i < sizeof(outside) / sizeof(outside[0]); i++) {
    const GoalDay day = goalgrid_day(&grid, outside[i]);
    CHECK(day.completed == 0 && day.total == 0);
  }
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
  test_roll_ignores_same_and_earlier_days();
  test_roll_shifts_every_goal();
  test_roll_past_the_history_keeps_goals_but_clears_values();
  test_day_counts_goals_with_progress();
  test_a_value_of_one_counts_as_progress();
  test_day_outside_history_is_empty();
  test_days_ago();
}
