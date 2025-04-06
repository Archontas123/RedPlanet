import { Vector2 } from './utils.js';
import { Chest } from './entities.js';

const WALL_COLOR = '#888888';
const DOOR_COLOR_CLOSED = '#a0522d';
const DOOR_COLOR_OPEN = '#d2b48c';
const BARRACKS_EXTERIOR_COLOR = '#6a5acd';
const BARRACKS_INTERIOR_COLOR = 'rgba(70, 70, 70, 0.8)';
const WALL_THICKNESS = 15;
const INTERNAL_DOOR_WIDTH = 50;
const EXTERNAL_DOOR_WIDTH = 70;
const MIN_ROOM_SIZE = 150;
const CHEST_PLACEMENT_CHANCE = 0.6;
const CHEST_BUFFER = 40;
const STRUCTURE_BUFFER = 20; // Buffer around doors/chests for random point generation

export class Wall {
    constructor(position, size) {
        this.position = position;
        this.size = size;
        this.color = WALL_COLOR;
    }

    draw(ctx, camera) {
        ctx.fillStyle = this.color;
        const drawBuffer = 1;
        ctx.fillRect(
            this.position.x - this.size.x / 2 - drawBuffer - camera.x,
            this.position.y - this.size.y / 2 - drawBuffer - camera.y,
            this.size.x + drawBuffer * 2,
            this.size.y + drawBuffer * 2
        );
    }

    getRectData() {
        return {
            x: this.position.x,
            y: this.position.y,
            width: this.size.x,
            height: this.size.y
        };
    }
}

export class Door {
    constructor(position, size, isExternal = false) {
        this.position = position;
        this.size = size;
        this.isOpen = false;
        this.isExternal = isExternal;
        this.color = DOOR_COLOR_CLOSED;
    }

    interact() {
        this.isOpen = !this.isOpen;
        this.color = this.isOpen ? DOOR_COLOR_OPEN : DOOR_COLOR_CLOSED;
        // Add log to confirm state change inside the method
        console.log(`Door instance interacted. New state: isOpen=${this.isOpen}, color=${this.color}`);
    }

    open() {
        if (!this.isOpen) {
            this.isOpen = true;
            this.color = DOOR_COLOR_OPEN;
        }
    }

    close() {
        if (this.isOpen) {
            this.isOpen = false;
            this.color = DOOR_COLOR_CLOSED;
        }
    }

    draw(ctx, camera) {
        ctx.fillStyle = this.color;
        ctx.fillRect(
            this.position.x - this.size.x / 2 - camera.x,
            this.position.y - this.size.y / 2 - camera.y,
            this.size.x,
            this.size.y
        );

        if (!this.isOpen) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            const knobSize = Math.min(this.size.x, this.size.y) * 0.2;
            ctx.fillRect(
                this.position.x - knobSize / 2 - camera.x,
                this.position.y - knobSize / 2 - camera.y,
                knobSize,
                knobSize
            );
        }
    }

    getRectData() {
        return {
            x: this.position.x,
            y: this.position.y,
            width: this.size.x,
            height: this.size.y
        };
    }
}

class Room {
    constructor(x, y, width, height) {
        this.rect = { x, y, width, height };
        this.center = new Vector2(x + width / 2, y + height / 2);
        this.chests = [];
        this.doors = [];
    }

    containsPoint(point) {
        return (
            point.x >= this.rect.x &&
            point.x < this.rect.x + this.rect.width &&
            point.y >= this.rect.y &&
            point.y < this.rect.y + this.rect.height
        );
    }
}

export class Building {
    constructor(position, size) {
        this.position = position;
        this.size = size;
        this.type = 'barracks';
        this.walls = [];
        this.doors = [];
        this.chests = [];
        this.rooms = [];
        this.exteriorColor = BARRACKS_EXTERIOR_COLOR;
        this.interiorColor = BARRACKS_INTERIOR_COLOR;
        this.externalDoor = null;
        this.interiorRect = null;

        this._generateBarracksLayout();
    }

    _generateBarracksLayout() {
        this.walls = [];
        this.doors = [];
        this.chests = [];
        this.rooms = [];
        this.externalDoor = null;

        const interiorX = this.position.x + WALL_THICKNESS;
        const interiorY = this.position.y + WALL_THICKNESS;
        const interiorWidth = this.size.x - 2 * WALL_THICKNESS;
        const interiorHeight = this.size.y - 2 * WALL_THICKNESS;
        this.interiorRect = { x: interiorX, y: interiorY, width: interiorWidth, height: interiorHeight };

        this._createOuterWallsAndDoor();

        const fixedCorridorHeight = 80;
        const corridorWidth = interiorWidth;
        const corridorX = interiorX;
        const corridorBottomEdgeY = this.position.y + this.size.y - WALL_THICKNESS;
        const corridorY = corridorBottomEdgeY - fixedCorridorHeight;

        const roomAreaTop = { x: interiorX, y: interiorY, width: interiorWidth, height: Math.max(0, corridorY - interiorY) };
        const roomAreaBottom = { x: interiorX, y: corridorBottomEdgeY, width: interiorWidth, height: Math.max(0, (interiorY + interiorHeight) - corridorBottomEdgeY) };

        this._placeRoomsInArea(roomAreaTop, corridorY, corridorBottomEdgeY, corridorWidth);
        this._placeRoomsInArea(roomAreaBottom, corridorY, corridorBottomEdgeY, corridorWidth);

        this._createCorridorWalls(corridorX, corridorY, corridorBottomEdgeY, corridorWidth);
        this._placeChestsInRooms();
    }

