#ifndef GOALGRID_TESTS_CHECK_H_
#define GOALGRID_TESTS_CHECK_H_

#include <stdio.h>

extern int g_failures;

#define CHECK(cond)                                          \
  do {                                                       \
    if (!(cond)) {                                           \
      printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); \
      g_failures++;                                          \
    }                                                        \
  } while (0)

void test_calendar_math(void);
void test_grid_behaviour(void);
void test_load_payload(void);
void test_layout(void);

#endif  // GOALGRID_TESTS_CHECK_H_
