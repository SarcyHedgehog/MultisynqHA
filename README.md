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
- `study.html` / `study-app.js` - alternate rotatable Study digital-twin view.
- `study-model.html` / `study-model-scene.js` - parallel Study view loaded from an editable GLB model.
- `study-config.js` - Study-only room, furniture, device and visual-effect mapping.
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

## Restarting the Home Assistant add-on

If a remote page reports **Game does not exist**, Photon cannot find the private room created by the
bridge. This happens before password authentication and normally means the add-on has lost its Photon
connection even though Home Assistant may still show the add-on as started.

To restart it in Home Assistant:

1. Open **Settings**.
2. Open **Apps** (called **Add-ons** in older Home Assistant versions).
3. Select **Photon HA Bridge**.
4. Open the app information page and press **Restart**.
5. Wait until its status returns to **Running**, then reload the remote webpage.

The restart does not erase the selected entities or change the remote password. The add-on is configured
to start automatically with Home Assistant.

## Supported controls

- Toggle: lights, switches, input booleans, fans, and automations.
- Run/press: scripts, buttons, and input buttons.
- Numeric value: numbers and input numbers.
- Option: selects and input selects.
- Open/stop/close: covers.
- Lock/unlock: locks, only when explicitly exposed as writable.
- All other domains can be exposed read-only.

The picker is capped at 100 exposed entities in this version to keep Photon snapshots comfortably small.

## Alternate Study view

`study.html` uses the same Photon room and bridge as the standard remote, but authenticates against its own
`study` access profile and stores its remembered credential separately. Its visual configuration lives in
`study-config.js`. Every entity it references must be selected in the local administrator picker and included
in the Study profile. The bridge filters snapshots and rejects commands outside that profile, so the browser
cannot escape the view's allow-list by sending a modified request.

### Blender/GLB Study experiment

`study-model.html` uses the same `study` access profile, password, remembered-device credential and device
controls as the original 3D Study. It does not replace `study.html`. Its room and placeholder furniture are
stored in `models/study/study.glb`; download that file from the page, or import it into Blender with
**File → Import → glTF 2.0**.

Objects ending in `_REPLACEABLE` are intended to be swapped for better furniture. Keep entity object names
such as `Entity_StudyDoor_Left`, `Entity_LEDStrip`, `Entity_Screen_Surface` and `Entity_Heater_Fin_*` when
editing, because `study-model-scene.js` uses those names to attach live Home Assistant behaviour. After
editing, export the scene as glTF 2.0 in binary `.glb` form and replace `models/study/study.glb`.

To rebuild the starter model from the measured Study configuration, run:

```sh
npm run build:study-model
```

## Security boundaries

- `PHOTON_APP_ID` is a public application identifier and is safe in `config.js`.
- `haToken` and access-profile passwords belong only in `bridge.config.json`.
- The bridge rejects commands for entities that are absent from either the local allow-list or the caller's
  authenticated access profile.
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
