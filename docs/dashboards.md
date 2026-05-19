# Surface Dashboard

Surface ships a local dashboard server for any producer that emits a Surface-compatible dashboard read model.

Run it from a consumer project:

```sh
surface dashboard --read-model .veritas/surface-dashboard/latest.json --port 4242
```

The server reads the JSON file fresh on each page load, injects it into the dashboard shell as `window.__SURFACE_CONFIG__.readModel`, and serves the vanilla JS/CSS dashboard locally. If the read model is missing, the page shows the empty dashboard state and does not fabricate claims.

Consumers can pass a JSON config file for producer-specific language and theme:

```json
{
  "port": 4242,
  "readModelPath": ".veritas/surface-dashboard/latest.json",
  "vocab": {
    "projectName": "Veritas repo governance",
    "projectKind": "repo governance"
  },
  "theme": {
    "brandName": "Veritas"
  }
}
```

Then run:

```sh
surface dashboard --config surface.config.json
```

Surface owns the dashboard shell, status model, proof-gap browser, claim browser, and metadata drilldown. Producer projects own the read model and vocabulary that make the dashboard meaningful for their domain.
