# Requirements Document

## Introduction

Das Kontext-Panel ist ein rechtes Seitenpanel in Slatebase, das kontextbezogene Informationen zum aktuell geöffneten Dokument anzeigt. Es ersetzt den bisherigen Platzhalter im Right Panel durch vier spezialisierte Ansichten: Dokumentgliederung, ein- und ausgehende Links, Tags-Übersicht und Frontmatter-Eigenschaften. Die Ansichten sind über Reiter am oberen Rand umschaltbar, per Drag & Drop umsortierbar und können in übereinander liegende Bereiche gesplittet werden, sodass mehrere Ansichten gleichzeitig sichtbar sind.

## Glossary

- **Context_Panel**: Das rechte Seitenpanel der Anwendung, das kontextbezogene Informationen zum aktiven Dokument anzeigt.
- **Tab_Bar**: Die horizontale Reiterleiste am oberen Rand des Context_Panel, über die zwischen Ansichten umgeschaltet wird.
- **View_Tab**: Ein einzelner Reiter in der Tab_Bar, der eine bestimmte Ansicht repräsentiert.
- **Outline_View**: Die Ansicht, die die Überschriften-Hierarchie (h1–h6) des aktuell geöffneten Dokuments als navigierbare Baumstruktur darstellt.
- **Links_View**: Die Ansicht, die ein- und ausgehende Wikilinks des aktuellen Dokuments auflistet.
- **Tags_View**: Die Ansicht, die alle im Vault vorkommenden Tags mit Häufigkeit auflistet.
- **Properties_View**: Die Ansicht, die die YAML-Frontmatter-Eigenschaften des aktuellen Dokuments als Schlüssel-Wert-Paare darstellt.
- **Split_Section**: Ein eigenständiger Bereich innerhalb des Context_Panel, der eine eigene Ansicht anzeigt und durch Splitting entsteht.
- **Active_Document**: Das Markdown-Dokument, das im aktuell aktiven Tab des Editors geöffnet ist.
- **Forward_Link**: Ein Wikilink im Active_Document, der auf ein anderes Dokument verweist.
- **Backlink**: Ein Wikilink in einem anderen Dokument, der auf das Active_Document verweist.

## Requirements

### Requirement 1: Tab-basierte Navigation

**User Story:** Als Benutzer möchte ich über Reiter am oberen Rand des Kontext-Panels zwischen verschiedenen Ansichten umschalten können, damit ich schnell auf die gewünschten Kontextinformationen zugreifen kann.

#### Acceptance Criteria

1. THE Context_Panel SHALL display a Tab_Bar at the top containing exactly four View_Tab elements labeled "Gliederung", "Links", "Tags" and "Eigenschaften"
2. WHEN a user clicks on a View_Tab, THE Context_Panel SHALL display only the corresponding view, hide the previously active view, and indicate the active View_Tab through a visually distinct style (such as a bottom border, background change, or font weight change) that differentiates it from inactive View_Tabs
3. WHEN the Context_Panel is first shown, THE Context_Panel SHALL display the Outline_View as the default active view with its corresponding View_Tab indicated as active
4. IF no Active_Document is open, THEN THE Context_Panel SHALL display a placeholder message in the Outline_View, Links_View, Tags_View, and Properties_View indicating that no document is selected
5. WHEN a user drags a View_Tab to a different position within the Tab_Bar, THE Context_Panel SHALL reorder the View_Tabs to reflect the new position and persist the order for the duration of the session

### Requirement 2: Dokumentgliederung (Outline View)

**User Story:** Als Benutzer möchte ich die Überschriften-Hierarchie des aktuellen Dokuments sehen, damit ich die Struktur auf einen Blick erfassen und zu bestimmten Abschnitten navigieren kann.

#### Acceptance Criteria

1. WHEN an Active_Document is open, THE Outline_View SHALL parse all headings (h1 through h6) from the document content and display them as a nested list, showing each heading's plain text content (without Markdown formatting markers such as `#`, `**`, or `_`)
2. THE Outline_View SHALL indent child headings by 12px per heading level relative to h1 to reflect the document hierarchy
3. WHEN a user clicks on a heading entry in the Outline_View, THE Outline_View SHALL scroll the Active_Document to the corresponding heading element using smooth scrolling with block alignment "start", applying the same anchor normalization as heading-anchor.ts
4. WHEN the Active_Document content changes (edit buffer update), THE Outline_View SHALL update the heading tree within 500ms of the last keystroke (debounced)
5. WHEN the Active_Document contains no headings, THE Outline_View SHALL display a localized message indicating that no headings were found
6. WHEN the user switches the Active_Document (selects a different tab), THE Outline_View SHALL replace the heading tree with the headings of the newly active document within 200ms
7. WHILE the Active_Document is scrolled, THE Outline_View SHALL visually highlight the heading entry corresponding to the topmost visible heading in the viewport

