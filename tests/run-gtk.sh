#!/bin/sh
set -u

export GSETTINGS_BACKEND=memory

exec dbus-run-session -- node scripts/test.mjs --gtk
