#include "check.h"
#include "model/goalgrid.h"

typedef struct {
  int year, month, day;
  uint32_t epoch_day;
  int weekday;
} CalendarCase;

// Expected values come from an independent oracle (Python's datetime), including
// century and 400-year boundaries where the civil-date arithmetic can go wrong.
static const CalendarCase kCalendarCases[] = {
    {1970, 1, 1, 0u, 4},       {1972, 2, 29, 789u, 2},   {1999, 12, 31, 10956u, 5},
    {2000, 2, 29, 11016u, 2},  {2000, 3, 1, 11017u, 3},  {2000, 12, 31, 11322u, 0},
    {2024, 2, 29, 19782u, 4},  {2026, 10, 2, 20728u, 5}, {2099, 12, 31, 47481u, 4},
    {2100, 2, 28, 47540u, 0},  {2100, 3, 1, 47541u, 1},  {2399, 12, 31, 157053u, 5},
    {2400, 2, 29, 157113u, 2}, {2400, 3, 1, 157114u, 3}, {2800, 2, 29, 303210u, 2},
    {2800, 3, 1, 303211u, 3},
};

// First and last day of every month in a leap and a non-leap year.
static const CalendarCase kMonthEdges[] = {
    {2024, 1, 1, 19723u, 1},   {2024, 1, 31, 19753u, 3},  {2024, 2, 1, 19754u, 4},
    {2024, 2, 29, 19782u, 4},  {2024, 3, 1, 19783u, 5},   {2024, 3, 31, 19813u, 0},
    {2024, 4, 1, 19814u, 1},   {2024, 4, 30, 19843u, 2},  {2024, 5, 1, 19844u, 3},
    {2024, 5, 31, 19874u, 5},  {2024, 6, 1, 19875u, 6},   {2024, 6, 30, 19904u, 0},
    {2024, 7, 1, 19905u, 1},   {2024, 7, 31, 19935u, 3},  {2024, 8, 1, 19936u, 4},
    {2024, 8, 31, 19966u, 6},  {2024, 9, 1, 19967u, 0},   {2024, 9, 30, 19996u, 1},
    {2024, 10, 1, 19997u, 2},  {2024, 10, 31, 20027u, 4}, {2024, 11, 1, 20028u, 5},
    {2024, 11, 30, 20057u, 6}, {2024, 12, 1, 20058u, 0},  {2024, 12, 31, 20088u, 2},
    {2025, 1, 1, 20089u, 3},   {2025, 1, 31, 20119u, 5},  {2025, 2, 1, 20120u, 6},
    {2025, 2, 28, 20147u, 5},  {2025, 3, 1, 20148u, 6},   {2025, 3, 31, 20178u, 1},
    {2025, 4, 1, 20179u, 2},   {2025, 4, 30, 20208u, 3},  {2025, 5, 1, 20209u, 4},
    {2025, 5, 31, 20239u, 6},  {2025, 6, 1, 20240u, 0},   {2025, 6, 30, 20269u, 1},
    {2025, 7, 1, 20270u, 2},   {2025, 7, 31, 20300u, 4},  {2025, 8, 1, 20301u, 5},
    {2025, 8, 31, 20331u, 0},  {2025, 9, 1, 20332u, 1},   {2025, 9, 30, 20361u, 2},
    {2025, 10, 1, 20362u, 3},  {2025, 10, 31, 20392u, 5}, {2025, 11, 1, 20393u, 6},
    {2025, 11, 30, 20422u, 0}, {2025, 12, 1, 20423u, 1},  {2025, 12, 31, 20453u, 3},
};

static void check_calendar_cases(const CalendarCase *cases, size_t count) {
  for (size_t i = 0; i < count; i++) {
    const CalendarCase *c = &cases[i];
    CHECK(goalgrid_epoch_day(c->year, c->month, c->day) == c->epoch_day);
    CHECK(goalgrid_weekday(c->epoch_day) == c->weekday);
    CHECK(goalgrid_day_of_month(c->epoch_day) == c->day);
  }
}

void test_calendar_math(void) {
  check_calendar_cases(kCalendarCases, sizeof(kCalendarCases) / sizeof(kCalendarCases[0]));
  check_calendar_cases(kMonthEdges, sizeof(kMonthEdges) / sizeof(kMonthEdges[0]));
}