### Requirement 3: Ein- und ausgehende Links (Links View)

**User Story:** Als Benutzer möchte ich sehen, welche Dokumente auf das aktuelle Dokument verlinken und auf welche Dokumente das aktuelle Dokument verweist, damit ich Zusammenhänge in meiner Wissensbasis nachvollziehen kann.

#### Acceptance Criteria

1. WHEN an Active_Document is open, THE Links_View SHALL display two sections: "Ausgehende Links" (Forward Links) and "Eingehende Links" (Backlinks), with the "Ausgehende Links" section listed first
2. WHILE an Active_Document is open, THE Links_View SHALL list all Forward_Link targets extracted from the Active_Document content in the "Ausgehende Links" section, displaying each entry as the link target path (filename without extension if no path prefix, otherwise relative path)
3. WHILE an Active_Document is open, THE Links_View SHALL retrieve Backlink data from the backend graph endpoint (`GET /vaults/:vaultId/backlinks?path=<filePath>`) and display all source file paths in the "Eingehende Links" section, displaying each entry as the source file path (filename without extension if no path prefix, otherwise relative path)
4. WHEN a user clicks on a resolved link entry in the Links_View, THE Context_Panel SHALL open the linked document in a new editor tab
5. IF a user clicks on an unresolved link entry in the Links_View, THEN THE Links_View SHALL take no navigation action (the entry remains non-interactive)
6. THE Links_View SHALL visually distinguish between resolved links (target file exists) and unresolved links (target file does not exist) by rendering unresolved links with reduced opacity (0.5) and a strikethrough text decoration
7. WHEN the Active_Document content changes, THE Links_View SHALL update the Forward_Link list within 500ms
8. WHEN the Active_Document changes (user switches to a different tab), THE Links_View SHALL update both the Forward_Link list and the Backlink list within 500ms
9. WHEN no Forward_Links or Backlinks exist, THE Links_View SHALL display a placeholder message indicating that no links were found in the respective section
10. IF the backend graph endpoint returns an error or is unreachable, THEN THE Links_View SHALL display an error message in the "Eingehende Links" section indicating that backlinks could not be loaded, while the "Ausgehende Links" section remains functional

### Requirement 4: Tags-Übersicht (Tags View)

**User Story:** Als Benutzer möchte ich eine Übersicht aller Tags in meinem Vault sehen, damit ich meine Notizen thematisch einordnen und nach Tags filtern kann.

#### Acceptance Criteria

