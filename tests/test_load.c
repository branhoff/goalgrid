#include <string.h>

#include "check.h"
#include "model/goalgrid.h"

enum { kCap = GOALGRID_CAPACITY };

static GoalPayload payload_for(size_t goals, const uint8_t *types, const char *names,
                               const uint8_t *values) {
  return (GoalPayload){.types = types,
                       .goal_count = goals,
                       .names = names,
                       .values = values,
                       .values_len = goals * kCap};
}

static void fill(uint8_t *values, size_t goals) {
  for (size_t goal = 0; goal < goals; goal++) {
    for (size_t k = 0; k < kCap; k++) {
      values[goal * kCap + k] = (uint8_t)(goal * 50 + k + 1);
    }
  }
}

static void test_load_valid_payload(void) {
  uint8_t values[3 * kCap];
  fill(values, 3);
  const uint8_t types[] = {GOAL_BINARY, GOAL_COUNT, GOAL_BINARY};
  const GoalPayload payload = payload_for(3, types, "running\npushups\nreading", values);
  GoalGrid grid;
  CHECK(goalgrid_load(&grid, 700, &payload));
  CHECK(grid.epoch_day == 700 && grid.goal_count == 3);
  CHECK(grid.types[1] == GOAL_COUNT);
  CHECK(strcmp(grid.names[0], "running") == 0 && strcmp(grid.names[2], "reading") == 0);
  CHECK(grid.values[0][0] == 1 && grid.values[1][0] == 51 && grid.values[2][kCap - 1] == 121);
}

static void test_load_names_edge_cases(void) {
  uint8_t values[2 * kCap];
  fill(values, 2);
  const uint8_t types[] = {GOAL_BINARY, GOAL_BINARY};
  GoalGrid grid;
  GoalPayload payload = payload_for(2, types, NULL, values);
  CHECK(goalgrid_load(&grid, 1, &payload) && grid.names[0][0] == '\0');  // no names at all
  payload.names = "only one";
  CHECK(goalgrid_load(&grid, 1, &payload));
  CHECK(strcmp(grid.names[0], "only one") == 0 && grid.names[1][0] == '\0');
  payload.names = "0123456789abcdefXYZ\nb\nextra ignored";
  CHECK(goalgrid_load(&grid, 1, &payload));
  CHECK(strlen(grid.names[0]) == GOALGRID_NAME_LEN - 1);  // truncated, still terminated
  CHECK(strcmp(grid.names[1], "b") == 0);
}

static void test_load_name_length_boundaries(void) {
  uint8_t values[kCap];
  fill(values, 1);
  const uint8_t types[] = {GOAL_BINARY};
  const char *cases[] = {"0123456789abcd", "0123456789abcde", "0123456789abcdef",
                         "0123456789abcdefg"};
  const size_t expected[] = {14, 15, 15, 15};  // 15 characters plus the terminating NUL
  for (size_t i = 0; i < sizeof(cases) / sizeof(cases[0]); i++) {
    GoalGrid grid;
    const GoalPayload payload = payload_for(1, types, cases[i], values);
    CHECK(goalgrid_load(&grid, 1, &payload));
    CHECK(strlen(grid.names[0]) == expected[i]);
    CHECK(strncmp(grid.names[0], cases[i], expected[i]) == 0);
  }
}

// A name of 14 characters followed by a separator must not swallow the separator.
static void test_load_name_before_a_separator(void) {
  uint8_t values[2 * kCap];
  fill(values, 2);
  const uint8_t types[] = {GOAL_BINARY, GOAL_BINARY};
  GoalGrid grid;
  const GoalPayload payload = payload_for(2, types, "0123456789abcd\nnext", values);
  CHECK(goalgrid_load(&grid, 1, &payload));
  CHECK(strcmp(grid.names[0], "0123456789abcd") == 0);
  CHECK(strcmp(grid.names[1], "next") == 0);
}

