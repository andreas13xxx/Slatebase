---
tags: [meeting, templater-example]
date: <% tp.date.now("YYYY-MM-DD") %>
time: <% tp.date.now("HH:mm") %>
---

# Meeting: <% tp.file.title %>

**Date:** <% tp.date.now("MMMM DD, YYYY") %> at <% tp.date.now("HH:mm") %>
**Location:** 

## Attendees

- 

## Agenda

1. 

## Decisions

| # | Decision | Owner | Deadline |
|---|----------|-------|----------|
| 1 | | | |

## Action Items

- [ ] 

## Next Meeting

---

*Created from template on <% tp.date.now("MMMM DD, YYYY [at] HH:mm") %>*
