# Slatebase — Marketingplan

## Ziel

Slatebase als Self-Hosted-Alternative für Obsidian-Vault-Zugriff in der Community bekannt machen. Zielgruppen: Self-Hoster, Obsidian-Nutzer, PKM-Community, AI/MCP-Interessierte.

## Maßnahmen

### Phase 1: Grundlagen (Repo & Präsenz)

| # | Maßnahme | Status | Details |
|---|----------|--------|---------|
| 1 | GitHub Repo auf public setzen | ✅ Fertig | Sichtbarkeit geändert |
| 2 | README aufpolieren (Hero, Quick Start, Features) | ✅ Fertig | Docker-Compose-Beispiel, Feature-Tabelle, Tech Stack |
| 3 | GitHub About-Bereich füllen (Description + Topics) | ✅ Fertig | Topics: obsidian, markdown, self-hosted, knowledge-management, etc. |
| 4 | Screenshots / Demo-GIF erstellen | ✅ Fertig | `demo.gif` im Projekt-Root vorhanden |
| 5 | LICENSE-Datei hinzufügen (MIT) | ✅ Fertig | `LICENSE` im Projekt-Root vorhanden |
| 6 | CONTRIBUTING.md erstellen | 📋 Geplant | Kurze Anleitung: Issues first, Dev-Setup, Code-Konventionen |
| 7 | Docker Images auf GHCR veröffentlichen | 📋 Geplant | `ghcr.io/andreas13xxx/slatebase-backend` + `-frontend` |
| 8 | GitHub Releases mit Changelog starten | 📋 Geplant | Semantic Versioning, erster Release als v0.1.0 |

### Phase 2: Community-Reichweite

| # | Maßnahme | Status | Details |
|---|----------|--------|---------|
| 9 | Post auf r/selfhosted | ✍️ Entwurf fertig | Flair: "Self-Hosted Alternatives", englisch, mit demo.gif + GitHub-Link |
| 10 | Post auf r/ObsidianMD | ✍️ Entwurf fertig | Flair: "Resources & Workflows", englisch, mit demo.gif + GitHub-Link |
| 11 | Show HN (Hacker News) | 📋 Geplant | Kurzer Pitch: Self-hosted, no DB, Obsidian-kompatibel, MCP-ready |
| 12 | PR an awesome-selfhosted | 📋 Geplant | Kategorie: Knowledge Management / Wikis |
| 13 | Obsidian Discord/Forum Post | 📋 Geplant | Kanal: #third-party-tools oder Plugin-Showcase |
| 14 | PR an awesome-obsidian | 📋 Geplant | Unter "Tools" oder "Web Access" |

### Phase 3: Content & Storytelling

| # | Maßnahme | Status | Details |
|---|----------|--------|---------|
| 15 | Dev.to / Blog-Artikel: Architektur-Entscheidungen | 📋 Geplant | "Why no database?", Filesystem-basiert, opake Tokens statt JWT |
| 16 | Dev.to / Blog-Artikel: MCP-Integration | 📋 Geplant | Sobald `mcp-context-server` Spec umgesetzt — AI-Community ansprechen |
| 17 | Kurzes YouTube/Loom-Video (2–3 Min) | 📋 Geplant | Setup → Login → Vault browsen → Datei editieren → Sharing |
| 18 | Twitter/X Thread: "Building a self-hosted Obsidian web UI" | 📋 Geplant | Build-in-public Narrative, Screenshots, Learnings |

### Phase 4: Ökosystem & Wachstum

| # | Maßnahme | Status | Details |
|---|----------|--------|---------|
| 19 | Docker Hub Listing (zusätzlich zu GHCR) | 📋 Geplant | Breitere Sichtbarkeit, gute Beschreibung |
| 20 | Obsidian Community Plugin (Sync zu Slatebase) | 📋 Geplant | Abhängig von `vault-sync` Spec — starker Wachstumshebel |
| 21 | MCP-Server im MCP-Verzeichnis listen | 📋 Geplant | Abhängig von `mcp-context-server` Spec — AI-Tool-Ökosystem |
| 22 | Vergleichsseite: Slatebase vs. Obsidian Publish vs. Quartz | 📋 Geplant | Faire Gegenüberstellung, Stärken hervorheben |
| 23 | Localization: Englische UI als Default für internationale Reichweite | 📋 Geplant | i18n ist vorhanden — English als Default für breitere Adoption |

## Priorisierung

**Sofort (diese Woche):**
- Screenshots/GIF (#4)
- LICENSE-Datei (#5)
- Docker Images bauen und pushen (#7)

**Kurzfristig (nächste 2 Wochen):**
- r/selfhosted Post (#9) — größter Hebel für erste Nutzer
- r/ObsidianMD Post (#10)
- awesome-selfhosted PR (#12)
- Erster GitHub Release v0.1.0 (#8)

**Mittelfristig (1–2 Monate):**
- Show HN (#11) — erst wenn Docker-Images stabil und Screenshots vorhanden
- Blog-Artikel Architektur (#15)
- Video (#17)

**Langfristig (abhängig von Feature-Entwicklung):**
- MCP-Artikel + Listing (#16, #21) — nach `mcp-context-server` Umsetzung
- Obsidian Plugin (#20) — nach `vault-sync` Umsetzung
- Vergleichsseite (#22) — wenn genug Differenzierung vorhanden

## Erfolgskriterien

| Metrik | Ziel (3 Monate) |
|--------|-----------------|
| GitHub Stars | 50+ |
| Docker Pulls | 100+ |
| Unique Visitors (GitHub Insights) | 500+ |
| Community-Feedback (Issues/Discussions) | 10+ sinnvolle Interaktionen |
| Externe Erwähnungen (Reddit, HN, Blogs) | 3+ |

## Kernbotschaften

1. **"Deine Notizen, dein Server, jeder Browser."** — Self-Hosting + Web-Zugriff
2. **"Obsidian-kompatibel, ohne Obsidian."** — Kein Vendor-Lock-in
3. **"Kein Sync-Dienst, keine Datenbank, keine Magie."** — Transparenz, Plain Files
4. **"Teile Wissen, nicht Accounts."** — Multi-User mit granularen Rechten
5. **"AI-ready: MCP-Integration für deine Wissensbasis."** — Zukunfts-Feature als Differenzierung
