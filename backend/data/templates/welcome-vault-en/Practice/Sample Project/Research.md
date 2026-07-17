---
tags: [practice, research, migration]
---

# Research: Confluence → Markdown Migration

> [!abstract] Summary
> This note collects tools, methods, and findings for migrating Confluence content to Slatebase (Markdown). Focus on automated conversion and quality assurance.

---

## Starting Point

- **Source:** Confluence Cloud, ~500 pages, 3 spaces
- **Target:** Slatebase vault with Markdown files
- **Requirements:**
  - Internal links → Wikilinks (`[[...]]`)
  - Preserve images (as files in the vault)
  - Convert tables to Markdown
  - Retain formatting as much as possible

---

## Researched Tools

### pandoc

> [!quote] Source
> [pandoc.org](https://pandoc.org) — Universal document converter

- **Conversion:** HTML → Markdown (GFM variant)
- **Strengths:** Tables, lists, code blocks convert well
- **Weaknesses:** Confluence-specific macros are ignored or left as raw HTML
- **Command:**
  ```bash
  pandoc input.html -f html -t gfm -o output.md
  ```

### confluence-to-markdown (npm)

> [!quote] Source
> [GitHub: lostintangent/confluence-to-markdown](https://github.com/lostintangent/confluence-to-markdown)

- **Approach:** Uses Confluence REST API directly
- **Strengths:** Converts page tree with hierarchy, preserves metadata
- **Weaknesses:** Last updated >2 years ago, no GFM tables
- **Assessment:** Not recommended (outdated, limited Confluence Cloud support)

### Custom Development: Post-Processing Script

For Slatebase-specific requirements, a custom script:

```markdown
## Conversion Steps (Custom Script)

1. Download Confluence export (HTML)
2. pandoc: HTML → GFM Markdown
3. Custom Script:
   - Identify internal links → `[[Filename]]` wikilinks
   - Copy images to `Assets/` folder → adjust paths
   - Replace Confluence macros:
     - `{info}` → `> [!info]`
     - `{warning}` → `> [!warning]`
     - `{code}` → Fenced code blocks
   - Add frontmatter (tags from labels)
4. Quality control: Spot-check 10%
```

---

## Experience Reports

### Team Alpha (Internal Report)

- Migration of 200 pages in 3 days
- Main effort: Manual rework of tables with merged cells
- Recommendation: Better to migrate fewer pages at higher quality

### Blog Post "From Confluence to Obsidian"

> [!quote] Key Takeaway
> "The 80/20 rule applies: 80% of content converts automatically, 20% needs manual attention. Focus your effort on high-traffic pages."

Applicable to our project: Only migrate the ~200 actively used pages (see [[Sample Project/Meeting Notes|Meeting Decision D1]]).

---

## Comparison: Options

| Criterion | pandoc + Script | confluence-to-markdown | Manual |
|-----------|----------------|----------------------|--------|
| Initial effort | Medium (write script) | Low (npm install) | — |
| Effort per page | Low (automated) | Low | High (5–10 min) |
| Quality | Good (80% automated) | Fair (outdated) | Very good |
| Wikilinks | Yes (custom script) | No | Yes |
| Images | Yes (script) | Partial | Yes |
| Recommendation | :white_check_mark: **Chosen** | :x: | Only for special cases |

---

## Open Questions

- [ ] How to handle Confluence comments? (Ignore or convert to callouts?)
- [ ] Draw.io diagrams: PNG export or redraw in Mermaid?
- [ ] Permissions: Which pages were restricted? (→ separate vault assignment?)

---

## Next Steps

1. pandoc test with 10-page sample (→ Ben, week 4)
2. Custom script prototype for link conversion (→ Ben, week 4–5)
3. Quality review of converted sample (→ Anna, week 5)

---

## Sources

- [pandoc.org — User Guide](https://pandoc.org/MANUAL.html)
- [Confluence REST API Documentation](https://developer.atlassian.com/cloud/confluence/rest/v1/)
- [Markdown Guide — Extended Syntax](https://www.markdownguide.org/extended-syntax/)
- Internal report Team Alpha (Confluence → Obsidian, Q3 2024)

---

## Related Notes

- [[Sample Project/Project Plan]] — Overall plan with milestones
- [[Sample Project/Meeting Notes]] — Decisions from sprint planning
- [[Features/Wikilinks]] — Wikilink syntax in Slatebase
- [[Features/Callouts]] — Callout types (for macro conversion)
- [[Practice/Overview]] — Back to exercises overview
