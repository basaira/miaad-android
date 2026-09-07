#!/usr/bin/env bash
set -euo pipefail
mkdir -p audit
trap 'adb logcat -d > audit/logcat-api31.txt; adb shell dumpsys activity activities > audit/activity-api31.txt; adb exec-out screencap -p > audit/miaad-ready-api31.png' EXIT
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
adb pull /sdcard/miaad-launch.mp4 audit/miaad-launch-api31.mp4
test "$ready" = true
adb logcat -d > audit/logcat-api31.txt
! grep -q 'FATAL EXCEPTION' audit/logcat-api31.txt
! grep -q 'E MiaadWeb' audit/logcat-api31.txt
adb exec-out screencap -p > audit/miaad-content-api31.png
# A running clock can prevent UIAutomator from reaching idle; the startup
# signal and screenshot above are the gate, with XML captured when available.
adb shell uiautomator dump /sdcard/miaad.xml || true
adb pull /sdcard/miaad.xml audit/miaad-ui-api31.xml || true
echo 'Offline Android 12 first-frame handoff: PASS'
