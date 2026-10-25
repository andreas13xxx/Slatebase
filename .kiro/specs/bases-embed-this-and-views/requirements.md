# Bases: Ansichtswahl beim Einbetten und `this`-Kontext — Requirements

## Kontext

`![[datei.base]]` und der Inline-Block ```` ```base ```` rendern eine Base schreibgeschützt in einer
Notiz (`BasesEmbed`, Specs `bases-feature-completion` R5 und der Nachtrag dazu). Zwei Dinge fehlen
gegenüber Obsidian:

1. **Ansichtswahl.** Obsidian setzt mit `![[Datei.base#Ansicht]]` die Standardansicht der Einbettung.
   `BasesEmbed` nimmt immer `views[0]` und erzwingt `type: table`. Der Kommentar im Code
   spricht von „first (or named)", der Code kann das nicht.
2. **`this`.** Obsidian löst `this` je nach Ort verschieden auf (Quelle: Obsidian-Hilfe,
   „Bases syntax"): in der Hauptansicht zeigt `this` auf die Base-Datei selbst, **eingebettet auf
   die einbettende Datei**, in der Seitenleiste auf die aktive Notiz. Beispiel der Doku:
   `file.hasLink(this.file)` bildet das Backlinks-Panel nach. Der Ausdrucks-Evaluator
   (`shared-contracts/src/bases/formula/evaluator.ts`) kennt `this` nicht; `this.file` löst sich zu
   `null` auf, ein Filter damit schließt jede Notiz aus.

Verifiziert gegen die Obsidian-Hilfe (obsidian.md/help/bases/create-base und /syntax), nicht gegen
Erinnerung.

## Anforderungen

### R1 — Ansichtswahl `![[x.base#Ansicht]]`

- R1.1 Der Teil nach `#` wählt die Ansicht mit diesem `name`. Ohne `#` bleibt es die erste Ansicht.
- R1.2 Gilt in Live Preview und Leseansicht. Der Block-Embed (```` ```base ````) hat keinen Selektor
  und nimmt weiter die erste Ansicht.
- R1.3 Eine nicht gefundene Ansicht ist ein sichtbarer Fehler („Ansicht nicht gefunden: X"), nie ein
  stiller Rückfall auf die erste Ansicht.
- R1.4 Der Header der Einbettung nennt auch die gewählte Ansicht.

### R2 — `this`-Kontext

- R2.1 In Filtern und Formeln einer eingebetteten Base zeigt `this` auf die einbettende Notiz:
  `this.file.name`, `.basename`, `.path`, `.folder`, `.ext`, `.tags`, `.links`, `.mtime`, `.ctime`,
  `.size`, sowie `this.<Property>` (Frontmatter der Notiz).
- R2.2 `this.file` allein ist als Wert verwendbar, insbesondere als Argument von `file.hasLink(...)`.
- R2.3 Als eigene `.base`-Datei geöffnet zeigt `this` auf die Base-Datei selbst (wie Obsidian).
  Die Seitenleisten-Variante entfällt: Slatebase kennt keine Base in der Seitenleiste.
- R2.4 Ohne bekannten Host (z. B. Ausdruck wird ohne Notiz ausgewertet, MCP `query_base`) löst
  `this.*` zu `null` auf — wie heute, kein Fehler.
- R2.5 Die Backend-Vorfilterung (`prefilter.ts`) darf einen Ausdruck mit `this.*` **nie** als
  Bedingung nach unten geben. Soundness-Vertrag: nie eine Zeile ausschließen, die der volle Filter behält.
- R2.6 Die Host-Zeile kommt aus dem Link-Index (derselbe Weg wie die übrigen Zeilen), nicht aus dem
  Parsen des Host-Textes im Frontend.

### R3 — Tests und Dokumentation

- R3.1 Tests je Anforderung (siehe `tasks.md`), darunter die Soundness von R2.5.
- R3.2 `Features/Bases.md` (DE/EN) erklärt `![[x.base#Ansicht]]` und `this` mit einem lauffähigen
  Beispiel; README und Steering (`product.md`, `implementation-plan.md`) ziehen nach;
  `_meta.md` der Welcome-Vaults wird angehoben.

## Nicht-Ziele

- Kein `this` in der MCP-Schnittstelle `query_base` (kein Host-Kontext vorhanden); bleibt `null`.
- Keine Basis in der Seitenleiste.
- Keine Bearbeitung in der Einbettung (bleibt schreibgeschützt).

## Entscheidungen (vom Nutzer bestätigt)

1. **Andere Ansichtstypen in der Einbettung: nur Tabelle.** Heute wird jede gewählte Ansicht als Tabelle
   gerendert; mit Ansichtswahl fällt das auf (`#Board` mit `type: cards` zeigt eine Tabelle). In dieser
   Spec bleibt es dabei, und die Doku (`Features/Bases.md`, DE/EN) benennt es ehrlich als Grenze. Echtes
   Rendern von `cards`/`list`/`map` in der Einbettung ist eine eigene, spätere Spec.
2. **Aktualisierung: bekannte Grenze, kein `vault:change`-Abonnement.** `BasesEmbed` fragt nur beim Mounten
   ab. Ändert sich die Host-Notiz (`this.status`) oder eine Zielnotiz, bleibt die Einbettung bis zum
   nächsten Mount veraltet. Das wird in der Doku als Grenze genannt (R3.2); ein Abonnement ist ebenfalls
   eine eigene, spätere Spec.