    _createOuterWallsAndDoor() {
        const halfW = this.size.x / 2;
        const halfH = this.size.y / 2;
        const centerX = this.position.x + halfW;
        const centerY = this.position.y + halfH;
        const doorHeight = WALL_THICKNESS;

        // Top wall
        this.walls.push(new Wall(new Vector2(centerX, this.position.y + WALL_THICKNESS / 2), new Vector2(this.size.x, WALL_THICKNESS)));
        // Left wall (initial full height)
        this.walls.push(new Wall(new Vector2(this.position.x + WALL_THICKNESS / 2, centerY), new Vector2(WALL_THICKNESS, this.size.y)));
        // Right wall (initial full height)
        this.walls.push(new Wall(new Vector2(this.position.x + this.size.x - WALL_THICKNESS / 2, centerY), new Vector2(WALL_THICKNESS, this.size.y)));

        // Bottom wall with external door
        const bottomWallSegmentWidth = (this.size.x - EXTERNAL_DOOR_WIDTH) / 2;
        const externalDoorPosY = this.position.y + this.size.y - WALL_THICKNESS / 2;
        const externalDoorPos = new Vector2(centerX, externalDoorPosY);
        const externalDoorSize = new Vector2(EXTERNAL_DOOR_WIDTH, doorHeight);
        this.externalDoor = new Door(externalDoorPos, externalDoorSize, true);
        this.doors.push(this.externalDoor);
        // Wall segments left/right of door
        this.walls.push(new Wall(new Vector2(this.position.x + bottomWallSegmentWidth / 2, externalDoorPosY), new Vector2(bottomWallSegmentWidth, WALL_THICKNESS)));
        this.walls.push(new Wall(new Vector2(this.position.x + this.size.x - bottomWallSegmentWidth / 2, externalDoorPosY), new Vector2(bottomWallSegmentWidth, WALL_THICKNESS)));

        // Adjust side wall heights
        const leftWallIndex = this.walls.findIndex(w => Math.abs(w.position.x - (this.position.x + WALL_THICKNESS / 2)) < 1);
        const rightWallIndex = this.walls.findIndex(w => Math.abs(w.position.x - (this.position.x + this.size.x - WALL_THICKNESS / 2)) < 1);

        if (leftWallIndex !== -1) {
            this.walls[leftWallIndex].size.y -= WALL_THICKNESS * 2;
            this.walls[leftWallIndex].position.y = centerY;
        }
         if (rightWallIndex !== -1) {
            this.walls[rightWallIndex].size.y -= WALL_THICKNESS * 2;
            this.walls[rightWallIndex].position.y = centerY;
        }
    }

    _placeRoomsInArea(area, corridorTopY, corridorBottomY, corridorWidth) {
        let currentX = area.x;
        const roomHeight = area.height;
        const doorHeight = WALL_THICKNESS;

        if (roomHeight < MIN_ROOM_SIZE) {
             return;
        }

        while (currentX < area.x + area.width - MIN_ROOM_SIZE / 2) {
            const availableWidth = area.x + area.width - currentX;
            const roomWidth = Math.max(MIN_ROOM_SIZE, Math.min(availableWidth, MIN_ROOM_SIZE + Math.random() * availableWidth * 0.6));
            const actualRoomWidth = Math.min(roomWidth, availableWidth);

            if (actualRoomWidth < MIN_ROOM_SIZE / 2) break;

            const room = new Room(currentX, area.y, actualRoomWidth, roomHeight);
            this.rooms.push(room);

            // Create vertical wall separating rooms if needed
            const nextRoomStartX = currentX + actualRoomWidth + WALL_THICKNESS;
            if (nextRoomStartX < area.x + area.width - MIN_ROOM_SIZE / 2) {
                const wallX = currentX + actualRoomWidth;
                let wallStartY, wallEndY;
                const connectToCorridorEdgeY = (area.y < corridorTopY) ? corridorTopY : corridorBottomY;

                if (connectToCorridorEdgeY === corridorTopY) { // Room is ABOVE corridor
                    wallStartY = area.y;
                    wallEndY = corridorTopY - WALL_THICKNESS / 2;
                } else { // Room is BELOW corridor
                    wallStartY = corridorBottomY + WALL_THICKNESS / 2;
                    wallEndY = area.y + roomHeight;
                }

                if (wallEndY < wallStartY) [wallStartY, wallEndY] = [wallEndY, wallStartY];
                const wallHeight = wallEndY - wallStartY;
                const wallCenterY = wallStartY + wallHeight / 2;

                if (wallHeight > 0) {
                    this.walls.push(new Wall(new Vector2(wallX, wallCenterY), new Vector2(WALL_THICKNESS, wallHeight)));
                }
            }

            // Create door connecting room to corridor
            const doorPosX = currentX + actualRoomWidth / 2;
            const doorPosY = (area.y < corridorTopY) ? corridorTopY : corridorBottomY;
            const doorSize = new Vector2(INTERNAL_DOOR_WIDTH, doorHeight);
            const door = new Door(new Vector2(doorPosX, doorPosY), doorSize, false);
            this.doors.push(door);
            room.doors.push(door);

            currentX += actualRoomWidth + WALL_THICKNESS;
        }
    }

