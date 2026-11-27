---
tags: [fortgeschritten, plugins, beispiel]
gemischt:
  - Text
  - 42
  - true
  - name: Lisa
    rolle: Redaktion
kontakte:
  - name: Max
    telefon: "030 1234567"
  - name: Lisa
    telefon: "040 7654321"
---

# Beispiel: Gemischte Liste

`gemischt` ist eine Liste, die Text, eine Zahl, einen Wahrheitswert und ein Objekt gemeinsam enthält. `kontakte` ist eine Liste von Objekten.

Der eingebaute Listen-Editor kennt nur Text-Einträge. Solche Listen zeigt Slatebase deshalb als verschachtelten Wert, und mit dem [[Fortgeschritten/Plugins/Nested Properties|Nested-Properties-Plugin]] als Gruppe mit einzeln bearbeitbaren Einträgen. Beim Speichern bleibt die Struktur der Liste erhalten.
