#!/usr/bin/env bash
set -euo pipefail
mkdir -p audit
API_LEVEL="${MIAAD_API_LEVEL:-31}"
SUFFIX="api${API_LEVEL}"
cleanup(){
  adb logcat -d > "audit/logcat-${SUFFIX}.txt" || true
  adb shell dumpsys activity activities > "audit/activity-${SUFFIX}.txt" || true
  adb exec-out screencap -p > "audit/miaad-ready-${SUFFIX}.png" || true
}
trap cleanup EXIT
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Android 13+ presents POST_NOTIFICATIONS in PermissionController, which is a
# separate system activity. The acceptance suite deliberately force-stops and
# relaunches Miaad to verify persistence; leaving the system permission dialog
# open can keep that external activity on top and make `am start` report
# "delivered to currently running top-most instance" instead of creating a new
# Miaad process. Grant the declared runtime permission in the isolated CI
# emulator only, equivalent to the user accepting it. Production permission
# behavior in MainActivity remains unchanged.
if [ "$API_LEVEL" -ge 33 ]; then
  adb shell pm grant com.miaad.app android.permission.POST_NOTIFICATIONS
fi

# On the API 26 google_apis image, the shell UID is not allowed to call
# WifiService#setWifiEnabled and `svc wifi disable` terminates with a
# SecurityException before Miaad can even launch. The CI image is userdebug and
# supports adb root, so elevate only this isolated emulator in order to preserve
# the same strict offline acceptance condition used on newer APIs. This changes
# neither the APK nor production permissions.
if [ "$API_LEVEL" -eq 26 ]; then
  adb root
  adb wait-for-device
  test "$(adb shell id -u | tr -d '\r')" = "0"
fi

adb shell svc wifi disable
adb shell svc data disable
# Clearing logcat is test setup, not an application assertion. Some API 26
# userdebug images reject clearing the main buffer after adbd restarts as root.
# Preserve that fact as audit evidence, but do not abort before Miaad launches.
if ! adb logcat -c; then
  echo "WARN: logcat clear unavailable on API ${API_LEVEL}; continuing with fresh-emulator logs" >&2
  adb logcat -d > "audit/logcat-prelaunch-${SUFFIX}.txt" || true
fi
adb shell am force-stop com.miaad.app
adb shell screenrecord --time-limit 20 /sdcard/miaad-launch.mp4 &
record_pid=$!
sleep 1
adb shell am start -W -n com.miaad.app/.MainActivity
ready=false
for attempt in $(seq 1 30); do
  if adb logcat -d -s MiaadStartup:I '*:S' | grep -q 'content-ready'; then
    ready=true
    break
  fi
  sleep 2
done
wait "$record_pid"
adb pull /sdcard/miaad-launch.mp4 "audit/miaad-launch-${SUFFIX}.mp4"
test "$ready" = true
adb logcat -d > "audit/logcat-${SUFFIX}.txt"
# Explicit conditionals are required here: commands whose status is inverted
# with `!` are exempt from `set -e`, so the former `! grep -q` form could detect
# a product error without failing the runtime gate.
if grep -q 'FATAL EXCEPTION' "audit/logcat-${SUFFIX}.txt"; then
  echo "FAIL: FATAL EXCEPTION detected on Android API ${API_LEVEL}" >&2
  grep 'FATAL EXCEPTION' "audit/logcat-${SUFFIX}.txt" >&2 || true
  exit 1
fi
if grep -q 'E MiaadWeb' "audit/logcat-${SUFFIX}.txt"; then
  echo "FAIL: Miaad WebView JavaScript error detected on Android API ${API_LEVEL}" >&2
  grep 'E MiaadWeb' "audit/logcat-${SUFFIX}.txt" >&2 || true
  exit 1
fi
adb exec-out screencap -p > "audit/miaad-content-${SUFFIX}.png"
# A running clock can prevent UIAutomator from reaching idle; the startup
# signal and screenshot above are the gate, with XML captured when available.
adb shell uiautomator dump /sdcard/miaad.xml || true
adb pull /sdcard/miaad.xml "audit/miaad-ui-${SUFFIX}.xml" || true
echo "Offline Android API ${API_LEVEL} first-frame handoff: PASS"
MIAAD_API_LEVEL="$API_LEVEL" python3 scripts/emulator_acceptance.py
# Capture deterministic, settled destination views after acceptance. This
# avoids reviewing a screenshot while a ViewTransition pseudo-element is still
# animating the previous screen over the new one.
MIAAD_API_LEVEL="$API_LEVEL" python3 scripts/ui_capture.py
