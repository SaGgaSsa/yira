#!/bin/sh
set -eu

app_dir='/opt/Yira'
sandbox_helper="$app_dir/chrome-sandbox"

fail() {
  echo "Yira installation error: $1" >&2
  exit 1
}

if type update-alternatives >/dev/null 2>&1; then
  if [ -L '/usr/bin/yira' ] && [ -e '/usr/bin/yira' ] && [ "$(readlink '/usr/bin/yira')" != '/etc/alternatives/yira' ]; then
    rm -f '/usr/bin/yira'
  fi
  update-alternatives --install '/usr/bin/yira' 'yira' '/opt/Yira/yira' 100 || ln -sf '/opt/Yira/yira' '/usr/bin/yira'
else
  ln -sf '/opt/Yira/yira' '/usr/bin/yira'
fi

[ -f "$sandbox_helper" ] || fail "the Chromium sandbox helper is missing at $sandbox_helper."

chown root:root "$sandbox_helper" || fail "unable to make the Chromium sandbox helper owned by root."
chmod 4755 "$sandbox_helper" || fail "unable to enable the Chromium sandbox helper setuid permission."

helper_metadata=$(stat -c '%U:%G %a' "$sandbox_helper") || fail "unable to read Chromium sandbox helper permissions."
[ "$helper_metadata" = 'root:root 4755' ] || fail "Chromium sandbox helper must be root:root with mode 4755; found $helper_metadata."

command -v findmnt >/dev/null 2>&1 || fail "cannot validate the installation mount because findmnt is unavailable."
mount_options=$(findmnt -no OPTIONS -T "$app_dir") || fail "cannot determine mount options for $app_dir."
case ",$mount_options," in
  *,nosuid,*) fail "the installation filesystem is mounted nosuid, so Chromium cannot start its secure sandbox. Install Yira on a filesystem that permits setuid programs." ;;
esac

if command -v update-mime-database >/dev/null 2>&1; then
  update-mime-database /usr/share/mime || true
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database /usr/share/applications || true
fi
