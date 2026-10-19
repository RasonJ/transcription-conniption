# MUFI character assets

Vendored snapshot of the [Medieval Unicode Font Initiative](https://mufi.info/q.php?p=mufi/chars) character recommendation for HSMS↔HTML↔Unicode mapping.

| File | Role |
| --- | --- |
| `mufi-chars.json` | Parsed catalog (MUFI v4.0 code-chart order) |
| `hsms-overlays.json` | Extra HSMS / HTML bindings not covered by `legacy_hsms_settings.ini` |
| `ornate-initials/` | Optional static SVG overrides: `{LETTER}/{styleLabel}.svg` |
| `fonts/` | [Andron Scriptor](https://mufi.info/q.php?p=mufi/fonts/fonts/53) (MUFI font **53**) registry + optional local TTF/WOFF |
| `MUFI-v4.0-chart.pdf` | Source PDF (downloaded by fetch script; not required at runtime) |
| `MUFI-v4.0-chart.txt` | `pdftotext` extract used when regenerating the JSON |

**License:** MUFI data is [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Attribution: Medieval Unicode Font Initiative; Odd Einar Haugen (ed.), *MUFI character recommendation* v4.0 (22 Dec 2015), [http://hdl.handle.net/1956/10699](http://hdl.handle.net/1956/10699), [www.mufi.info](https://www.mufi.info/).

Regenerate:

```bash
npm run fetch:mufi    # download PDF + rebuild mufi-chars.json
npm run generate:mufi # emit utils/generated/mufiCharMap.ts + ornateInitialInventory.ts
```

Live JSON export from mufi.info is often behind a browser check; this repo vendors the v4.0 PDF chart as the durable source.
