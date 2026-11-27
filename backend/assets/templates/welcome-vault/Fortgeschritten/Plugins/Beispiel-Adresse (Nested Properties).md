---
tags: [fortgeschritten, plugins, beispiel]
name: Büro Berlin
adresse:
  strasse: Beispielstraße 1
  plz: "10115"
  stadt: Berlin
  geo:
    latitude: 52.52
    longitude: 13.405
---

# Beispiel-Adresse

Diese Notiz hat verschachteltes Frontmatter: `adresse` ist ein Objekt, und darin ist `geo` ein weiteres Objekt mit `latitude` und `longitude`.

Mit aktiviertem [[Fortgeschritten/Plugins/Nested Properties|Nested-Properties-Plugin]] erscheint `adresse` im Eigenschaften-Editor als aufklappbare Gruppe. Klappe sie auf, dann `geo`, und ändere die Koordinaten. Ohne das Plugin zeigt der Editor `adresse` als YAML-Feld.

Wechsle in den Quelltext-Modus, um die Änderung im Frontmatter zu sehen.
