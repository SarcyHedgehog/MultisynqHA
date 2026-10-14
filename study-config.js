// Visual configuration for the Study digital twin.
// Coordinates use metres: x = left/right, y = height, z = back/front.
window.PHOTON_HA_STUDY_CONFIG = {
  version: 1,
  room: {
    name: "The Study",
    width: 8,
    depth: 3.8,
    height: 2.55,
    wallColor: "#c8c8c1",
    floorColor: "#6f553f",
    camera: { yaw: -0.72, pitch: 0.52, zoom: 1 },
    openings: [
      { type: "double-door", wall: "back", center: 1.6, width: 1.31, height: 2.08 },
      { type: "window", wall: "back", center: 6.4, width: 1.71, height: 0.55, sill: 1.37, singlePane: true },
      { type: "window", wall: "left", center: 1.0, width: 0.6, height: 1.05, sill: 0.82 },
    ],
  },
  furniture: [
    { type: "rug", name: "Rug", position: [4.25, 0.015, 2.15], size: [3.5, 0.03, 1.75], color: "#33465a" },
    { type: "window-table", name: "Window table", position: [6.4, 0.74, 0.42], size: [1.65, 0.09, 0.5], color: "#b9bec1" },
    { type: "executive-desk", name: "Main desk", position: [6.72, 0.76, 2.05], size: [2.15, 0.09, 0.82], color: "#b9753d", returnSide: "right" },
    { type: "office-chair", name: "Office chair", position: [6.72, 0.48, 3.22], size: [0.62, 0.96, 0.62], rotation: 0, color: "#3d4a53" },
    { type: "dual-monitors", name: "Desk monitors", position: [6.72, 1.17, 1.78], size: [1.15, 0.48, 0.06], color: "#111820", entityId: "switch.office_standard" },
    { type: "rounded-sofa", name: "Green two-seat sofa", position: [1.5, 0, 2.72], size: [1.82, 0.78, 0.78], rotation: -3.927, color: "#034536" },
    { type: "screen", name: "Display", position: [4.0, 1.35, 0.08], size: [1.1, 0.68, 0.08], color: "#0a1018", entityId: "switch.screen" },
  ],
  devices: [
    { entityId: "light.office_light_switch_l1", name: "Ceiling strip left", type: "gu10-track", position: [2.4, 2.5, 1.65], rotation: 1.5708, effect: "warm-light" },
    { entityId: "light.office_light_switch_l2", name: "Ceiling strip right", type: "gu10-track", position: [5.6, 2.5, 1.65], rotation: 1.5708, effect: "warm-light" },
    { entityId: "light.office_standard_lamp", name: "Standard lamp", type: "floor-lamp", position: [0.42, 0, 3.18], effect: "warm-light" },
    { entityId: "light.rgb_strip_lights", name: "LED strip", type: "led-strip", position: [4.0, 2.48, 0.04], size: [7.8, 0.03, 0.03], effect: "colour-wash" },
    { entityId: "light.office_light_switch_l3", name: "Outside wall light", type: "wall-light", position: [4.6, 1.72, -0.18], effect: "warm-light" },
    { entityId: "fan.office_heater", name: "Office heater", type: "heater", position: [3.8, 0, 1.8], effect: "heat" },
    { entityId: "switch.screen", name: "Screen", type: "screen", position: [4.0, 1.35, 0.08], effect: "screen-glow" },
    { entityId: "switch.office_standard", name: "Office monitors", type: "equipment", position: [6.72, 1.17, 1.18], effect: "monitor-glow" },
    { entityId: "binary_sensor.studypresence_occupancy", name: "Presence", type: "presence", position: [3.6, 2.42, 3.0], effect: "presence" },
    { entityId: "binary_sensor.study_door_contact", name: "Study door", type: "door-sensor", position: [1.6, 1.05, 0.03] },
    { entityId: "binary_sensor.study_leak_detector_water_leak", name: "Leak detector", type: "leak", position: [5.2, 0.04, 0.4], effect: "alert" },
    { entityId: "sensor.study_door_device_temperature", name: "Room temperature", type: "temperature", position: [1.6, 1.72, 0.12] },
    { entityId: "sensor.back_garden_motion_illuminance", name: "Outdoor light level", type: "ambient-light" },
  ],
};
