#!/bin/sh
set -u
package_path=$1
diagnostics_path=$2
diagnostics_enabled=$3
version=$4
relaunch_command=$5

record() {
  event=$1
  status=$2
  [ "$diagnostics_enabled" = '1' ] || return 0
  mkdir -p "$(dirname -- "$diagnostics_path")"
  if [ -n "$status" ]; then
    printf '{"timestamp":"%s","event":"%s","version":"%s","data":{"exitCode":%s}}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$event" "$version" "$status" >> "$diagnostics_path"
  else
    printf '{"timestamp":"%s","event":"%s","version":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$event" "$version" >> "$diagnostics_path"
  fi
}

record linux-deb-installer-started ''
pkexec --disable-internal-agent /usr/bin/dpkg -i -- "$package_path"
status=$?
if [ "$status" -ne 0 ]; then
  record linux-deb-installer-failed "$status"
  exit "$status"
fi
record linux-deb-installer-succeeded ''
exec "$relaunch_command"
