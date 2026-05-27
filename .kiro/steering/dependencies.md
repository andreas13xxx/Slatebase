# Slatebase — Dependency-Management

## Grundregeln

- **Pinned Versions** verwenden (exakte Version, kein `^` oder `~`)
- Vor Installation prüfen: Downloads, Maintainer, letztes Update, bekannte Vulnerabilities
- Bevorzugt kleine, fokussierte Libraries statt großer Frameworks
- Keine Packages installieren die das gleiche Problem lösen wie eine bereits vorhandene Dependency

## Vor dem Hinzufügen einer Dependency

1. Brauchen wir das wirklich? Kann es mit vorhandenen Mitteln gelöst werden?
2. Ist das Paket aktiv maintained (letztes Update < 6 Monate)?
3. Hat es eine vernünftige Download-Zahl auf npm?
4. Gibt es bekannte Security-Issues (`npm audit`)?
5. Passt die Lizenz (MIT, Apache-2.0, BSD bevorzugt)?

## Bestehende Kern-Dependencies

### Backend
- **hono** — HTTP-Framework (leichtgewichtig, kein Express)
- **zod** — Schema-Validierung
- **pino** — Structured Logging
- **tsx** — Dev-Server mit TypeScript
- **argon2** — Passwort-Hashing (argon2id, memory-hard, OWASP-empfohlen)

### Frontend
- **react / react-dom** — UI-Framework
- **vite** — Build-Tool und Dev-Server
- **vitest** — Test-Runner
- **@testing-library/react** — Component Testing
- **playwright** — E2E Testing
- **unified / remark-parse / remark-gfm / remark-frontmatter** — Markdown-Parsing (MDAST)
- **yaml** — YAML-Parser für Frontmatter-Darstellung
- **highlight.js** — Syntax-Highlighting in Code-Blöcken
- **lucide-react** — Icon-Library (SVG-basiert, tree-shakeable, konsistente Lucide-Icons)
- **jszip** — Client-seitiges ZIP-Erstellen (Vault-Export-Fallback für Firefox)

### Shared (devDependencies)
- **fast-check** — Property-Based Testing (universelle Invarianten verifizieren, Reducer-Korrektheit)
- **vitest** — Test-Runner (beide Packages)

## Was NICHT eingeführt werden soll

- Kein Express, Fastify oder Koa (Hono ist gewählt)
- Kein Redux, Zustand, Jotai (useReducer + Context reicht)
- Kein ORM (Filesystem-basiert, keine DB)
- Kein DI-Container (manuelle Verdrahtung ist bewusst)
- Kein CSS-Framework / Tailwind (eigenes CSS mit Design Tokens, ggf. später CSS Modules)
- Kein Mocking-Framework für Backend-Tests (hand-geschriebene Mocks)
- Kein JWT/jose/jsonwebtoken (opake Tokens mit serverseitiger Session-Verwaltung gewählt)
- Kein Passport.js oder ähnliche Auth-Frameworks (eigene Middleware, schlanker)
- Kein Next.js (SPA mit eigenem Backend, kein SSR nötig)
- Kein shadcn/ui (setzt Tailwind voraus)
- Kein Framer Motion (kein klarer Mehrwert für Knowledge-Management-Tool)

## Updates

- `npm outdated` regelmäßig prüfen
- Major-Updates einzeln durchführen und testen
- `package-lock.json` immer mit committen
