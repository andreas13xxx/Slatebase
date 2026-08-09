---
tags: [meeting, templater-beispiel]
date: <% tp.date.now("YYYY-MM-DD") %>
time: <% tp.date.now("HH:mm") %>
---

# Meeting: <% tp.file.title %>

**Datum:** <% tp.date.now("DD.MM.YYYY") %> um <% tp.date.now("HH:mm") %>
**Ort:** 

## Teilnehmer

- 

## Agenda

1. 

## Beschlüsse

| Nr. | Beschluss | Verantwortlich | Deadline |
|-----|-----------|----------------|----------|
| 1 | | | |

## Action Items

- [ ] 

## Nächster Termin

---

*Erstellt aus Vorlage am <% tp.date.now("DD.MM.YYYY, HH:mm") %>*
