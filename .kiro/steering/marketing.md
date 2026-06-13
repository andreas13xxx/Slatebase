# Slatebase — Marketingplan

## Ziel

Slatebase als Self-Hosted-Alternative für Obsidian-Vault-Zugriff in der Community bekannt machen. Zielgruppen: Self-Hoster, Obsidian-Nutzer, PKM-Community, AI/MCP-Interessierte.

## Maßnahmen

### Phase 1: Grundlagen (Repo & Präsenz)

| # | Maßnahme | Status | Details |
|---|----------|--------|---------|
| 1 | GitHub Repo auf public setzen | ✅ Fertig | Sichtbarkeit geändert |
| 2 | README aufpolieren (Hero, Quick Start, Features) | ✅ Fertig | Docker-Compose-Beispiel, Feature-Tabelle, Tech Stack |
| 3 | GitHub About-Bereich füllen (Description + Topics) | ✅ Fertig | Topics: obsidian, markdown, self-hosted, knowledge-management, collaboration, real-time-chat, team, etc. |
| 4 | Screenshots / Demo-GIF erstellen | ✅ Fertig | `demo.gif` im Projekt-Root vorhanden |
| 5 | LICENSE-Datei hinzufügen (MIT) | ✅ Fertig | `LICENSE` im Projekt-Root vorhanden |
| 6 | CONTRIBUTING.md erstellen | 📋 Geplant | Kurze Anleitung: Issues first, Dev-Setup, Code-Konventionen |
| 7 | Docker Images auf GHCR veröffentlichen | ✅ Pipeline fertig | CI/CD-Pipeline konfiguriert — `ghcr.io/andreas13xxx/slatebase-backend` + `-frontend`, automatischer Push bei Release |
| 8 | GitHub Releases mit Changelog starten | ✅ Pipeline fertig | Release Please konfiguriert, erster Release bei Merge auf `main` |

### Phase 2: Community-Reichweite

| # | Maßnahme | Status | Details |
|---|----------|--------|---------|
| 9 | Post auf r/selfhosted | ✍️ Entwurf fertig | Flair: "Self-Hosted Alternatives", englisch, mit demo.gif + GitHub-Link. Collaboration hervorheben: Chat, Sharing, Multi-User |
| 10 | Post auf r/ObsidianMD | ✍️ Entwurf fertig | Flair: "Resources & Workflows", englisch, mit demo.gif + GitHub-Link. Fokus: Vault-Sharing + Chat als Team-Feature |
| 11 | Show HN (Hacker News) | 📋 Geplant | Kurzer Pitch: Self-hosted, no DB, Obsidian-kompatibel, Collaboration (Chat + Sharing), MCP-ready |
| 12 | PR an awesome-selfhosted | 📋 Geplant | Kategorie: Knowledge Management / Wikis |
| 13 | Obsidian Discord/Forum Post | 📋 Geplant | Kanal: #third-party-tools oder Plugin-Showcase |
| 14 | PR an awesome-obsidian | 📋 Geplant | Unter "Tools" oder "Web Access" |

### Phase 3: Content & Storytelling

| # | Maßnahme | Status | Details |
|---|----------|--------|---------|
| 15 | Dev.to / Blog-Artikel: Architektur-Entscheidungen | 📋 Geplant | "Why no database?", Filesystem-basiert, opake Tokens statt JWT |
| 16 | Dev.to / Blog-Artikel: MCP-Integration | 📋 Geplant | MCP-Server ist implementiert — AI-Community ansprechen |
| 17 | Kurzes YouTube/Loom-Video (2–3 Min) | 📋 Geplant | Setup → Login → Vault browsen → Datei editieren → Vault teilen → Chat-Nachricht senden |
| 18 | Twitter/X Thread: "Building a self-hosted Obsidian web UI" | 📋 Geplant | Build-in-public Narrative, Screenshots, Learnings |

### Phase 4: Ökosystem & Wachstum

