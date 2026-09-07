#!/usr/bin/env bash
set -euo pipefail
mkdir -p audit
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell settings put system system_locales ar-EG
adb shell svc wifi disable
adb shell svc data disable
adb logcat -c
adb shell am force-stop com.miaad.app
adb shell screenrecord --time-limit 6 /sdcard/miaad-launch.mp4 &
record_pid=$!
sleep 1
adb shell am start -W -n com.miaad.app/.MainActivity
wait "$record_pid"
adb pull /sdcard/miaad-launch.mp4 audit/miaad-launch-api31.mp4
adb exec-out screencap -p > audit/miaad-ready-api31.png
adb shell uiautomator dump /sdcard/miaad.xml
adb pull /sdcard/miaad.xml audit/miaad-ui-api31.xml
adb logcat -d > audit/logcat-api31.txt
! grep -q 'FATAL EXCEPTION' audit/logcat-api31.txt
grep -q 'مِيعاد' audit/miaad-ui-api31.xml
grep -q 'الإعدادات' audit/miaad-ui-api31.xml
adb shell input keyevent 3
adb exec-out screencap -p > audit/launcher-api31.png
echo 'Offline Android 12 launch and visible app identity: PASS'
