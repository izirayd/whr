cmake_minimum_required(VERSION 3.20)

project(whr_system LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(whr INTERFACE)
target_include_directories(whr INTERFACE "${CMAKE_CURRENT_SOURCE_DIR}/include")

include(FetchContent)

if(MSVC)
  set(gtest_force_shared_crt ON CACHE BOOL "Use shared CRT for GoogleTest" FORCE)
endif()

FetchContent_Declare(
  googletest
  GIT_REPOSITORY https://github.com/google/googletest.git
  GIT_TAG v1.14.0
)
FetchContent_MakeAvailable(googletest)

FetchContent_Declare(
  sqlite_autoconf
  URL https://www.sqlite.org/2024/sqlite-autoconf-3450200.tar.gz
)
FetchContent_MakeAvailable(sqlite_autoconf)

add_library(
  sqlite3_amalgamation
  STATIC
  "${sqlite_autoconf_SOURCE_DIR}/sqlite3.c"
)
target_include_directories(sqlite3_amalgamation PUBLIC "${sqlite_autoconf_SOURCE_DIR}")
if(MSVC)
  target_compile_definitions(sqlite3_amalgamation PRIVATE _CRT_SECURE_NO_WARNINGS)
endif()

function(configure_whr_app target_name source_file)
  add_executable(${target_name} ${source_file})
  target_include_directories(${target_name} PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/apps/common")
  target_link_libraries(${target_name} PRIVATE whr sqlite3_amalgamation)
  set_target_properties(
    ${target_name}
    PROPERTIES
      RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
      RUNTIME_OUTPUT_DIRECTORY_DEBUG "${CMAKE_BINARY_DIR}/bin"
      RUNTIME_OUTPUT_DIRECTORY_RELEASE "${CMAKE_BINARY_DIR}/bin"
      RUNTIME_OUTPUT_DIRECTORY_RELWITHDEBINFO "${CMAKE_BINARY_DIR}/bin"
      RUNTIME_OUTPUT_DIRECTORY_MINSIZEREL "${CMAKE_BINARY_DIR}/bin"
  )
endfunction()

configure_whr_app(whr_simulate apps/simulate/main.cpp)
configure_whr_app(whr_recalc apps/recalc/main.cpp)
configure_whr_app(whr_debug_duel apps/debug_duel/main.cpp)

enable_testing()

add_executable(
  whr_tests
  tests/test_math.cpp
  tests/test_match.cpp
  tests/test_player_history.cpp
  tests/test_interpolation.cpp
  tests/test_tridiagonal.cpp
  tests/test_matchmaking.cpp
  tests/test_likelihood_terms.cpp
  tests/test_engine.cpp
  tests/test_incremental_performance.cpp
)

target_link_libraries(whr_tests PRIVATE whr GTest::gtest_main)

include(GoogleTest)
gtest_discover_tests(whr_tests)

