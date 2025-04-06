import { Vector2 } from '../utils.js';
import { Wall } from './Wall.js';
import { Stairs } from './Stairs.js';
import { Door } from './Door.js';
import { Room } from './Room.js';
import { Container, MedKit, Generator } from '../entities.js';

const BARRACKS_EXTERIOR_COLOR = '#6a5acd';
const BARRACKS_INTERIOR_COLOR = 'rgba(70, 70, 70, 0.8)';
const WALL_THICKNESS = 15;
const INTERNAL_DOOR_WIDTH = 50;
const EXTERNAL_DOOR_WIDTH = 70;
const MIN_ROOM_SIZE = 150;
const INTERACTABLE_PLACEMENT_CHANCE = 0.7;
const MAX_INTERACTABLES_PER_ROOM = 2;
const INTERACTABLE_BUFFER = 40;
const STRUCTURE_BUFFER = 20;

export class Building {
    constructor(position, size, numFloors = 2) {
        this.position = position;
        this.size = size;
        this.type = 'barracks';
        this.numFloors = numFloors;
        this.floors = [];

        this.exteriorColor = BARRACKS_EXTERIOR_COLOR;
        this.interiorColor = BARRACKS_INTERIOR_COLOR;

        this._generateMultiFloorLayout();
    }

    _generateMultiFloorLayout() {
        this.floors = [];
        for (let f = 0; f < this.numFloors; f++) {
            this.floors.push({
                walls: [],
                doors: [],
                rooms: [],
                stairs: [],
                interactables: [],
                externalDoor: null,
                interiorRect: null
            });
            this._generateFloorLayout(f);
        }
        this._connectFloorsWithStairs();
    }

    _generateFloorLayout(floorIndex) {
        const floor = this.floors[floorIndex];
        floor.walls = [];
        floor.doors = [];
        floor.rooms = [];
        floor.interactables = [];
        floor.externalDoor = null;

        const interiorX = this.position.x + WALL_THICKNESS;
        const interiorY = this.position.y + WALL_THICKNESS;
        const interiorWidth = this.size.x - 2 * WALL_THICKNESS;
        const interiorHeight = this.size.y - 2 * WALL_THICKNESS;
        floor.interiorRect = { x: interiorX, y: interiorY, width: interiorWidth, height: interiorHeight };

        this._createOuterWalls(floorIndex);
        if (floorIndex === 0) {
            this._createExternalDoor(floorIndex);
        }

        const fixedCorridorHeight = 80;
        const corridorWidth = interiorWidth;
        const corridorX = interiorX;
        const corridorBottomEdgeY = this.position.y + this.size.y - WALL_THICKNESS;
        const corridorY = corridorBottomEdgeY - fixedCorridorHeight;

        const roomAreaTop = { x: interiorX, y: interiorY, width: interiorWidth, height: Math.max(0, corridorY - interiorY) };
        const roomAreaBottom = { x: interiorX, y: corridorBottomEdgeY, width: interiorWidth, height: 0 };

        this._placeRoomsInArea(floorIndex, roomAreaTop, corridorY, corridorBottomEdgeY, corridorWidth);

        this._createCorridorWalls(floorIndex, corridorX, corridorY, corridorBottomEdgeY, corridorWidth);
        this._placeInteractablesInRooms(floorIndex);
    }

    _createOuterWalls(floorIndex) {
        const floor = this.floors[floorIndex];
        const halfW = this.size.x / 2;
        const halfH = this.size.y / 2;
        const centerX = this.position.x + halfW;
        const centerY = this.position.y + halfH;

        floor.walls.push(new Wall(new Vector2(centerX, this.position.y + WALL_THICKNESS / 2), new Vector2(this.size.x, WALL_THICKNESS)));
        floor.walls.push(new Wall(new Vector2(this.position.x + WALL_THICKNESS / 2, centerY), new Vector2(WALL_THICKNESS, this.size.y)));
        floor.walls.push(new Wall(new Vector2(this.position.x + this.size.x - WALL_THICKNESS / 2, centerY), new Vector2(WALL_THICKNESS, this.size.y)));
        floor.walls.push(new Wall(new Vector2(centerX, this.position.y + this.size.y - WALL_THICKNESS / 2), new Vector2(this.size.x, WALL_THICKNESS)));
    }

