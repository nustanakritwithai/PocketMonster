// The Pirate client runs in an opaque sandbox. These messages deliberately
// carry only a presentation package and a per-frame capability; no gameplay
// state, save data, or authority is ever sent through this channel.
export const PIRATE_STUDIO_CHARACTER_READY = 'pocketmonster:studio-character-ready-v1';
export const PIRATE_STUDIO_CHARACTER_PACKAGE = 'pocketmonster:studio-character-package-v1';
export const PIRATE_STUDIO_CHARACTER_FAILED = 'pocketmonster:studio-character-failed-v1';
export const PIRATE_STUDIO_CHARACTER_ACCEPTED = 'pocketmonster:studio-character-accepted-v1';
