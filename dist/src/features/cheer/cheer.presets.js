"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHEER_PRESETS = void 0;
exports.getActiveCheerPreset = getActiveCheerPreset;
exports.CHEER_PRESETS = [
    { key: "you_got_this", text: "You got this.", active: true },
    { key: "keep_going", text: "Keep going.", active: true },
    { key: "one_step", text: "One step at a time.", active: true },
    { key: "you_can_do_hard_things", text: "You can do hard things.", active: true },
    { key: "rooting_for_you", text: "Rooting for you.", active: true },
    { key: "proud_of_you", text: "Proud of you.", active: true },
    { key: "dont_stop_now", text: "Don't stop now.", active: true },
    { key: "closer_than_you_think", text: "You're closer than you think.", active: true },
];
function getActiveCheerPreset(presetKey) {
    return exports.CHEER_PRESETS.find((preset) => preset.key === presetKey && preset.active);
}