    _createExternalDoor(floorIndex) {
        if (floorIndex !== 0) return;

        const floor = this.floors[floorIndex];
        const halfW = this.size.x / 2;
        const centerX = this.position.x + halfW;
        const doorHeight = WALL_THICKNESS;

        const bottomWallIndex = floor.walls.findIndex(w => Math.abs(w.position.y - (this.position.y + this.size.y - WALL_THICKNESS / 2)) < 1);
        if (bottomWallIndex === -1) {
            console.error("Could not find bottom wall to place external door.");
            return;
        }
        floor.walls.splice(bottomWallIndex, 1);

        const bottomWallSegmentWidth = (this.size.x - EXTERNAL_DOOR_WIDTH) / 2;
        const externalDoorPosY = this.position.y + this.size.y - WALL_THICKNESS / 2;
        const externalDoorPos = new Vector2(centerX, externalDoorPosY);
        const externalDoorSize = new Vector2(EXTERNAL_DOOR_WIDTH, doorHeight);

        floor.externalDoor = new Door(externalDoorPos, externalDoorSize, true);
        floor.doors.push(floor.externalDoor);

        if (bottomWallSegmentWidth > 0) {
            floor.walls.push(new Wall(new Vector2(this.position.x + bottomWallSegmentWidth / 2, externalDoorPosY), new Vector2(bottomWallSegmentWidth, WALL_THICKNESS)));
            floor.walls.push(new Wall(new Vector2(this.position.x + this.size.x - bottomWallSegmentWidth / 2, externalDoorPosY), new Vector2(bottomWallSegmentWidth, WALL_THICKNESS)));
        }
    }

