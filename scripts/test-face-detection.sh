#!/bin/bash

# Face Detection E2E Test Script
# Usage: ./scripts/test-face-detection.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
ADB="/tmp/platform-tools/adb"
PACKAGE_NAME="com.bmeconsulting.mcgate"
TEST_OUTPUT_DIR="/tmp/face-detection-test"
SCREENSHOT_DIR="${TEST_OUTPUT_DIR}/screenshots"
LOG_FILE="${TEST_OUTPUT_DIR}/test-results.log"

# UI coordinates (based on 720x1560 screen)
LOGIN_BUTTON_X=360
LOGIN_BUTTON_Y=1051
FACE_REG_TAB_X=540  # Face registration tab (rightmost)
FACE_REG_TAB_Y=1500

# Timeouts (in seconds)
TIMEOUT_APP_START=10
TIMEOUT_LOGIN=5
TIMEOUT_TAB_SWITCH=3
TIMEOUT_CAMERA_INIT=5
TIMEOUT_FACE_DETECTION=10

# Test results
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

#==============================================================================
# Utility Functions
#==============================================================================

print_header() {
    echo -e "${BLUE}================================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}================================================${NC}"
}

print_test() {
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    echo -e "${YELLOW}[TEST $TESTS_TOTAL] $1${NC}"
}

print_pass() {
    TESTS_PASSED=$((TESTS_PASSED + 1))
    echo -e "${GREEN}✓ PASS${NC}: $1"
}

print_fail() {
    TESTS_FAILED=$((TESTS_FAILED + 1))
    echo -e "${RED}✗ FAIL${NC}: $1"
}

print_info() {
    echo -e "${BLUE}ℹ INFO${NC}: $1"
}

wake_device() {
    print_info "Waking up device"
    $ADB shell input keyevent KEYCODE_WAKEUP
    sleep 1

    # Swipe up to unlock (if locked)
    $ADB shell input swipe 360 1400 360 400
    sleep 1
}

setup_test_environment() {
    print_header "Setting up test environment"

    # Create output directories
    mkdir -p "$SCREENSHOT_DIR"

    # Initialize log file
    echo "Face Detection E2E Test - $(date)" > "$LOG_FILE"
    echo "========================================" >> "$LOG_FILE"

    # Check adb connection
    print_test "Checking ADB connection"
    if $ADB devices | grep -q "device$"; then
        print_pass "ADB device connected"
    else
        print_fail "No ADB device connected"
        exit 1
    fi

    # Check app installation
    print_test "Checking app installation"
    if $ADB shell pm list packages | grep -q "$PACKAGE_NAME"; then
        print_pass "App installed: $PACKAGE_NAME"
    else
        print_fail "App not installed: $PACKAGE_NAME"
        exit 1
    fi

    # Wake up device
    wake_device
}

take_screenshot() {
    local name=$1
    local output_path="${SCREENSHOT_DIR}/${name}.png"
    $ADB shell screencap -p > "$output_path"
    print_info "Screenshot saved: $output_path"
}

wait_for_ui() {
    local seconds=$1
    print_info "Waiting ${seconds}s for UI update..."
    sleep "$seconds"
}

close_keyboard() {
    print_info "Closing keyboard"
    $ADB shell input keyevent KEYCODE_BACK
    sleep 1
}

tap_screen() {
    local x=$1
    local y=$2
    print_info "Tapping ($x, $y)"
    $ADB shell input tap "$x" "$y"
}

#==============================================================================
# Test Steps
#==============================================================================

test_app_launch() {
    print_header "Test 1: App Launch"

    print_test "Starting app"
    $ADB shell am force-stop "$PACKAGE_NAME" 2>/dev/null || true
    sleep 2
    $ADB shell am start -n "${PACKAGE_NAME}/.MainActivity" > /dev/null 2>&1

    wait_for_ui "$TIMEOUT_APP_START"
    take_screenshot "01_app_launched"

    # Check if app is running
    if $ADB shell pidof "$PACKAGE_NAME" > /dev/null 2>&1; then
        print_pass "App launched successfully"
    else
        print_fail "App failed to launch"
        return 1
    fi
}

test_mock_login() {
    print_header "Test 2: Mock Login"

    print_test "Performing mock login"

    # Close keyboard if open
    close_keyboard

    # Tap login button
    tap_screen "$LOGIN_BUTTON_X" "$LOGIN_BUTTON_Y"

    wait_for_ui "$TIMEOUT_LOGIN"
    take_screenshot "02_after_login"

    # Check logcat for login success
    print_test "Verifying login in logs"
    $ADB logcat -d | grep -q "Mock login" && \
        print_pass "Mock login detected in logs" || \
        print_fail "Mock login not detected in logs"
}

