---
tags: [advanced, plugins]
---

# Calendar Plugin

The Calendar plugin shows a monthly calendar in the sidebar. Click on a date to open or create the corresponding daily note — ideal for journaling and daily logs.

> [!warning] No update in about 2 years
> The Calendar plugin (`liamcain/obsidian-calendar-plugin`) had its last GitHub push on 2024-06-22 — no new releases have appeared since. It still works reliably today (see the table below), but don't expect fixes for future Obsidian or Slatebase changes.

---

## Prerequisites

- Feature toggle `obsidian-plugin-compat` enabled
- Calendar plugin installed and activated
- Daily notes directory configured (Settings → Vault → Daily Notes)

---

## Installation

1. Go to **Plugin Management** → **"Available Plugins"** tab and search for "Calendar"
2. Click **Install**, then switch on the **activation toggle**

Not listed, or need a specific fork/version? Download the ZIP from GitHub instead (`obsidian-calendar-plugin`) and use **"Installed Plugins" → Upload Plugin**.

---

## Basic Function

After activation, a calendar widget appears in the right sidebar (Context Panel):

- **Current month** is displayed with day numbers
- **Today's date** is highlighted
- **Days with existing notes** show a dot indicator
- **Click on a date** opens the daily note or creates it

### Navigation

| Action | Result |
|--------|--------|
| Click on day | Open/create daily note |
| Left/right arrow | Previous/next month |
| Click "Today" | Jump to current month |

---

## Configuration

### Daily Notes Directory

The Calendar plugin uses the daily notes directory configured in Slatebase:

1. Settings (`Ctrl+,`) → Vault Configuration
2. Set "Daily Notes Directory" (e.g. `Journal` or `Daily Notes`)
3. Calendar creates notes in this folder

### Filename Format

Daily notes follow the format `YYYY-MM-DD.md`:
- `2025-01-15.md`
- `2025-02-03.md`

---

## Example Workflow: Daily Journal

### Step 1: Prepare Directory

Create a folder `Journal` in your vault and set it as the daily notes directory.

### Step 2: Create Template

Create a file `Templates/daily.md` with:

```markdown
---
tags: [journal, daily]
---

# {{date}}

## Morning Routine

- [ ] Set priorities for today
- [ ] Review yesterday's notes

## Notes

## Completed

- [ ] 

## Reflection

> What went well today?

```

### Step 3: Daily Usage

1. Click today's date in the calendar
2. The daily note is created from the template
3. Fill in sections throughout the day
4. Next day: New click → new note

---

## Weekly Overview

You can create weekly overviews linking to daily notes:

```markdown
# Week 03/2025

## Monday [[2025-01-13]]
- Project kickoff

## Tuesday [[2025-01-14]]
- Sprint planning

## Wednesday [[2025-01-15]]
- Deep work: Documentation

## Thursday [[2025-01-16]]
- Code review

## Friday [[2025-01-17]]
- Retrospective
```

---

## Limitations in Slatebase

| Feature | Status |
|---------|--------|
| Monthly calendar | Works |
| Open/create daily note | Works |
| Dot indicator for existing notes | Works |
| Weekly notes | Not supported |
| Dot counts (word count) | Not supported |

---

> [!tip] Calendar + Templates
> Combine Calendar with the template system: Set a `daily.md` template in the Templates directory. Every new daily note will be pre-filled with it.

> [!todo] Exercise
> 1. Install and activate the Calendar plugin
> 2. Configure a daily notes directory (e.g. `Journal`)
> 3. Create a daily note template at `Templates/daily.md`
> 4. Click today's date in the calendar
> 5. Fill the created note with content
> 6. Click a past date and create a retrospective note
> 7. Check the dot indicators in the calendar

---

## Related Features

- [[Features/Templates and Daily Notes]] — Daily notes without a plugin
- [[Features/Context Panel]] — Sidebar (calendar appears here)
- [[Advanced/Plugins/Templater]] — Advanced templates
- [[Advanced/Obsidian Plugins]] — Plugin basics
