# Photon HA

Photon HA is a deliberately small remote-access bridge for selected Home Assistant entities.
It is the Photon Realtime successor to the original MultisynqHA experiment.

The public browser never receives a Home Assistant token, MQTT password, or unrestricted entity list.
Only the local Node bridge can communicate with Home Assistant, and every remote command is checked
against the locally maintained allow-list before it is sent to HA.

## Architecture

```text
Mobile browser
    | Photon Realtime (authenticated room events)
Local Node bridge
    | Home Assistant WebSocket API
Home Assistant

Local administrator browser
    | http://127.0.0.1:8765 only
Entity picker and access policy
```

## Files

- `photon-bridge.mjs` - authoritative Photon/HA bridge and local admin server.
- `public-app.html` / `remote-app.js` - responsive remote-user webpage.
- `admin.html` / `admin-app.js` - local-only entity picker.
- `styles.css` - shared responsive design.
- `vendor/photon.min.js` - the same Photon JavaScript SDK proven by VoteTogether.
- `config.js` - public Photon identifiers; deliberately ignored by Git.
- `bridge.config.json` - local secrets and bridge settings; deliberately ignored by Git.
- `exposed-entities.json` - local entity allow-list; deliberately ignored by Git.

The obsolete Multisynq bridge and historical entity exports remain in Git history and in the
pre-migration rollback. They are not used by the Photon entry points.

## First-time setup

1. In Home Assistant, open your user profile.
2. Under **Long-lived access tokens**, create a token named `Photon HA bridge`.
3. Paste it into `haToken` in `bridge.config.json`.
4. Run `npm install` once.
5. Run `npm run bridge`.
6. Open <http://127.0.0.1:8765/> on the bridge PC.
7. Use the picker to choose entities and whether each is view-only or controllable.
8. Serve `public-app.html`, `remote-app.js`, `styles.css`, `config.js`, and `vendor/photon.min.js`
   from VS Code Live Server for local/mobile testing.

The admin server binds to `127.0.0.1` by default. Do not change it to `0.0.0.0` or expose it through
port forwarding. It has intentionally been designed as a local administration surface.

## Running

```powershell
npm run bridge
```

The bridge will:

1. authenticate to Home Assistant;
2. download the state, entity, device, and area catalogues;
3. subscribe to `state_changed` events;
4. join the hidden Photon room;
5. publish only the selected entity catalogue and states;
6. validate and execute authenticated remote requests;
7. publish updated state back to connected remote pages.

## Supported controls

- Toggle: lights, switches, input booleans, fans, and automations.
- Run/press: scripts, buttons, and input buttons.
- Numeric value: numbers and input numbers.
- Option: selects and input selects.
- Open/stop/close: covers.
- Lock/unlock: locks, only when explicitly exposed as writable.
- All other domains can be exposed read-only.

The picker is capped at 100 exposed entities in this version to keep Photon snapshots comfortably small.

## Security boundaries

- `PHOTON_APP_ID` is a public application identifier and is safe in `config.js`.
- `haToken` and `remotePassword` belong only in `bridge.config.json`.
- The bridge rejects commands for entities that are absent from the local allow-list.
- The public client accepts authoritative snapshots only from the bridge actor that authenticated it.
- Photon transport uses WSS.
- The room-password protocol protects this private proof of concept from ordinary unauthorised access.
  Before broad public deployment, Photon Custom Authentication or a small token-issuing endpoint should
  replace the reusable room password.

## Existing MQTT automations

The six existing MultisynqHA MQTT automations can remain enabled during testing, but Photon HA does not
use them. Once direct HA control has been proven, they can be disabled or removed separately. Keeping
that cleanup separate makes rollback straightforward.

## Validation

```powershell
npm run check
```

For a real acceptance test, use two independent browser contexts and verify:

1. a wrong password is rejected;
2. a correct password receives only selected entities;
3. a read-only entity has no control;
4. a writable entity changes in HA and returns the confirmed live state;
5. stopping the bridge prevents commands;
6. restarting the bridge restores current HA state without replaying old commands.
