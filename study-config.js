// Visual configuration for the Study digital twin.
// Coordinates use metres: x = left/right, y = height, z = back/front.
window.PHOTON_HA_STUDY_CONFIG = {
  version: 1,
  room: {
    name: "The Study",
    width: 8,
    depth: 3.8,
    height: 2.55,
    wallColor: "#9ca5a6",
    floorColor: "#6f553f",
    camera: { yaw: -0.72, pitch: 0.52, zoom: 1 },
    openings: [
      { type: "double-door", wall: "back", center: 1.6, width: 1.31, height: 2.08 },
      { type: "window", wall: "back", center: 6.4, width: 1.71, height: 1.1, sill: 0.82 },
      { type: "window", wall: "left", center: 1.0, width: 0.6, height: 1.05, sill: 0.82 },
    ],
  },
  furniture: [
    { type: "rug", name: "Rug", position: [4.25, 0.015, 2.15], size: [3.5, 0.03, 1.75], color: "#33465a" },
    { type: "desk", name: "Desk", position: [7.05, 0.74, 0.52], size: [1.5, 0.1, 0.6], color: "#5a3826", legs: true },
    { type: "sectional", name: "Sectional", position: [6.72, 0.39, 2.62], size: [2.15, 0.78, 1.05], color: "#344c56" },
    { type: "sofa", name: "Sofa", position: [1.05, 0.43, 2.64], size: [1.7, 0.78, 0.74], rotation: -1.93, color: "#536474" },
    { type: "screen", name: "Display", position: [4.0, 1.35, 0.08], size: [1.1, 0.68, 0.08], color: "#0a1018", entityId: "switch.screen" },
  ],
  devices: [
    { entityId: "light.office_light_switch_l1", name: "Ceiling strip left", type: "gu10-track", position: [2.4, 2.42, 1.8], rotation: 0.78, effect: "warm-light" },
    { entityId: "light.office_light_switch_l2", name: "Ceiling strip right", type: "gu10-track", position: [5.0, 2.42, 1.8], rotation: 0.78, effect: "warm-light" },
    { entityId: "light.office_standard_lamp", name: "Standard lamp", type: "floor-lamp", position: [0.42, 0, 3.18], effect: "warm-light" },
    { entityId: "light.rgb_strip_lights", name: "LED strip", type: "led-strip", position: [2.6, 1.72, 0.06], size: [1.7, 0.03, 0.03], effect: "colour-wash" },
    { entityId: "light.office_light_switch_l3", name: "Outside wall light", type: "wall-light", position: [4.6, 1.72, -0.08], effect: "warm-light" },
    { entityId: "fan.office_heater", name: "Office heater", type: "heater", position: [3.8, 0, 1.8], effect: "heat" },
    { entityId: "switch.screen", name: "Screen", type: "screen", position: [4.0, 1.35, 0.08], effect: "screen-glow" },
    { entityId: "switch.office_standard", name: "Office equipment", type: "equipment", position: [7.25, 0.78, 1.6] },
    { entityId: "binary_sensor.studypresence_occupancy", name: "Presence", type: "presence", position: [3.6, 2.42, 3.0], effect: "presence" },
    { entityId: "binary_sensor.study_door_contact", name: "Study door", type: "door-sensor", position: [1.6, 1.05, 0.03] },
    { entityId: "binary_sensor.study_leak_detector_water_leak", name: "Leak detector", type: "leak", position: [5.2, 0.04, 0.4], effect: "alert" },
    { entityId: "sensor.study_door_device_temperature", name: "Room temperature", type: "temperature", position: [1.6, 1.72, 0.12] },
    { entityId: "switch.back_garden_garden_sockets_socket_1", name: "Garden socket 1", type: "socket", position: [0.08, 0.28, 3.18] },
    { entityId: "switch.socket_socket_2", name: "Garden socket 2", type: "socket", position: [0.08, 0.28, 3.58] },
  ],
};
