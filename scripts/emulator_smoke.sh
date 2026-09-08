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
adb shell svc wifi disable
adb shell svc data disable
adb logcat -c
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
! grep -q 'FATAL EXCEPTION' "audit/logcat-${SUFFIX}.txt"
! grep -q 'E MiaadWeb' "audit/logcat-${SUFFIX}.txt"
adb exec-out screencap -p > "audit/miaad-content-${SUFFIX}.png"
# A running clock can prevent UIAutomator from reaching idle; the startup
# signal and screenshot above are the gate, with XML captured when available.
adb shell uiautomator dump /sdcard/miaad.xml || true
adb pull /sdcard/miaad.xml "audit/miaad-ui-${SUFFIX}.xml" || true
echo "Offline Android API ${API_LEVEL} first-frame handoff: PASS"
MIAAD_API_LEVEL="$API_LEVEL" python3 scripts/emulator_acceptance.py
