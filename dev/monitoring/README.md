# Optional listener monitoring

`src/` is the production extension. Nothing in this directory is copied into a
release archive. `yarn zip:debug` and `yarn local-install:debug` opt into this
overlay; `yarn zip` and `yarn local-install` use production sources directly.

- `instrumentation.patch` adds signal wrappers, callback counters and timing,
  extension enable/disable hooks, and the Debug preferences page registration.
- `files/` supplies the monitor, D-Bus service, page and diagnostics facade.
- `tests/` supplies monitoring tests. The test runner copies them beside shared
  tests in the prepared debug project so their relative imports use that build.

The packager checks production sources for monitoring references, copies them
to a temporary directory, checks and applies the patch only for debug builds,
then copies `files/` into that prepared source tree. No Git checkout or index is
modified. Patch failure aborts the debug build and removes its temporary files.
The release path does not apply or reverse a patch and does not strip code.

## Maintaining hooks

Edit production behavior in `src/`. Edit the monitor or page in `files/`.
Hook changes belong in the ordinary unified diff `instrumentation.patch`; its
paths are relative to the extension root (`src/` in the repository). Preserve
callback arguments, return values, exceptions and disconnection ownership.
Update the catalog when adding or removing signals.

Run `yarn test` after changing either side. This checks production and debug
archives, patch compatibility, production source isolation, and behavior in
both prepared variants. Component Node tests stub the native D-Bus boundary;
monitoring tests inject the actual counters and GTK tests use the real service.
Run `yarn test:gtk` for UI or D-Bus changes; on a machine without a display,
use `xvfb-run -a yarn test:gtk`. The runner isolates its session bus and settings,
and uses GTK's simple input method to avoid IBus/Xvfb teardown crashes.

When a production edit invalidates a patch hunk, update the hunk's context and
hook against the new production implementation. Do not suppress patch errors
or ship the monitor without the affected hook. A newly added signal may need
catalog and hook updates even if the existing patch still applies.

Only submit the release archive. `yarn upload` always rebuilds and chooses it.
Neither monitoring modules/tests nor this patch, documentation, or build scripts
are in that archive. Release schemas are validated without shipping a compiled
schema cache; installation handles compilation.