    _createCorridorWalls(corridorX, corridorTopY, corridorBottomY, corridorWidth) {
        const createWallSegments = (targetY, relevantDoors) => {
            relevantDoors.sort((a, b) => a.position.x - b.position.x);
            let lastX = corridorX;

            for (const door of relevantDoors) {
                const doorLeftEdge = door.position.x - door.size.x / 2;
                const segmentWidth = doorLeftEdge - lastX;
                if (segmentWidth > 1) {
                    const segmentCenter = lastX + segmentWidth / 2;
                    this.walls.push(new Wall(new Vector2(segmentCenter, targetY), new Vector2(segmentWidth, WALL_THICKNESS)));
                }
                lastX = door.position.x + door.size.x / 2;
            }

            const finalSegmentWidth = (corridorX + corridorWidth) - lastX;
            if (finalSegmentWidth > 1) {
                const segmentCenter = lastX + finalSegmentWidth / 2;
                this.walls.push(new Wall(new Vector2(segmentCenter, targetY), new Vector2(finalSegmentWidth, WALL_THICKNESS)));
            }
        };

        const topInternalDoors = this.doors.filter(door => !door.isExternal && Math.abs(door.position.y - corridorTopY) < 0.1);
        createWallSegments(corridorTopY, topInternalDoors);

        const externalDoorList = this.externalDoor ? [this.externalDoor] : [];
        createWallSegments(corridorBottomY, externalDoorList);
    }

    _placeChestsInRooms() {
        this.rooms.forEach(room => {
            const attempts = 10; // Increased attempts to find a valid spot
            let placed = false;
            for (let i = 0; i < attempts; i++) {
                const chestPos = new Vector2(
                    room.rect.x + CHEST_BUFFER + Math.random() * (room.rect.width - CHEST_BUFFER * 2),
                    room.rect.y + CHEST_BUFFER + Math.random() * (room.rect.height - CHEST_BUFFER * 2)
                );

                // Check if position is inside a wall or closed door
                if (this.isPointInsideStructure(chestPos)) {
                    continue; // Skip if inside wall/door
                }

                // Check distance from doors in this room
                let tooCloseToDoor = false;
                for (const d of room.doors) {
                    // Use a slightly larger buffer for doors
                    if (chestPos.distance(d.position) < Math.max(d.size.x, d.size.y) + CHEST_BUFFER) {
                        tooCloseToDoor = true;
                        break;
                    }
                }
                if (tooCloseToDoor) continue;

                // Check distance from existing chests (shouldn't be necessary with 1 per room, but good practice)
                let tooCloseToChest = false;
                for (const c of this.chests) {
                     if (chestPos.distance(c.position) < c.size.x * 2) { // Use chest size
                        tooCloseToChest = true;
                        break;
                    }
                }
                if (tooCloseToChest) continue;


                // If all checks pass, place the chest
                const chest = new Chest(chestPos, [{ name: 'Plasma', quantity: 1 }]); // Placeholder content for now
                this.chests.push(chest);
                room.chests.push(chest); // Associate chest with the room
                placed = true;
                break; // Only place one chest per room
            }
            // Optional: Log if a chest couldn't be placed in a room after attempts
            // if (!placed) {
            //     console.log(`Could not place chest in room at ${room.rect.x}, ${room.rect.y}`);
            // }
        });
    }

    getObstacles() {
        const obstacles = [...this.walls];
        this.doors.forEach(door => {
            if (!door.isOpen) {
                obstacles.push(door);
            }
        });
        return obstacles;
    }