static void test_load_ignores_names_beyond_the_goal_count(void) {
  uint8_t values[2 * kCap];
  fill(values, 2);
  const uint8_t types[] = {GOAL_BINARY, GOAL_BINARY};
  GoalGrid grid;
  const GoalPayload payload = payload_for(2, types, "a\nb\nc\nd", values);
  CHECK(goalgrid_load(&grid, 1, &payload));
  CHECK(strcmp(grid.names[1], "b") == 0);
  CHECK(grid.names[2][0] == '\0' && grid.names[3][0] == '\0');
}

static void test_load_zero_goals_is_valid_and_empty(void) {
  GoalGrid grid;
  const GoalPayload none = {.goal_count = 0, .values_len = 0};
  CHECK(goalgrid_load(&grid, 9, &none));
  CHECK(grid.goal_count == 0 && goalgrid_day(&grid, 0).total == 0);
}

static void test_load_at_the_goal_limit(void) {
  uint8_t values[GOALGRID_MAX_GOALS * kCap];
  fill(values, GOALGRID_MAX_GOALS);
  const uint8_t types[GOALGRID_MAX_GOALS] = {0};
  GoalGrid grid;
  const GoalPayload ok = payload_for(GOALGRID_MAX_GOALS, types, NULL, values);
  CHECK(goalgrid_load(&grid, 1, &ok));
  CHECK(grid.values[GOALGRID_MAX_GOALS - 1][kCap - 1] == 4 * 50 + kCap);
}

// Member-wise: the struct has padding bytes, so a whole-struct memcmp is unreliable.
static bool same_grid(const GoalGrid *a, const GoalGrid *b) {
  return a->epoch_day == b->epoch_day && a->goal_count == b->goal_count &&
         memcmp(a->types, b->types, sizeof(a->types)) == 0 &&
         memcmp(a->names, b->names, sizeof(a->names)) == 0 &&
         memcmp(a->values, b->values, sizeof(a->values)) == 0;
}

// A rejected payload must leave the previous grid exactly as it was.
static void check_rejected(const GoalPayload *payload) {
  GoalGrid grid;
  goalgrid_init(&grid, 42);
  grid.goal_count = 1;
  grid.values[0][0] = 7;
  const GoalGrid before = grid;
  CHECK(!goalgrid_load(&grid, 999, payload));
  CHECK(same_grid(&grid, &before));
}

static void test_load_rejects_bad_payloads(void) {
  uint8_t values[(GOALGRID_MAX_GOALS + 1) * kCap];
  fill(values, GOALGRID_MAX_GOALS + 1);
  const uint8_t types[GOALGRID_MAX_GOALS + 1] = {0};
  const uint8_t bad_types[] = {GOAL_BINARY, 2};
  const uint8_t bad_first_type[] = {2, GOAL_BINARY};

  GoalPayload too_many = payload_for(GOALGRID_MAX_GOALS + 1, types, NULL, values);
  check_rejected(&too_many);
  GoalPayload short_values = payload_for(2, types, NULL, values);
  short_values.values_len -= 1;
  check_rejected(&short_values);
  GoalPayload long_values = payload_for(2, types, NULL, values);
  long_values.values_len += 1;
  check_rejected(&long_values);
  GoalPayload unknown_type = payload_for(2, bad_types, NULL, values);
  check_rejected(&unknown_type);
  GoalPayload unknown_first_type = payload_for(2, bad_first_type, NULL, values);
  check_rejected(&unknown_first_type);
  GoalPayload no_types = payload_for(1, NULL, NULL, values);
  check_rejected(&no_types);
  GoalPayload no_values = payload_for(1, types, NULL, NULL);
  check_rejected(&no_values);
}

void test_load_payload(void) {
  test_load_valid_payload();
  test_load_names_edge_cases();
  test_load_name_length_boundaries();
  test_load_name_before_a_separator();
  test_load_ignores_names_beyond_the_goal_count();
  test_load_zero_goals_is_valid_and_empty();
  test_load_at_the_goal_limit();
  test_load_rejects_bad_payloads();
}
