---
tags: [advanced, plugins]
---

# Day Planner Plugin

Day Planner (`obsidian-day-planner`) turns time-blocked checkbox lines in your daily note into a visual timeline — a schedule view you can scan at a glance instead of reading a flat task list.

> [!tip] Actively maintained and tested
> Day Planner is actively maintained upstream and was manually tested with its real, GitHub-loaded bundle running inside Slatebase (not just statically analyzed) — one of a small set of plugins verified this way. It's rated fully compatible.

---

## Prerequisites

- Feature toggle `obsidian-plugin-compat` enabled
- Day Planner plugin installed and activated
- Plugin ZIP from GitHub: `obsidian-day-planner`

---

## Installation

1. Go to **Plugin Management** → **"Available Plugins"** tab and search for "Day Planner"
2. Click **Install**, then switch on the **activation toggle**

Not listed, or need a specific fork/version? Download the ZIP from GitHub instead and use **"Installed Plugins" → Upload Plugin**.

---

## Core Features

- **Timeline view** — a sidebar panel that renders time-blocked tasks from your daily note as a vertical schedule
- **Time Tracker** — shows progress through the current time block
- **Time-blocked task syntax** — write tasks with a time range directly in your daily note; Day Planner picks them up automatically
- **Drag-to-reschedule** — adjust a block's time directly in the timeline view

---

## Limitations in Slatebase

| Feature | Status |
|---------|--------|
| Plugin loads and activates | Works |
| Timeline view | Works |
| Time Tracker | Works |
| Time-blocked task parsing | Works |

---

> [!info] Why it works reliably
> Day Planner's Timeline and Time Tracker components read `ItemView.containerEl` by a fixed position (header first, then content) rather than by CSS selector. Slatebase's view shim was verified to match that exact two-child layout, which is why this plugin holds up under real-bundle testing where others only pass static analysis.

> [!todo] Exercise
> 1. Install and activate the Day Planner plugin
> 2. Add a few time-blocked tasks to today's daily note
> 3. Open the Timeline view and check that the blocks appear in order
> 4. Watch the Time Tracker update as you move through the day

---

## Related Features

- [[Features/Templates and Daily Notes]] — Daily notes without a plugin
- [[Advanced/Plugins/Calendar]] — Sidebar calendar for daily notes
- [[Advanced/Plugins/Tasks]] — Checkbox-based task management
- [[Advanced/Obsidian Plugins]] — Plugin basics
