// Copy this file to entity-config.js for the local bridge app.
// Keep this file local. It contains your HA details and the fixed session credentials.
window.ENTITY_SYNC_CONFIG = {
  sessionName: "ha-entity-sync",
  sessionPassword: "change-this-password",
  haUrl: "http://homeassistant.local:8123",
  haToken: "YOUR_LONG_LIVED_ACCESS_TOKEN",
  pollIntervalMs: 3000,
  entities: [
    {
      entityId: "light.office_lamp",
      name: "Office Lamp",
      kind: "toggle",
      writable: true,
    },
    {
      entityId: "switch.fan",
      name: "Desk Fan",
      kind: "toggle",
      writable: true,
    },
    {
      entityId: "binary_sensor.front_door",
      name: "Front Door",
      kind: "toggle",
      writable: false,
    },
  ],
};