    _placeRoomsInArea(floorIndex, area, corridorTopY, corridorBottomY, corridorWidth) {
        const floor = this.floors[floorIndex];
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
            floor.rooms.push(room);

            const nextRoomStartX = currentX + actualRoomWidth + WALL_THICKNESS;
            if (nextRoomStartX < area.x + area.width - MIN_ROOM_SIZE / 2) {
                const wallX = currentX + actualRoomWidth + WALL_THICKNESS / 2;
                const wallStartY = area.y;
                const wallEndY = area.y + roomHeight;
                const wallHeight = wallEndY - wallStartY;
                const wallCenterY = wallStartY + wallHeight / 2;

                if (wallHeight > 0) {
                    floor.walls.push(new Wall(new Vector2(wallX, wallCenterY), new Vector2(WALL_THICKNESS, wallHeight)));
                }
            }

            const doorPosX = currentX + actualRoomWidth / 2;
            const doorPosY = (area.y < corridorTopY) ? corridorTopY : corridorBottomY;
            const doorSize = new Vector2(INTERNAL_DOOR_WIDTH, doorHeight);
            const door = new Door(new Vector2(doorPosX, doorPosY), doorSize, false);
            floor.doors.push(door);
            room.doors.push(door);

            currentX += actualRoomWidth + WALL_THICKNESS;
        }
    }

    _createCorridorWalls(floorIndex, corridorX, corridorTopY, corridorBottomY, corridorWidth) {
        const floor = this.floors[floorIndex];

        const createWallSegments = (targetY, relevantDoors) => {
            relevantDoors.sort((a, b) => a.position.x - b.position.x);
            let lastX = corridorX;

            for (const door of relevantDoors) {
                const doorLeftEdge = door.position.x - door.size.x / 2;
                const segmentWidth = doorLeftEdge - lastX;
                if (segmentWidth > 1) {
                    const segmentCenter = lastX + segmentWidth / 2;
                    floor.walls.push(new Wall(new Vector2(segmentCenter, targetY), new Vector2(segmentWidth, WALL_THICKNESS)));
                }
                lastX = door.position.x + door.size.x / 2;
            }; // Semicolon added here

            const finalSegmentWidth = (corridorX + corridorWidth) - lastX;
            if (finalSegmentWidth > 1) {
                const segmentCenter = lastX + finalSegmentWidth / 2;
                floor.walls.push(new Wall(new Vector2(segmentCenter, targetY), new Vector2(finalSegmentWidth, WALL_THICKNESS)));
            }
        };

        const topInternalDoors = floor.doors.filter(door => !door.isExternal && Math.abs(door.position.y - corridorTopY) < 1);
        createWallSegments(corridorTopY, topInternalDoors);

        const bottomDoors = floor.externalDoor ? [floor.externalDoor] : [];
        createWallSegments(corridorBottomY, bottomDoors);
    }

    _isStairPositionValid(position, floorIndex, stairSize) {
        if (floorIndex < 0 || floorIndex >= this.floors.length) return false;
        const floor = this.floors[floorIndex];
        const stairRect = {
            x: position.x - stairSize.x / 2,
            y: position.y - stairSize.y / 2,
            width: stairSize.x,
            height: stairSize.y
        };

        for (const door of floor.doors) {
            const doorRect = {
                x: door.position.x - door.size.x / 2,
                y: door.position.y - door.size.y / 2,
                width: door.size.x,
                height: door.size.y
            };
            if (stairRect.x < doorRect.x + doorRect.width &&
                stairRect.x + stairRect.width > doorRect.x &&
                stairRect.y < doorRect.y + doorRect.height &&
                stairRect.y + stairRect.height > doorRect.y) {
                return false;
            }
        }

        for (const stair of floor.stairs) {
            const existingStairRect = {
                x: stair.position.x - stair.size.x / 2,
                y: stair.position.y - stair.size.y / 2,
                width: stair.size.x,
                height: stair.size.y
            };
             if (stairRect.x < existingStairRect.x + existingStairRect.width &&
                 stairRect.x + stairRect.width > existingStairRect.x &&
                 stairRect.y < existingStairRect.y + existingStairRect.height &&
                 stairRect.y + stairRect.height > existingStairRect.y) {
                 return false;
             }
        }

        return true;
    }


    _connectFloorsWithStairs() {
        const stairWidth = 60;
        const stairHeight = 80;
        const stairSize = new Vector2(stairWidth, stairHeight);
        const roomBuffer = 20;
        const maxPlacementAttemptsPerRoomPair = 5;

        for (let f = 0; f < this.numFloors - 1; f++) {
            const floor = this.floors[f];
            const nextFloor = this.floors[f + 1];
            let stairsPlaced = false;

            for (const roomF of floor.rooms) {
                if (stairsPlaced) break;

                for (const roomF1 of nextFloor.rooms) {
                    const overlapX = Math.max(0, Math.min(roomF.rect.x + roomF.rect.width, roomF1.rect.x + roomF1.rect.width) - Math.max(roomF.rect.x, roomF1.rect.x));
                    if (overlapX < stairWidth * 1.5) continue;

                    let attemptPosUp = null;
                    let attemptPosDown = null;
                    let pairPlacementFound = false;

                    for (let attempt = 0; attempt < maxPlacementAttemptsPerRoomPair; attempt++) {
                        const commonX = Math.max(roomF.rect.x, roomF1.rect.x) + overlapX / 2;
                        const randomOffsetX = (Math.random() - 0.5) * (overlapX - stairWidth - roomBuffer * 2);
                        const targetX = commonX + randomOffsetX;

                        const targetYup = roomF.rect.y + roomBuffer + stairHeight / 2 + Math.random() * (roomF.rect.height - stairHeight - roomBuffer * 2);
                        const targetYdown = roomF1.rect.y + roomBuffer + stairHeight / 2 + Math.random() * (roomF1.rect.height - stairHeight - roomBuffer * 2);

                        attemptPosUp = new Vector2(targetX, targetYup);
                        attemptPosDown = new Vector2(targetX, targetYdown);

                        const upPosValid = this._isStairPositionValid(attemptPosUp, f, stairSize) && roomF.containsPoint(attemptPosUp);
                        const downPosValid = this._isStairPositionValid(attemptPosDown, f + 1, stairSize) && roomF1.containsPoint(attemptPosDown);

                        if (upPosValid && downPosValid) {
                            pairPlacementFound = true;
                            break;
                        }
                    }

                    if (pairPlacementFound) {
                        const stairsUp = new Stairs(attemptPosUp, stairSize, f + 1, attemptPosDown.clone());
                        floor.stairs.push(stairsUp);

                        const stairsDown = new Stairs(attemptPosDown, stairSize, f, attemptPosUp.clone());
                        nextFloor.stairs.push(stairsDown);

                        console.log(`Placed stairs between floor ${f} (room at ${roomF.rect.x},${roomF.rect.y}) and ${f + 1} (room at ${roomF1.rect.x},${roomF1.rect.y})`);
                        stairsPlaced = true;
                        break;
                    }
                }
            }

            if (!stairsPlaced) {
                console.warn(`Could not find suitable room pair to place stairs between floor ${f} and ${f + 1}.`);
            }
        }
    }


    _placeInteractablesInRooms(floorIndex) {
        const floor = this.floors[floorIndex];
        floor.rooms.forEach(room => {
            let interactablesPlacedInRoom = 0;
            const maxToPlace = Math.floor(Math.random() * (MAX_INTERACTABLES_PER_ROOM + 1));

            for (let p = 0; p < maxToPlace; p++) {
                if (Math.random() < INTERACTABLE_PLACEMENT_CHANCE) {
                    const attempts = 10;
                    let placed = false;
                    for (let i = 0; i < attempts; i++) {
                        const interactablePos = new Vector2(
                            room.rect.x + INTERACTABLE_BUFFER + Math.random() * (room.rect.width - INTERACTABLE_BUFFER * 2),
                            room.rect.y + INTERACTABLE_BUFFER + Math.random() * (room.rect.height - INTERACTABLE_BUFFER * 2)
                        );

                        if (this.isPointInsideStructure(interactablePos, floorIndex, true)) {
                            continue;
                        }

                        let tooCloseToDoor = false;
                        for (const d of room.doors) {
                            if (interactablePos.distance(d.position) < Math.max(d.size.x, d.size.y) + INTERACTABLE_BUFFER) {
                                tooCloseToDoor = true;
                                break;
                            }
                        }
                        if (tooCloseToDoor) continue;

                        let tooCloseToStairs = false;
                        for (const s of floor.stairs) {
                            if (interactablePos.distance(s.position) < Math.max(s.size.x, s.size.y) + INTERACTABLE_BUFFER) {
                                tooCloseToStairs = true;
                                break;
                            }
                        }
                        if (tooCloseToStairs) continue;

                        let tooCloseToOtherInteractable = false;
                        for (const existing of floor.interactables) {
                            if (interactablePos.distance(existing.position) < existing.size.x * 1.5 + INTERACTABLE_BUFFER) {
                                tooCloseToOtherInteractable = true;
                                break;
                            }
                        }
                        if (tooCloseToOtherInteractable) continue;

                        let newInteractable = null;
                        const randType = Math.random();
                        if (randType < 0.5) {
                            newInteractable = new Container(interactablePos);
                        } else if (randType < 0.8) {
                            newInteractable = new MedKit(interactablePos);
                        } else {
                            newInteractable = new Generator(interactablePos);
                        }

                        if (newInteractable) {
                            floor.interactables.push(newInteractable);
                            room.interactables.push(newInteractable);
                            interactablesPlacedInRoom++;
                            placed = true;
                            break;
                        }
                    }
                    if (interactablesPlacedInRoom >= MAX_INTERACTABLES_PER_ROOM) {
                         break;
                    }
                }
            }
        });
    }

    getObstacles(floorIndex) {
        if (floorIndex < 0 || floorIndex >= this.floors.length) {
            return [];
        }
        const floor = this.floors[floorIndex];
        const obstacles = [...floor.walls];
        floor.doors.forEach(door => {
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

    isPointInsideStructure(point, floorIndex, checkOnlySolid = false) {
        if (floorIndex < 0 || floorIndex >= this.floors.length) {
            return false;
        }
        const floor = this.floors[floorIndex];

        for (const wall of floor.walls) {
            const rect = wall.getRectData();
            if (point.x > rect.x - rect.width / 2 && point.x < rect.x + rect.width / 2 &&
                point.y > rect.y - rect.height / 2 && point.y < rect.y + rect.height / 2) {
                return true;
            }
        }

        for (const door of floor.doors) {
            if (!door.isOpen) {
                const rect = door.getRectData();
                if (point.x > rect.x - rect.width / 2 && point.x < rect.x + rect.width / 2 &&
                    point.y > rect.y - rect.height / 2 && point.y < rect.y + rect.height / 2) {
                    return true;
                }
            }
        }

        if (!checkOnlySolid) {
            for (const stair of floor.stairs) {
                 const rect = stair.getRectData();
                 if (point.x > rect.x - rect.width / 2 && point.x < rect.x + rect.width / 2 &&
                     point.y > rect.y - rect.height / 2 && point.y < rect.y + rect.height / 2) {
                     return true;
                 }
            }
        }


        return false;
    }

    getRoomAtPoint(point, floorIndex) {
        if (floorIndex < 0 || floorIndex >= this.floors.length) {
            return null;
        }
        const floor = this.floors[floorIndex];
        for (const room of floor.rooms) {
            if (room.containsPoint(point)) {
                return room;
            }
        }
        return null;
    }

    getRandomPointInside(floorIndex, buffer = 30, structureBuffer = STRUCTURE_BUFFER) {
        if (floorIndex < 0 || floorIndex >= this.floors.length) {
            return new Vector2(this.position.x + this.size.x / 2, this.position.y + this.size.y / 2);
        }

        const floor = this.floors[floorIndex];
        let point;
        let attempts = 0;
        const maxAttempts = 50;
        let pointValid = false;
        let targetRoom = null;

        if (floor.rooms.length > 0) {
             targetRoom = floor.rooms[Math.floor(Math.random() * floor.rooms.length)];
        } else {
            if (floor.interiorRect) {
                return new Vector2(floor.interiorRect.x + floor.interiorRect.width / 2, floor.interiorRect.y + floor.interiorRect.height / 2);
            } else {
                return new Vector2(this.position.x + this.size.x / 2, this.position.y + this.size.y / 2);
            }
        }

        do {
             point = new Vector2(
                targetRoom.rect.x + buffer + Math.random() * (targetRoom.rect.width - buffer * 2),
                targetRoom.rect.y + buffer + Math.random() * (targetRoom.rect.height - buffer * 2)
            );
            attempts++;

            if (this.isPointInsideStructure(point, floorIndex, true)) continue;

            let tooCloseToInteractable = false;
            for (const interactable of floor.interactables) {
                 if (point.distance(interactable.position) < structureBuffer + interactable.size.x) {
                    tooCloseToInteractable = true;
                    break;
                }
            }
             if (tooCloseToInteractable) continue;

            let tooCloseToDoor = false;
            for (const door of floor.doors) {
                if (point.distance(door.position) < structureBuffer + door.size.x) {
                    tooCloseToDoor = true; break;
                }
            }
            if (tooCloseToDoor) continue;

             let tooCloseToStairs = false;
             for (const stair of floor.stairs) {
                 if (point.distance(stair.position) < structureBuffer + stair.size.x) {
                     tooCloseToStairs = true; break;
                 }
             }
             if (tooCloseToStairs) continue;


            pointValid = true;

        } while (!pointValid && attempts < maxAttempts);

        if (!pointValid) {
            return targetRoom.center.clone();
        }
        return point;
    }

    draw(ctx, camera, playerFloor, isPlayerInside) {
        if (playerFloor < 0 || playerFloor >= this.floors.length) {
             isPlayerInside = false;
             playerFloor = 0;
        }

        const floor = this.floors[playerFloor];

        if (isPlayerInside) {
            if (floor.interiorRect) {
                ctx.fillStyle = this.interiorColor;
                ctx.fillRect(
                    floor.interiorRect.x - camera.x,
                    floor.interiorRect.y - camera.y,
                    floor.interiorRect.width,
                    floor.interiorRect.height
                );
            }
            floor.walls.forEach(wall => wall.draw(ctx, camera));
            floor.doors.forEach(door => door.draw(ctx, camera));
            floor.stairs.forEach(stair => stair.draw(ctx, camera));
            floor.interactables.forEach(interactable => interactable.draw(ctx, camera));
        } else {
            ctx.fillStyle = this.exteriorColor;
            ctx.fillRect(
                this.position.x - camera.x,
                this.position.y - camera.y,
                this.size.x,
                this.size.y
            );

            const groundFloor = this.floors[0];
            if (groundFloor && groundFloor.externalDoor) {
                 const door = groundFloor.externalDoor;
                 ctx.fillStyle = door.isOpen ? '#e2c49c' : '#b0623d';
                 ctx.fillRect(
                    door.position.x - door.size.x / 2 - camera.x,
                    door.position.y - door.size.y / 2 - camera.y,
                    door.size.x,
                    door.size.y
                 );
                 ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
                 ctx.lineWidth = 2;
                 ctx.strokeRect(
                     door.position.x - door.size.x / 2 - camera.x,
                     door.position.y - door.size.y / 2 - camera.y,
                     door.size.x,
                     door.size.y
                 );
            }
        }
    }

    interactWith(point, playerFloor, player) {
         if (playerFloor < 0 || playerFloor >= this.floors.length) {
             return null;
         }
         const floor = this.floors[playerFloor];

         for (const door of floor.doors) {
             const dist = point.distance(door.position);
             if (dist < Math.max(door.size.x, door.size.y) * 1.5) {
                 return door.interact();
             }
         }

         for (const stair of floor.stairs) {
             const dist = point.distance(stair.position);
             if (dist < Math.max(stair.size.x, stair.size.y) * 1.2) {
                 return stair.interact();
             }
         }

         for (const interactable of floor.interactables) {
             const dist = point.distance(interactable.position);
             const interactionRadius = Math.max(interactable.size.x, interactable.size.y) * 1.2;
             if (interactable.isInteractable && dist < interactionRadius) {
                 const result = interactable.interact(player);
                 return result;
             }
         }

         return null;
    }

    getAllDoors() {
        let allDoors = [];
        this.floors.forEach(floor => {
            allDoors = allDoors.concat(floor.doors);
        });
        return allDoors;
    }

     getAllStairs() {
         let allStairs = [];
         this.floors.forEach(floor => {
             allStairs = allStairs.concat(floor.stairs);
         });
        return allStairs;
     }

    getExteriorObstacles() {
        const exteriorObstacles = [];
        const groundFloor = this.floors[0];

        if (!groundFloor) return [];

        const buildingMinX = this.position.x;
        const buildingMaxX = this.position.x + this.size.x;
        const buildingMinY = this.position.y;
        const buildingMaxY = this.position.y + this.size.y;
        const tolerance = WALL_THICKNESS / 2 + 1;

        groundFloor.walls.forEach(wall => {
            const wallRect = wall.getRectData();
            const wallMinX = wallRect.x - wallRect.width / 2;
            const wallMaxX = wallRect.x + wallRect.width / 2;
            const wallMinY = wallRect.y - wallRect.height / 2;
            const wallMaxY = wallRect.y + wallRect.height / 2;

            const isOuterEdgeWall = (
                (Math.abs(wallMinY - buildingMinY) < tolerance && wallRect.height <= WALL_THICKNESS * 1.1) ||
                (Math.abs(wallMaxY - buildingMaxY) < tolerance && wallRect.height <= WALL_THICKNESS * 1.1) ||
                (Math.abs(wallMinX - buildingMinX) < tolerance && wallRect.width <= WALL_THICKNESS * 1.1) ||
                (Math.abs(wallMaxX - buildingMaxX) < tolerance && wallRect.width <= WALL_THICKNESS * 1.1)
            );

            if (isOuterEdgeWall) {
                exteriorObstacles.push(wall);
            }
        });

        if (groundFloor.externalDoor && !groundFloor.externalDoor.isOpen) {
            if (!exteriorObstacles.includes(groundFloor.externalDoor)) {
                 exteriorObstacles.push(groundFloor.externalDoor);
            }
        }

        return exteriorObstacles;
    }
}