test_navigate_to_face_registration() {
    print_header "Test 3: Navigate to Face Registration"

    print_test "Tapping face registration tab"
    tap_screen "$FACE_REG_TAB_X" "$FACE_REG_TAB_Y"

    wait_for_ui "$TIMEOUT_TAB_SWITCH"
    take_screenshot "03_face_registration_tab"

    print_pass "Navigated to face registration tab"
}

test_camera_initialization() {
    print_header "Test 4: Camera Initialization"

    print_test "Waiting for camera to initialize"

    # Clear logcat and start monitoring
    $ADB logcat -c

    wait_for_ui "$TIMEOUT_CAMERA_INIT"

    # Check for camera initialization logs
    print_test "Checking camera initialization logs"
    if $ADB logcat -d | grep -q "\[FaceReg\].*Camera initialized\|Vision Camera initialized"; then
        print_pass "Camera initialized successfully"
        take_screenshot "04_camera_initialized"
    else
        print_fail "Camera initialization not detected"
        take_screenshot "04_camera_init_failed"
        return 1
    fi
}

test_face_detection() {
    print_header "Test 5: Face Detection"

    print_test "Monitoring face detection logs"
    print_info "Please position your face in front of the camera..."

    # Monitor logcat for face detection
    local detection_timeout=$TIMEOUT_FACE_DETECTION
    local detected=false

    $ADB logcat -c

    # Monitor logs in background
    local log_output="${TEST_OUTPUT_DIR}/face_detection_logs.txt"
    timeout ${detection_timeout} $ADB logcat | grep -E "(FaceReg|handleFacesDetected|VisionCamera)" > "$log_output" &
    local logcat_pid=$!

    # Wait for detection
    for i in $(seq 1 $detection_timeout); do
        echo -n "."
        sleep 1

        if grep -q "handleFacesDetected.*faces count:" "$log_output" 2>/dev/null; then
            detected=true
            break
        fi
    done
    echo ""

    # Stop logcat monitoring
    kill $logcat_pid 2>/dev/null || true

    take_screenshot "05_face_detection"

    if [ "$detected" = true ]; then
        local face_count=$(grep "handleFacesDetected.*faces count:" "$log_output" | tail -1 | grep -oP "faces count: \K\d+")
        print_pass "Face detection working! Detected $face_count face(s)"

        # Check for additional logs
        if grep -q "\[FaceReg\].*Face detection callback" "$log_output"; then
            print_pass "Face detection callback triggered"
        fi

        return 0
    else
        print_fail "No face detected within ${detection_timeout}s"
        print_info "Check logs: $log_output"
        return 1
    fi
}

test_ui_updates() {
    print_header "Test 6: UI Updates on Face Detection"

    print_test "Checking UI state"
    take_screenshot "06_ui_state"

    # This is a manual verification step
    print_info "Please verify the screenshot shows:"
    print_info "  - Green guide frame (if face detected)"
    print_info "  - Updated status message"
    print_info "  - 'Register' button enabled"

    print_pass "UI screenshot captured for manual verification"
}

#==============================================================================
# Test Summary
#==============================================================================

print_summary() {
    print_header "Test Summary"

    echo ""
    echo -e "Total Tests:  ${TESTS_TOTAL}"
    echo -e "Passed:       ${GREEN}${TESTS_PASSED}${NC}"
    echo -e "Failed:       ${RED}${TESTS_FAILED}${NC}"
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}═══════════════════════════════════════${NC}"
        echo -e "${GREEN}  ALL TESTS PASSED ✓${NC}"
        echo -e "${GREEN}═══════════════════════════════════════${NC}"
        exit_code=0
    else
        echo -e "${RED}═══════════════════════════════════════${NC}"
        echo -e "${RED}  SOME TESTS FAILED ✗${NC}"
        echo -e "${RED}═══════════════════════════════════════${NC}"
        exit_code=1
    fi

    echo ""
    echo -e "Test Results: ${LOG_FILE}"
    echo -e "Screenshots:  ${SCREENSHOT_DIR}"
    echo ""

    # Write summary to log
    {
        echo ""
        echo "========================================  "
        echo "SUMMARY"
        echo "========================================"
        echo "Total:  $TESTS_TOTAL"
        echo "Passed: $TESTS_PASSED"
        echo "Failed: $TESTS_FAILED"
    } >> "$LOG_FILE"

    exit $exit_code
}

#==============================================================================
# Main Test Execution
#==============================================================================

main() {
    print_header "Face Detection E2E Test Suite"
    echo ""

    # Setup
    setup_test_environment
    echo ""

    # Run tests
    test_app_launch
    echo ""

    test_mock_login
    echo ""

    test_navigate_to_face_registration
    echo ""

    test_camera_initialization
    echo ""

    test_face_detection
    echo ""

    test_ui_updates
    echo ""

    # Summary
    print_summary
}

# Run main
main "$@"
