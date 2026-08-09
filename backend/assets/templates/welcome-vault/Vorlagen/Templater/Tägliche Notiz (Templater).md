---
tags: [journal, daily, templater-beispiel]
created: <% tp.date.now("YYYY-MM-DD") %>
weekday: <% tp.date.now("dddd") %>
week: <% tp.date.now("YYYY-[W]ww") %>
---

# <% tp.date.now("dddd, DD. MMMM YYYY") %>

## Tagesplanung

### Top 3 Prioritäten
1. 
2. 
3. 

### Termine heute
- 

## Notizen

## Tagesrückblick

### Was lief gut?
- 

### Was kann ich morgen besser machen?
- 

---

*Gestern: [[<% tp.date.now("YYYY-MM-DD", -1) %>]] | Morgen: [[<% tp.date.now("YYYY-MM-DD", 1) %>]]*