    containsPoint(point) {
        return (
            point.x >= this.position.x &&
            point.x <= this.position.x + this.size.x &&
            point.y >= this.position.y &&
            point.y <= this.position.y + this.size.y
        );
    }

    isPointInsideStructure(point) {
        for (const wall of this.walls) {
            const rect = wall.getRectData();
            if (point.x > rect.x - rect.width / 2 && point.x < rect.x + rect.width / 2 &&
                point.y > rect.y - rect.height / 2 && point.y < rect.y + rect.height / 2) {
                return true;
            }
        }
        for (const door of this.doors) {
            if (!door.isOpen) {
                const rect = door.getRectData();
                if (point.x > rect.x - rect.width / 2 && point.x < rect.x + rect.width / 2 &&
                    point.y > rect.y - rect.height / 2 && point.y < rect.y + rect.height / 2) {
                    return true;
                }
            }
        }
        return false;
    }

    getRoomAtPoint(point) {
        for (const room of this.rooms) {
            if (room.containsPoint(point)) {
                return room;
            }
        }
        return null;
    }

    getRandomPointInside(buffer = 30, structureBuffer = STRUCTURE_BUFFER) {
        let point;
        let attempts = 0;
        const maxAttempts = 50;
        let pointValid = false;
        let targetRoom = null;

        if (this.rooms.length > 0) {
             targetRoom = this.rooms[Math.floor(Math.random() * this.rooms.length)];
        } else {
            return new Vector2(this.position.x + this.size.x / 2, this.position.y + this.size.y / 2);
        }

        do {
             point = new Vector2(
                targetRoom.rect.x + buffer + Math.random() * (targetRoom.rect.width - buffer * 2),
                targetRoom.rect.y + buffer + Math.random() * (targetRoom.rect.height - buffer * 2)
            );
            attempts++;

            if (this.isPointInsideStructure(point)) continue;

            let tooCloseToChest = false;
            for (const chest of this.chests) {
                 if (point.distance(chest.position) < structureBuffer + chest.size.x) {
                    tooCloseToChest = true; break;
                }
            }
             if (tooCloseToChest) continue;

            let tooCloseToDoor = false;
            for (const door of this.doors) {
                if (point.distance(door.position) < structureBuffer + door.size.x) {
                    tooCloseToDoor = true; break;
                }
            }
            if (tooCloseToDoor) continue;

            pointValid = true;

        } while (!pointValid && attempts < maxAttempts);

        if (!pointValid) {
            return targetRoom.center.clone();
        }
        return point;
    }

    draw(ctx, camera, isPlayerInside) {
        if (isPlayerInside) {
            if (this.interiorRect) {
                ctx.fillStyle = this.interiorColor;
                ctx.fillRect(
                    this.interiorRect.x - camera.x,
                    this.interiorRect.y - camera.y,
                    this.interiorRect.width,
                    this.interiorRect.height
                );
            }
            this.walls.forEach(wall => wall.draw(ctx, camera));
            this.doors.forEach(door => door.draw(ctx, camera));
            this.chests.forEach(chest => chest.draw(ctx, camera));
        } else {
            ctx.fillStyle = this.exteriorColor;
            ctx.fillRect(
                this.position.x - camera.x,
                this.position.y - camera.y,
                this.size.x,
                this.size.y
            );

            if (this.externalDoor) {
                 ctx.fillStyle = this.externalDoor.isOpen ? '#e2c49c' : '#b0623d';
                 ctx.fillRect(
                    this.externalDoor.position.x - this.externalDoor.size.x / 2 - camera.x,
                    this.externalDoor.position.y - this.externalDoor.size.y / 2 - camera.y,
                    this.externalDoor.size.x,
                    this.externalDoor.size.y
                 );
                 ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
                 ctx.lineWidth = 2;
                 ctx.strokeRect(
                     this.externalDoor.position.x - this.externalDoor.size.x / 2 - camera.x,
                     this.externalDoor.position.y - this.externalDoor.size.y / 2 - camera.y,
                     this.externalDoor.size.x,
                     this.externalDoor.size.y
                 );
            }
        }
    }

    interactWith(point, player) {
         for (const door of this.doors) {
             const dist = point.distance(door.position);
             if (dist < Math.max(door.size.x, door.size.y) * 1.5) {
                 door.interact();
                 return { type: 'door' };
             }
         }

         // Check for chest interaction
         for (const chest of this.chests) {
             const dist = point.distance(chest.position);
             // Use chest size for interaction radius, maybe slightly larger
             if (dist < chest.size.x * 1.5) {
                 const result = chest.interact(player); // Pass player if needed by interact logic
                 if (result) { // Check if interaction did something (e.g., spawned item)
                     return { type: 'chest', itemSpawned: result.itemSpawned };
                 }
                 return { type: 'chest', itemSpawned: null }; // Indicate interaction even if no item spawned (e.g., already open)
             }
         }

         return null;
    }
}
