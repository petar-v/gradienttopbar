#!/bin/sh
set -u

export GSETTINGS_BACKEND=memory

gtk_test_status=0
for gtk_test_file in tests/gradientEditor.js tests/overviewSettings.js tests/shadowSettings.js tests/listenersPage.js; do
    gjs -m "$gtk_test_file" || gtk_test_status=1
done
exit "$gtk_test_status"
