# N.O.V.A. Visual Playground

A standalone visual prototype of an AI presence: Floating Core → Active Core → Full HUD.

**[Open the live demo](https://mill-miya.github.io/nova-visual-playground/visual-playground/)**

This is a visual simulation. It does not connect to an LLM, microphone, camera, database or device service.

## Controls

- Click the core to expand or collapse.
- Keys 1–9 switch Idle, Active, Listening, Thinking, Speaking, Scanning, Notification, Error and Full HUD.
- Escape collapses; H toggles lab controls.
- SEQUENCE runs the motion demo. Sound is off by default.

## Review the implementation

- [HTML / HUD structure](visual-playground/index.html)
- [CSS / layout and transitions](visual-playground/style.css)
- [JavaScript / Canvas and state machine](visual-playground/app.js)
- [Japanese documentation and verification limitations](visual-playground/README.md)

The source and live demo are public so they can be shared for review. A reviewer needs browser interaction capability to assess motion; reading the source alone does not verify the visual result.

## Local development

Node.js, no dependencies:

```sh
cd visual-playground
npm start
npm run check
```

Open http://127.0.0.1:4173. GitHub Pages serves static files from the root of the master branch; no build step is required.
