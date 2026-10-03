add_executable(test_goalgrid test_main.c test_calendar.c test_grid.c test_load.c test_layout.c)
target_link_libraries(test_goalgrid PRIVATE goalgrid_model)
add_test(NAME goalgrid COMMAND test_goalgrid)

find_program(NODE_EXECUTABLE node)
if(NODE_EXECUTABLE)
  add_test(NAME pkjs COMMAND ${NODE_EXECUTABLE} --test ${CMAKE_CURRENT_SOURCE_DIR}/*.test.js
           WORKING_DIRECTORY ${CMAKE_SOURCE_DIR})
endif()

find_program(PYTHON_EXECUTABLE python3)
if(PYTHON_EXECUTABLE)
  add_test(NAME habit_hooks_c
           COMMAND ${PYTHON_EXECUTABLE} -m unittest discover -s ${CMAKE_SOURCE_DIR}/tools/habit-hooks-c/tests
           WORKING_DIRECTORY ${CMAKE_SOURCE_DIR})
  add_test(NAME fixtures_current
           COMMAND ${PYTHON_EXECUTABLE} ${CMAKE_SOURCE_DIR}/tools/gen_fixtures.py --check)
endif()
