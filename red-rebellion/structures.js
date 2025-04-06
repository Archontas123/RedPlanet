export { Wall } from './structures/Wall.js';
export { Stairs } from './structures/Stairs.js';
export { Door } from './structures/Door.js';
export { Room } from './structures/Room.js';
export { Building } from './structures/Building.js';

// Constants (can be kept here or moved to a dedicated constants file if preferred)
export const WALL_THICKNESS = 15;
export const INTERNAL_DOOR_WIDTH = 50;
export const EXTERNAL_DOOR_WIDTH = 70;
export const MIN_ROOM_SIZE = 150;
export const INTERACTABLE_PLACEMENT_CHANCE = 0.7;
export const MAX_INTERACTABLES_PER_ROOM = 2;
export const INTERACTABLE_BUFFER = 40;
export const STRUCTURE_BUFFER = 20;
