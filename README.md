# Multisynq + Home Assistant Entity Sync Demo

This reference app demonstrates a pattern where:

- a local bridge app runs on the home network and talks to Home Assistant
- a public app runs anywhere and only talks to the shared Multisynq model
- the bridge synchronizes selected HA entities into the model and applies remote requests back to HA

That keeps HA credentials out of the public app while still allowing remote users to control selected entities.

## Files

- `local-bridge.html`
  Runs locally on the HA network. Joins one fixed session, reads configured entities, and applies changes back to HA.
- `public-app.html`
  Lets any user join a session by name and password, view synced entities, and send simple toggle requests.
- `shared.js`
  Shared Multisynq model plus bridge and public view logic.
- `config.example.js`
  Example public Multisynq config.
- `entity-config.example.js`
  Example local bridge config with session, HA, and entity settings.

## Setup

1. Copy `config.example.js` to `config.js`.
2. Fill in `APP_CONFIG.API_KEY` and `APP_CONFIG.APP_ID`.
3. Copy `entity-config.example.js` to `entity-config.js`.
4. Fill in:
   - `sessionName`
   - `sessionPassword`
   - `haUrl`
   - `haToken`
   - `entities`

## Running the local bridge

Serve `local-bridge.html` from a machine that can reach Home Assistant.

Recommended:

- host it from the same Home Assistant origin, or
- another local origin that your HA setup allows

Open `local-bridge.html`. It will:

- join the fixed Multisynq session from `entity-config.js`
- publish the configured entity list into the shared model
- poll HA for current state
- listen for remote change requests and call the appropriate HA service

## Running the public app

Serve `public-app.html` from your public site.

The public app:

- loads `config.js`
- prompts for session name and password
- displays entities once the local bridge has published them
- supports simple binary toggle actions for writable entities

## Supported entity behavior

The first pass supports simple binary entities:

- `light.*`
- `switch.*`
- `input_boolean.*`

For those domains, the bridge maps requests to:

- `turn_on`
- `turn_off`

Read-only entities can still be shown in the public app by setting `writable: false`.

## Current limitations

- The bridge currently polls HA instead of using HA's WebSocket API.
- The public UI currently supports only `kind: "toggle"`.
- Numeric values, text values, optimistic updates, and richer command acknowledgements are not implemented yet.
- If the bridge is offline, the public app can still join but commands will not be applied.

## Next steps

- replace polling with the HA WebSocket API for true push updates
- add `number` and `text` entity kinds
- add per-entity controls based on metadata
- expose bridge presence and command history more richly in the UI
