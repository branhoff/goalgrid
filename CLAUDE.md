# CLAUDE.md

@AGENTS.md

Pebble-specific notes for agents. Project rules, the gate, and the environment are in
`AGENTS.md`; product docs are in `README.md`.

## Reviewing the running UI (do this instead of guessing)

The agent sandbox cannot START an emulator (socket bind is blocked) but can talk to one
the user already started. Ask the user to run `pebble install --emulator emery` once, then:

```bash
pebble install --emulator emery                      # push a new build to the running emulator
pebble screenshot --emulator emery --no-open shots/a.png   # no --scale flag in this SDK
uv run tools/measure.py shots/a.png                  # numeric margins/bands: check centering
node tools/push_fixture.js perfect --emulator emery  # push one fixture AppMessage to the watch
uv run tools/contact_sheet.py emery                  # push every fixture + screenshot -> shots/contact.png
```

- Screenshots the user pastes may be dimmed (backlight off); trust fresh `pebble screenshot` output.
- Only platforms the user has running can be checked (ask for chalk/aplite/diorite).
- Never send Up/Down/Select to the watchface (opens timeline/launcher); press Back to return.
- `send-app-message` takes numeric key ids (from `build/js/message_keys.json`) and only the
  LAST `--bytes` flag counts, so pass all byte arrays to one `--bytes`. `pebble logs` shows
  the watch's `APP_LOG` (e.g. a rejected payload).
- After editing `messageKeys`, run `pebble clean`; `make typecheck` always builds clean.
- Host emulator work uses the Mac's `pebble` tool; `make verify` uses the container.

## SDK Documentation

The full Pebble SDK documentation is available at https://developer.repebble.com.

An index of every page is at https://developer.repebble.com/llms.txt. Use it to discover what's available. Every page also has a Markdown version: append `.md` to any documentation URL to fetch plain Markdown instead of HTML (e.g. `https://developer.repebble.com/guides/events-and-services/buttons.md`). Prefer the `.md` form when reading docs.

Main Categories:
- Tutorials - Step-by-step learning (C watchface tutorial in 5 parts, advanced topics)
- Developer Guides - Comprehensive reference organized by topic

Key Sections:
- App Resources - Images, fonts, vector graphics, 256 resource limit
- User Interfaces - Layer hierarchy, TextLayer, MenuLayer, round vs rectangular displays
- Events & Services - Buttons, accelerometer, compass, health data, background workers
- Communication - Bluetooth AppMessage, PebbleKit JS/Android/iOS integration
- Graphics & Animations - Drawing APIs, property animations, vector graphics
- Debugging - App logs, GDB, common errors and solutions
- Best Practices - Multi-platform support, battery conservation, modular architecture
- Design & Interaction - Glance-first design, one-click actions, platform guidelines
- App Store Publishing - Submission requirements, assets, analytics

Key Entry Points:
- https://developer.repebble.com/tutorials/watchface-tutorial/part1 - C development start
- https://developer.repebble.com/guides/events-and-services/buttons - Button handling
- https://developer.repebble.com/guides/user-interfaces/layers - UI foundations

## Emulator Button Control

Control emulator buttons programmatically with `pebble emu-button`:

```bash
# Click a button (press and release)
pebble emu-button click select

# Long press (e.g., 2 seconds to exit app)
pebble emu-button click back --duration 2000

# Repeat clicks (e.g., scroll down 5 times)
pebble emu-button click down --repeat 5

# Faster repeat interval
pebble emu-button click up --repeat 3 --interval 100
```

**Actions:**
- `click` - Press then release (use `--duration` for long press)
- `push` - Hold button down (use `release` to let go)
- `release` - Release all buttons

**Buttons:** `back`, `up`, `select`, `down`

**Best Practices:**
- Use `click` for normal navigation and selection
- Use `click --duration 2000` for long press (e.g., back button to exit)
- Use `--repeat` to scroll through menus instead of multiple commands
- After making UI changes, take a screenshot to verify the result

## AI Interaction Guidelines

- When given an image of a watchface to replicate, describe the target watchface in precise detail. Note every visual element present, as well as size, alignment, font weight, spacing, and location.

## AI Code Review Guidelines

- Once you think you've fulfilled the user's request, ask yourself if you see any issues with the current screenshot, and if there are any differences between the screenshot and the reference image or the user's description. If so, fix them.