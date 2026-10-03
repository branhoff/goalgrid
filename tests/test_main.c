#include "check.h"

int g_failures;

int main(void) {
  test_calendar_math();
  test_grid_behaviour();
  if (g_failures == 0) {
    printf("all tests passed\n");
  }
  return g_failures == 0 ? 0 : 1;
}
