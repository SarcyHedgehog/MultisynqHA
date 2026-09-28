# Photon migration journal

## 2026-08-10 - Architecture understood

- Preserved the Multisynq implementation as the behavioural reference.
- Traced the full entity path through Multisynq, MQTT, and six HA automations.
- Confirmed the runtime exposes `switch.heater`, `switch.screen`, and `light.laundry_light`.
- Confirmed the 751-entity JSON/CSV files are historical exports rather than runtime inputs.
- Identified public credential exposure, duplicated configuration, unbounded command history,
  optimistic MQTT acknowledgement, and bridge-heartbeat feedback risks.

## 2026-08-10 - Photon transport implemented

- Reused the tested VoteTogether Photon JavaScript SDK and App ID configuration.
- Replaced the synchronized Multisynq model with an authoritative local bridge protocol.
- Added targeted authentication results, command requests/results, bridge identity, and snapshots.
- Kept the Photon room hidden and separated it from the other Sarcastic Hedgehog applications.
- Ensured only the local bridge can reach HA or decide which entities are writable.

## 2026-08-10 - Direct Home Assistant bridge

- Replaced per-entity MQTT transport with the HA WebSocket API.
- Added live state subscription and service calls.
- Added entity/device/area discovery with graceful fallback when optional registry metadata is unavailable.
- Added strict domain/action validation before every HA service call.
- Added reconnection handling and explicit HA availability in remote snapshots.

## 2026-08-10 - Entity picker and mobile remote

- Added a local-only entity picker bound to `127.0.0.1`.
- Added search and filtering by entity, domain, device, and area.
- Added friendly remote labels plus view-only/control permissions.
- Added a responsive remote-user page grouped by HA area.
- Added toggle, button, numeric, select, cover, lock, and read-only presentations.
- Limited exposure to 100 entities to bound snapshot size.

## Remaining before public deployment

- Create and install the HA long-lived token.
- Run the real two-browser acceptance test.
- Add Photon Custom Authentication or an equivalent short-lived token issuer.
- Decide where the static remote page will be hosted.
- Decide how the Node bridge will run continuously on the local network.
- Rotate old Multisynq/Forerunner and MQTT credentials after the legacy app is retired.

## 2026-08-10 - Legacy working files preserved

- The Photon entry points no longer use the Multisynq model/view, browser bridge, Node MQTT bridge,
  counter demo, old entity config, or historical entity exports.
- The historical material remains available in Git history and in
  `C:\HomeAssistant\rollback\20260810_photon_ha_before_migration`.
