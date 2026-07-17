---
tags: [practice, project, planning]
---

# Project Plan: Slatebase Migration

> [!info] Project Status
> **Phase:** Implementation
> **Start:** 2025-01-06
> **Deadline:** 2025-03-31
> **Responsible:** Documentation Team

---

## Project Goal

Migration of existing wiki content (Confluence) to Slatebase. The goal is a self-hosted, Markdown-based knowledge management system for the entire team.

---

## Milestones

| # | Milestone | Target Date | Status | Responsible |
|---|-----------|-------------|--------|-------------|
| M1 | Infrastructure ready | 2025-01-13 | :white_check_mark: Done | Ops Team |
| M2 | Pilot vault created | 2025-01-20 | :white_check_mark: Done | Anna |
| M3 | First 50 pages migrated | 2025-02-07 | :hourglass_flowing_sand: In Progress | Ben, Clara |
| M4 | Templates defined | 2025-02-14 | :x: Open | Anna |
| M5 | Team training | 2025-02-28 | :x: Open | Clara |
| M6 | Full migration complete | 2025-03-21 | :x: Open | Everyone |
| M7 | Confluence shutdown | 2025-03-31 | :x: Open | Ops Team |

---

## Risks

> [!warning] Risk: Content with complex formatting
> Some Confluence pages use macros and layouts that can't be mapped 1:1 to Markdown.
> **Mitigation:** Identify such pages and rebuild them manually. Maintain a tracking list.

> [!warning] Risk: Team adoption
> Some team members don't know Markdown and prefer WYSIWYG.
> **Mitigation:** Offer training (M5), provide templates, highlight View mode.

> [!danger] Risk: Data loss
> If Confluence is shut down before migration is complete.
> **Mitigation:** Create HTML backup export before Confluence is deactivated.

---

## Work Packages

### WP 1: Infrastructure (completed)

- [x] Provision server (Docker)
- [x] Set up HTTPS certificate
- [x] Configure backup cron
- [x] Create admin account

### WP 2: Pilot Migration (completed)

- [x] Define vault structure (folder hierarchy)
- [x] Migrate 10 representative pages
- [x] Gather team feedback
- [x] Adjust structure based on feedback

### WP 3: Mass Migration (in progress)

- [x] Download Confluence export as HTML
- [ ] Convert HTML → Markdown (pandoc)
- [ ] Extract and assign images
- [ ] Convert internal links to wikilinks
- [ ] Quality control (spot checks)

### WP 4: Templates & Conventions

- [ ] Create daily note template
- [ ] Create meeting protocol template
- [ ] Create project template
- [ ] Document tagging conventions
- [ ] Write folder structure guide

### WP 5: Training & Rollout

- [ ] Create training materials
- [ ] Schedule workshop (2h)
- [ ] Set up FAQ document
- [ ] Establish feedback channel

---

## Team Assignments

| Person | Role | Focus |
|--------|------|-------|
| Anna | Project Lead | Coordination, templates |
| Ben | Content Migration | Conversion, QA |
| Clara | Training | Documentation, support |
| DevOps | Infrastructure | Server, backups |

---

## Related Notes

- [[Sample Project/Meeting Notes]] — Sprint planning from 2025-01-15
- [[Sample Project/Research]] — Research on migration tools
- [[Practice/Overview]] — Back to exercises overview

---

## Next Steps

1. Complete WP 3 (mass conversion)
2. Review template drafts with team
3. Fix workshop date for week 9
