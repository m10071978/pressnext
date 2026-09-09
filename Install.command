#!/bin/bash
set -euo pipefail

PACKAGE_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_FILE="$PACKAGE_DIR/PressNextLive.js"
ICON_SOURCE="$PACKAGE_DIR/PressNextLiveIcon.png"
APPS_DIR="$HOME/Applications"
APP_DIR="$APPS_DIR/PressNext Live.app"
PLIST="$APP_DIR/Contents/Info.plist"

if [ ! -f "$SOURCE_FILE" ] || [ ! -f "$ICON_SOURCE" ]; then
    /usr/bin/osascript -e 'display dialog "В установочном пакете не хватает PressNextLive.js или PressNextLiveIcon.png. Распакуйте архив полностью и повторите установку." buttons {"OK"} default button "OK" with title "PressNext Live" with icon caution'
    exit 1
fi

/bin/mkdir -p "$APPS_DIR"

/usr/bin/osascript -e 'try' -e 'tell application id "local.pressnextlive" to quit' -e 'end try' >/dev/null 2>&1 || true

if [ -d "$APP_DIR" ]; then /bin/rm -rf "$APP_DIR"; fi

/usr/bin/osacompile -l JavaScript -s -o "$APP_DIR" "$SOURCE_FILE"

ICON_WORK_DIR="$(/usr/bin/mktemp -d "/tmp/pressnext-live-icon.XXXXXX")"
cleanup_icon_work_dir() {
    /bin/rm -rf "$ICON_WORK_DIR"
}
trap cleanup_icon_work_dir EXIT

ICONSET_DIR="$ICON_WORK_DIR/PressNextLive.iconset"
/bin/mkdir -p "$ICONSET_DIR"

make_icon() {
    local size="$1"
    local filename="$2"
    /usr/bin/sips -z "$size" "$size" "$ICON_SOURCE" --out "$ICONSET_DIR/$filename" >/dev/null
}

make_icon 16 "icon_16x16.png"
make_icon 32 "icon_16x16@2x.png"
make_icon 32 "icon_32x32.png"
make_icon 64 "icon_32x32@2x.png"
make_icon 128 "icon_128x128.png"
make_icon 256 "icon_128x128@2x.png"
make_icon 256 "icon_256x256.png"
make_icon 512 "icon_256x256@2x.png"
make_icon 512 "icon_512x512.png"
make_icon 1024 "icon_512x512@2x.png"
/usr/bin/iconutil -c icns "$ICONSET_DIR" -o "$APP_DIR/Contents/Resources/PressNextLive.icns"

set_plist_string() {
    local key="$1"
    local value="$2"
    /usr/libexec/PlistBuddy -c "Set :$key $value" "$PLIST" >/dev/null 2>&1 || \
        /usr/libexec/PlistBuddy -c "Add :$key string $value" "$PLIST"
}

set_plist_string "CFBundleIdentifier" "local.pressnextlive"
set_plist_string "CFBundleDisplayName" "PressNext Live"
set_plist_string "CFBundleName" "PressNext Live"
set_plist_string "CFBundleIconFile" "PressNextLive.icns"
set_plist_string "CFBundleShortVersionString" "1.9.4"
set_plist_string "CFBundleVersion" "25"
set_plist_string "NSAppleEventsUsageDescription" "PressNext Live использует QuickTime Player, Preview, TextEdit, System Events и выбранное сценическое приложение для воспроизведения, показа текста, управления окнами и переключения фокуса."

/usr/bin/codesign --force --deep --sign - "$APP_DIR" >/dev/null 2>&1 || true
/usr/bin/open "$APP_DIR"