| # | Maßnahme | Status | Details |
|---|----------|--------|---------|
| 19 | Docker Hub Listing (zusätzlich zu GHCR) | 📋 Geplant | Breitere Sichtbarkeit, gute Beschreibung |
| 20 | Obsidian Community Plugin (Sync zu Slatebase) | 🟡 Teilweise | `vault-sync` Backend+Frontend implementiert — Plugin-Seite noch offen |
| 21 | MCP-Server im MCP-Verzeichnis listen | 📋 Geplant | MCP-Server implementiert — Listing vorbereiten |
| 22 | Vergleichsseite: Slatebase vs. Obsidian Publish vs. Quartz | 📋 Geplant | Faire Gegenüberstellung — Differenzierung: Multi-User, Chat, granulare Rechte, Vault-Transfer, Sync (alles was die anderen nicht haben) |
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
- MCP-Artikel + Listing (#16, #21) — MCP-Server ist implementiert, Artikel und Listing vorbereiten
- Obsidian Plugin (#20) — Sync-Backend steht, Plugin-Seite noch offen
- Vergleichsseite (#22) — wenn genug Differenzierung vorhanden

## Collaboration als Differenzierungsmerkmal

Die Collaboration-Features sind Slatebase's stärkstes Alleinstellungsmerkmal gegenüber allen Alternativen. Sie sollten in JEDEM Post, jeder README-Feature-Tabelle und jedem Video prominent vorkommen.

### Implementierte Collaboration-Features (sofort bewerbbar)

| Feature | Differenzierung vs. Alternativen |
|---------|----------------------------------|
| **Echtzeit-Chat** | Obsidian Publish, Quartz, MkDocs — keines hat Chat |
| **Granulare Vault-Freigaben (Read/Write)** | Obsidian Publish: nur read-only, keine Rechte-Granularität |
| **Vault-Besitz-Transfer** | Nirgends sonst vorhanden — Team-Übergaben ohne Datenverlust |
| **Multi-User mit Rollen (Admin/User)** | Quartz/MkDocs: Single-User; Obsidian Publish: kein Multi-User |
| **Unread-Badges & Archivierung** | Vollwertiges Messaging, nicht nur Kommentare |
| **Multi-Session / Multi-Device** | Gleichzeitig auf Handy und Desktop — ohne Sync-Dienst |
| **User-Suche mit Autocomplete** | Einfaches Teilen ohne E-Mail-Einladungen oder externe Accounts |
| **CouchDB/LiveSync Vault-Synchronisation** | Bidirektional & Read-Only, Intervall-basiert, Konflikterkennung, E2E-Verschlüsselung — kompatibel mit obsidian-livesync |
| **Obsidian Plugin Compatibility** | Obsidian Community Plugins direkt im Web-Frontend ausführen — keine Alternative unterstützt das (Obsidian Publish: kein Plugin-Support; Quartz/MkDocs: statisch, keine Runtime) |
| **Knowledge Graph** | Interaktive Visualisierung der Vault-Verlinkungsstruktur — Obsidian Publish/Quartz haben keinen interaktiven Graph mit Zoom/Pan/Drag |
| **Context Panel (Outline, Links, Tags, Properties)** | Obsidian Publish: kein Outline/Tags-Panel; Quartz: nur statisch. Slatebase: interaktiv, splittbar, Drag & Drop |
| **MCP-Server mit Lese- UND Schreibzugriff** | AI-Assistenten (Claude, Cursor, etc.) können Vaults durchsuchen, Dateien erstellen/bearbeiten/löschen/verschieben — keine Alternative bietet das |
| **Volltextsuche mit Find & Replace** | Vault-weite Suche (Plain-Text + Regex), Multi-Vault-Suche, Kontext-Zeilen, Replace mit Bestätigung — Obsidian Publish/Quartz haben keine Suche, nur statische Indizes |

### Messaging für Posts & Content

- **r/selfhosted:** "Collaboration without SaaS" — viele suchen self-hosted Notion/Confluence-Alternativen mit Team-Features. Sync mit CouchDB/LiveSync als Killer-Feature für bestehende Obsidian-Nutzer.
- **r/ObsidianMD:** "Share your vault with teammates, chat about notes, sync via LiveSync — all self-hosted" — Pain Point der Community. LiveSync-Kompatibilität ist ein starker Hook.
- **Show HN:** "Not just a viewer — a collaborative knowledge platform with CouchDB sync" — hebt sich von Static-Site-Generatoren ab
- **Vergleichsseite:** Tabelle mit ✅/❌ pro Feature vs. Obsidian Publish, Quartz, BookStack, Wiki.js

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
5. **"Zusammenarbeiten, nicht nur speichern."** — Built-in Chat, Vault-Sharing, Echtzeit-Kollaboration ohne dritte App
6. **"Sync mit CouchDB/LiveSync — bidirektional, verschlüsselt, konfliktfrei."** — Nahtlose Integration mit obsidian-livesync
7. **"AI-ready: MCP-Integration für deine Wissensbasis."** — Lesen UND Schreiben via MCP — AI-Assistenten können Vaults durchsuchen, Dateien erstellen, bearbeiten und organisieren