1. WHEN a vault is selected, THE Tags_View SHALL parse all text files (files recognized as plain text per the existing tag plugin's #tag syntax: letters, digits, underscores, hyphens, and slashes after the `#` marker) and display all unique tags found, excluding tags inside code blocks and inline code
2. THE Tags_View SHALL display each tag with its occurrence count, defined as the number of distinct files containing at least one instance of that tag
3. THE Tags_View SHALL sort tags alphabetically in case-insensitive order by default, treating nested tags (e.g., `#project/alpha`) as flat strings for sorting purposes
4. WHEN a user clicks on a tag entry, THE Tags_View SHALL display a list of files containing that tag, showing each file's relative path within the vault
5. WHEN a user clicks on a file in the tag detail list, THE system SHALL open that file in a new editor tab using the existing tab system
6. IF the vault contains no tags, THEN THE Tags_View SHALL display a message indicating that no tags were found
7. WHILE tags are being loaded from the vault, THE Tags_View SHALL display a loading indicator
8. IF a file cannot be read during tag extraction, THEN THE Tags_View SHALL skip that file and continue processing remaining files without displaying an error to the user

### Requirement 5: Frontmatter-Eigenschaften (Properties View)

**User Story:** Als Benutzer möchte ich die YAML-Frontmatter-Eigenschaften des aktuellen Dokuments übersichtlich sehen, damit ich Metadaten wie Datum, Status oder Kategorien schnell erfassen kann.

#### Acceptance Criteria

1. WHEN an Active_Document with YAML frontmatter is open, THE Properties_View SHALL parse the frontmatter and display all top-level key-value pairs as a two-column table with key names in the first column and values in the second column
2. THE Properties_View SHALL display nested YAML objects with indentation of 1rem per nesting level, up to a maximum depth of 5 levels, rendering deeper levels as inline JSON text
3. WHEN the Active_Document has no frontmatter, THE Properties_View SHALL display a message indicating that no properties were found
4. WHEN the Active_Document content changes, THE Properties_View SHALL update the displayed properties within 500ms
5. THE Properties_View SHALL display array values as comma-separated inline text within the value column
6. IF the YAML frontmatter is syntactically invalid, THEN THE Properties_View SHALL display an error message indicating that the frontmatter could not be parsed and show the raw frontmatter text as a code block
7. WHEN the Active_Document has an empty frontmatter block containing no key-value pairs, THE Properties_View SHALL display a message indicating that no properties were found

### Requirement 6: Drag & Drop Reiter-Sortierung

**User Story:** Als Benutzer möchte ich die Reihenfolge der Reiter im Kontext-Panel per Drag & Drop anpassen können, damit ich die für mich wichtigsten Ansichten an erster Stelle habe.

#### Acceptance Criteria

1. WHEN a user drags a View_Tab and drops it at a new position within the Tab_Bar, THE Context_Panel SHALL reorder the tabs so that the dragged tab is inserted at the drop index and all other tabs shift accordingly
2. WHILE a View_Tab is being dragged, THE Context_Panel SHALL display a vertical insertion line (2px wide, using the accent color Design Token) between the two tabs closest to the current pointer position, indicating the drop target
3. WHILE a View_Tab is being dragged over an invalid drop area (outside the Tab_Bar boundaries), THE Context_Panel SHALL display a "not-allowed" cursor and SHALL NOT change the tab order if the user releases the drag
4. THE Context_Panel SHALL persist the tab order as an array of tab identifiers in localStorage under a key scoped to the current user, so that the order is restored when the same user opens the application in a new session
5. IF localStorage is unavailable or the stored tab order contains identifiers that no longer exist, THEN THE Context_Panel SHALL fall back to the default tab order without displaying an error to the user
6. IF only one View_Tab is present in the Tab_Bar, THEN THE Context_Panel SHALL NOT initiate a drag operation (the tab is not draggable)

### Requirement 7: Panel-Splitting

**User Story:** Als Benutzer möchte ich das Kontext-Panel in übereinander liegende Bereiche aufteilen können, damit ich mehrere Ansichten gleichzeitig sehen kann.

#### Acceptance Criteria

1. WHEN a user drags a View_Tab at least 30px below the bottom edge of its Tab_Bar into the panel body, THE Context_Panel SHALL create a new Split_Section below the existing sections and display the dragged view in that section with equal height distribution across all sections
2. WHILE a View_Tab is being dragged below the Tab_Bar threshold, THE Context_Panel SHALL display a visual drop indicator (highlighted drop zone) in the panel body showing where the new Split_Section will appear
3. THE Context_Panel SHALL display Split_Sections as vertically stacked areas with a 4px resize handle between them, enforcing a minimum height of 80px per section
4. WHEN a user drags the resize handle between two Split_Sections, THE Context_Panel SHALL adjust the height distribution between the sections while maintaining a minimum height of 80px per section
5. WHEN a Split_Section contains only one view and the user drags that view into any Tab_Bar of another Split_Section, THE Context_Panel SHALL remove the empty Split_Section and redistribute its height equally among the remaining sections
6. THE Context_Panel SHALL support a maximum of three simultaneous Split_Sections
7. IF the maximum of three Split_Sections already exists and a user drags a View_Tab below the Tab_Bar threshold, THEN THE Context_Panel SHALL not create a new section and SHALL return the tab to its original position
8. THE Context_Panel SHALL persist the split layout configuration (number of sections, height distribution, and view assignment per section) in localStorage so that the layout is restored on the next session
9. IF a Split_Section contains multiple views, THEN that Split_Section SHALL display its own Tab_Bar allowing tab switching within the section

### Requirement 8: Responsives Verhalten

**User Story:** Als Benutzer möchte ich, dass das Kontext-Panel sich an verschiedene Panelbreiten anpasst, damit die Inhalte auch bei schmaler Darstellung lesbar bleiben.

#### Acceptance Criteria

1. WHILE the Context_Panel width is less than 200px, THE Context_Panel SHALL hide the tab labels and display only icons in the Tab_Bar
2. WHEN a text entry (file path, tag name, or property value) exceeds the available horizontal space of its container, THE Context_Panel SHALL truncate the text with an ellipsis character and SHALL display the full text in a native browser tooltip (title attribute) on hover
3. THE Context_Panel SHALL use the existing resize infrastructure (useResize hook) for width adjustment with a minimum width of 160px and a maximum width of 500px
4. WHEN the Context_Panel width crosses the 200px threshold (in either direction), THE Context_Panel SHALL transition between icon-only and icon-plus-label display without requiring a page reload or user interaction beyond resizing
