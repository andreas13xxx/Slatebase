---
tags: [journal, daily, templater-example]
created: <% tp.date.now("YYYY-MM-DD") %>
weekday: <% tp.date.now("dddd") %>
week: <% tp.date.now("YYYY-[W]ww") %>
---

# <% tp.date.now("dddd, MMMM DD, YYYY") %>

## Day Planning

### Top 3 Priorities
1. 
2. 
3. 

### Appointments Today
- 

## Notes

## Daily Review

### What went well?
- 

### What can I improve tomorrow?
- 

---

*Yesterday: [[<% tp.date.now("YYYY-MM-DD", -1) %>]] | Tomorrow: [[<% tp.date.now("YYYY-MM-DD", 1) %>]]*
