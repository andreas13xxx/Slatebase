---
tags: [practice, meeting, project]
---

# Sprint Planning — 2025-01-15

> [!info] Meeting Details
> **Date:** 2025-01-15, 10:00–11:00
> **Location:** Remote (video call)
> **Moderator:** Anna
> **Minutes:** Clara

---

## Participants

| Name | Role | Present |
|------|------|---------|
| Anna | Project Lead | :white_check_mark: |
| Ben | Content Migration | :white_check_mark: |
| Clara | Training & Docs | :white_check_mark: |
| Daniel | DevOps | :white_check_mark: |
| Eva | Stakeholder | :x: (excused) |

---

## Agenda

1. Review: Infrastructure setup (Daniel)
2. Pilot migration status (Anna, Ben)
3. Planning: Mass migration approach (Ben)
4. Discuss template drafts (Anna)
5. Plan training (Clara)
6. Next steps & dates

---

## Discussion Points

### 1. Infrastructure Review

Daniel reports:
- Server running stable for 5 days
- Docker deployment with automatic backups (daily, 4:00 AM)
- HTTPS working, certificate auto-renewal via Let's Encrypt
- Performance: response times < 200ms

> [!success] Result
> Infrastructure is production-ready. No open issues.

### 2. Pilot Migration Status

Anna shows the pilot vault:
- 10 pages successfully migrated
- Folder structure: `Projects/`, `Knowledge/`, `Processes/`
- Test user feedback: "Clearer than Confluence"

Problems identified:
- Confluence tables with merged cells → manual fix needed
- Embedded Draw.io diagrams → export as PNG

### 3. Mass Migration Approach

Ben proposes:
1. Confluence space export (HTML)
2. `pandoc` for base conversion HTML → Markdown
3. Custom script for wikilink conversion
4. Move images to `Assets/` folder via script

> [!warning] Discussion
> Anna notes: Not all 500 pages are still relevant. Proposal: Only migrate pages edited in the last 12 months. Ben will check Confluence analytics.

### 4. Template Drafts

Anna shows three template drafts:
- **Daily Note:** Date, tasks, notes
- **Meeting Protocol:** (this format here)
- **Project Overview:** Goals, status, milestones

> [!tip] Feedback
> Clara suggests adding a **Decision Template** (context, options, decision, rationale). Team agrees.

### 5. Training

Clara plans:
- 2-hour workshop in week 9
- Content: Markdown basics, navigation, search, templates
- Material: Welcome vault as learning resource
- Recording for latecomers

### 6. Next Steps

See action items below.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Only migrate active pages (12-month rule) | Reduces effort from ~500 to ~200 pages |
| D2 | Export Draw.io diagrams as PNG | Mermaid for new diagrams, old ones as images |
| D3 | Add decision template | Frequently needed format in team |
| D4 | Workshop in week 9 (2h, remote) | Earliest possible date after template completion |

---

## Action Items

- [ ] **Ben:** Evaluate Confluence analytics → identify active pages (by 2025-01-20)
- [ ] **Ben:** Test pandoc conversion (10-page sample) (by 2025-01-22)
- [ ] **Anna:** Create decision template (by 2025-01-17)
- [ ] **Anna:** Document template conventions (by 2025-01-24)
- [ ] **Clara:** Send workshop invitations (by 2025-01-17)
- [ ] **Clara:** Start training materials (by 2025-02-07)
- [ ] **Daniel:** Set up monitoring dashboard (by 2025-01-24)

---

## Next Meeting

**Date:** 2025-01-22, 10:00
**Focus:** pandoc conversion progress, template review

---

## Related Notes

- [[Sample Project/Project Plan]] — Overall plan and milestones
- [[Sample Project/Research]] — Research on pandoc and conversion
- [[Practice/Overview]] — Back to exercises overview
