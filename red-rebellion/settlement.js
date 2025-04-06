import { Vector2 } from './utils.js';
import { Human, HeavyHuman, Chest } from './entities.js'; // Removed Obstacle import, Added Chest
import { Building, Wall, Door } from './structures.js'; // Import new structure classes

// Dependencies needed from main game scope:
// - spawnSettlement (Function)
// - plasmaScore (Number, needs to be updated) -> Better to return reward and update in main scope
// - plasmaScoreDisplay (DOM Element) -> Update in main scope
// - worldWidth, worldHeight (Numbers)
// - existingBuildings (Array of Building objects from game state)

export class Settlement {
    constructor(position, radius, numHumans, worldWidth, worldHeight, spawnSettlementCallback, updateScoreCallback, existingBuildings = []) {
        // Removed type parameter, all settlements are functionally similar now
        this.position = position; // Center of the settlement area
        this.radius = radius; // Overall area radius (less relevant with one building?)
        this.humans = [];
        this.buildings = []; // Array to hold Building instances (will contain only one)
        this.chests = []; // Array to hold Chest instances
        this.cleared = false;
        this.alarmState = 'calm'; // 'calm', 'suspicious', 'alerted'
        this.plasmaReward = numHumans * 50; // Increased reward for larger building
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;
        this.spawnSettlementCallback = spawnSettlementCallback; // Function to call when cleared
        this.updateScoreCallback = updateScoreCallback; // Function to update score

        // --- Create One Large Building ---
        const buildingSize = new Vector2(600, 450); // Significantly larger size
        let buildingPos = this.position.subtract(new Vector2(buildingSize.x / 2, buildingSize.y / 2));

        // Basic Overlap Prevention (more robust needed if multiple settlements/buildings exist)
        let placementValid = false;
        let attempts = 0;
        const maxPlacementAttempts = 10;
        while (!placementValid && attempts < maxPlacementAttempts) {
            placementValid = true;
            // Check against existing buildings passed from game state
            for (const existing of existingBuildings) {
                 // Simple AABB collision check
                 if (buildingPos.x < existing.position.x + existing.size.x &&
                     buildingPos.x + buildingSize.x > existing.position.x &&
                     buildingPos.y < existing.position.y + existing.size.y &&
                     buildingPos.y + buildingSize.y > existing.position.y) {
                    placementValid = false;
                    // Try shifting position slightly if overlap detected
                    buildingPos = buildingPos.add(new Vector2(Math.random() * 100 - 50, Math.random() * 100 - 50));
                    // Clamp position to stay within world bounds (simple clamp)
                    buildingPos.x = Math.max(50, Math.min(this.worldWidth - buildingSize.x - 50, buildingPos.x));
                    buildingPos.y = Math.max(50, Math.min(this.worldHeight - buildingSize.y - 50, buildingPos.y));
                    console.warn(`Building overlap detected, attempting new position: ${buildingPos.x}, ${buildingPos.y}`);
                    break; // Re-check against all existing buildings with new position
                 }
            }
            attempts++;
        }

        if (!placementValid) {
             console.error("Could not place building without overlap after multiple attempts. Skipping building creation.");
             // Handle error state - maybe don't create settlement?
             this.cleared = true; // Mark as cleared immediately if no building?
             return;
        }


        // Create the single building (removed type argument)
        const mainBuilding = new Building(buildingPos, buildingSize);
        this.buildings.push(mainBuilding);
        console.log(`Created single large building at ${buildingPos.x}, ${buildingPos.y}`);
        // --- End Building Creation ---

        // --- Spawn Humans Inside The Building ---
        // All humans spawn in the single building
        const building = this.buildings[0]; // Get the single building
        for (let i = 0; i < numHumans; i++) {
            // Pass the specific building to generate paths/points inside it
            const patrolPath = this.generatePatrolPathInside(building, 3); // Generate path within the building
            let newHuman;

                if (patrolPath.length > 0) {
                    const HumanClass = Math.random() < 0.20 ? HeavyHuman : Human;
                    // Log the building object right before instantiation
                    console.log(`Settlement Constructor: Instantiating ${HumanClass.name} with building:`, building);
                     if (typeof building === 'undefined') {
                          console.error(`!!! Building is undefined right before creating ${HumanClass.name} !!!`);
                     }
                    // Pass the building reference to the Human constructor
                    newHuman = new HumanClass(patrolPath, this, building, this.worldWidth, this.worldHeight);

                    if (newHuman.patrolPath.length > 0) {
                        // Path calculation now needs the combined obstacles from the settlement
                        newHuman.calculatePath(newHuman.patrolPath[newHuman.currentPatrolIndex], this.getActiveObstacles());
                    }
                    this.humans.push(newHuman);
                } else {
                    console.warn("Could not generate valid patrol path inside building for human.");
                    // Get fallback point within the specific building
                    const fallbackPoint = building.getRandomPointInside();
                    const fallbackPath = [fallbackPoint];
                    const HumanClass = Math.random() < 0.20 ? HeavyHuman : Human;
                     // Log the building object right before fallback instantiation
                     console.log(`Settlement Constructor: Instantiating FALLBACK ${HumanClass.name} with building:`, building);
                      if (typeof building === 'undefined') {
                           console.error(`!!! Building is undefined right before creating FALLBACK ${HumanClass.name} !!!`);
                      }
                     // Pass the building reference to the Human constructor
                    newHuman = new HumanClass(fallbackPath, this, building, this.worldWidth, this.worldHeight);

                    if (newHuman.patrolPath.length > 0) {
                         newHuman.calculatePath(newHuman.patrolPath[newHuman.currentPatrolIndex], this.getActiveObstacles());
                    }
                    this.humans.push(newHuman);
                }
            }
        // Ensure we don't exceed numHumans if division wasn't exact
        while (this.humans.length > numHumans) {
            this.humans.pop();
        }

        // --- Spawn Chests Inside The Building ---
        const numChests = 1 + Math.floor(Math.random() * 3); // 1 to 3 chests
        for (let i = 0; i < numChests; i++) {
            let chestPos;
            let attempts = 0;
            const maxChestAttempts = 20;
            do {
                chestPos = building.getRandomPointInside(true); // Get point, avoid walls/doors
                attempts++;
                // Optional: Add check to ensure chest doesn't overlap existing chests
            } while (!chestPos && attempts < maxChestAttempts);

            if (chestPos) {
                // TODO: Add actual items to chests later
                const newChest = new Chest(chestPos, [{ name: 'Placeholder', quantity: 1 }]);
                this.chests.push(newChest);
                console.log(`Placed chest ${i + 1} at ${chestPos.x.toFixed(0)}, ${chestPos.y.toFixed(0)}`);
            } else {
                console.warn(`Could not place chest ${i + 1} inside building.`);
            }
        }
        // --- End Chest Spawning ---

    }; // End of constructor

    // Generates a patrol path within the bounds of a specific building
    generatePatrolPathInside(building, numPoints = 3) {
        const path = [];
        const maxAttemptsPerPoint = 15;

        for (let i = 0; i < numPoints; i++) {
            let point;
            let attempts = 0;
            do {
                // Use building's method to get a random point inside it
                point = building.getRandomPointInside();
                attempts++;
            } while (attempts < maxAttemptsPerPoint && !point); // getRandomPointInside handles obstacle checks

            if (point) {
                path.push(point);
            } else {
                console.warn(`Failed to find valid point ${i + 1} for internal patrol path in building.`);
                // Return partial path if points were found, otherwise empty
                return path;
            }
        }
        return path;
    };

    // No longer needed, building class has its own method
    // getRandomPointInBuilding(...) { ... };

    // Get all walls and closed doors from all buildings in the settlement
    getActiveObstacles() {
        let allObstacles = [];
        this.buildings.forEach(building => {
            allObstacles = allObstacles.concat(building.getObstacles()); // Assumes Building.getObstacles() returns walls + closed doors
        });
        return allObstacles;
    }

    // Check if a point is inside any building structure (wall or closed door)
    isPointInObstacle(point) {
        for (const building of this.buildings) {
            if (building.isPointInsideStructure(point)) {
                return true;
            }
        }
        return false;
    };

    // Check if player is inside the bounds of *any* building
    checkPlayerInside(player) { // Accept player as argument
        for (const building of this.buildings) {
            if (building.containsPoint(player.position)) { // Use passed player object
                return building; // Return the building the player is in
            }
        }
        return null; // Player is not inside any building
    }


    update(deltaTime, player, isLineOfSightClearFunc, projectiles) {
        // if (this.cleared) return; // Removed check

        const currentObstacles = this.getActiveObstacles(); // Get current obstacles (walls + closed doors)

        // Determine which building the player is currently inside (if any)
        const playerBuilding = this.checkPlayerInside(player); // Pass player to checkPlayerInside

        for (let i = this.humans.length - 1; i >= 0; i--) {
            // Pass the current obstacles to the human update function
            this.humans[i].update(deltaTime, player, isLineOfSightClearFunc, projectiles, currentObstacles);
        }
    };

    draw(ctx, camera, player) { // Pass player to check position
        // if (this.cleared) return; // Removed check

        // Determine which building the player is currently inside (if any)
        const playerBuilding = this.checkPlayerInside(player); // Pass player to checkPlayerInside

        // Draw Buildings
        this.buildings.forEach(building => {
            const isPlayerInsideThisBuilding = (building === playerBuilding);
            building.draw(ctx, camera, isPlayerInsideThisBuilding);
        });

        // Draw Humans (Consider drawing only if player is nearby or inside their building?)
        this.humans.forEach(human => {
             // Simple logic: Draw if player is inside the same building as the human
             if (playerBuilding && human.building === playerBuilding) {
                 human.draw(ctx, camera);
             } else if (!playerBuilding && this.position.distance(player.position) < this.radius + 50) {
                 // Or draw if player is outside but near the settlement (optional)
                 // human.draw(ctx, camera);
             }
        });

        // Draw Chests (Draw if player is inside the building)
        if (playerBuilding) {
            this.chests.forEach(chest => {
                // Check if chest is within the building the player is in
                // (Assuming chests are only placed inside the single building for now)
                chest.draw(ctx, camera);
            });
        }
        // Optionally draw chests if player is nearby but outside?
        // else if (this.position.distance(player.position) < this.radius + 50) { ... }

    };

    notifyHumanDeath(deadHuman, killer, killContext) {
        const killPosition = deadHuman.position;
        const buildingOfVictim = deadHuman.building; // Get the building the human was in
        const index = this.humans.indexOf(deadHuman);
        if (index !== -1) {
            this.humans.splice(index, 1);
        }

        // Alert other humans, potentially prioritizing those in the same building
        if (killer && killer.isPlayer) {
            const isSilentKill = (killContext === 'knife');
            this.humans.forEach(livingHuman => {
                const distanceToKill = livingHuman.position.distance(killPosition);
                const isInSameBuilding = livingHuman.building === buildingOfVictim;

                let alertRange = isSilentKill ? (isInSameBuilding ? 150 : 50) : (isInSameBuilding ? 400 : 200);
                let alertLevel = isSilentKill ? 1 : 2;
                let isGunshotAlert = !isSilentKill;

                if (distanceToKill < alertRange) {
                    livingHuman.alert(killPosition, alertLevel, isGunshotAlert);
                }
            });
        }

        if (this.humans.length === 0 && !this.cleared) {
            this.clearSettlement();
        }
    };


    clearSettlement() {
        // this.cleared = true; // Keep settlement active
        this.updateScoreCallback(this.plasmaReward);
        this.spawnSettlementCallback(); // Still spawn the next one? Assumed yes for now.
    };

    alertSettlement(alertSourcePosition, isGunshot = false) {
        console.log(`Settlement at ${this.position.x.toFixed(0)},${this.position.y.toFixed(0)} alerted!`);
        this.alarmState = 'alerted';
        // Alert humans based on proximity and whether it was a gunshot
        this.humans.forEach(human => {
            const distance = human.position.distance(alertSourcePosition);
            const alertRange = isGunshot ? 500 : 250; // Larger range for gunshots
            if (distance < alertRange) {
                const alertLevel = isGunshot ? 2 : 1;
                human.alert(alertSourcePosition, alertLevel, isGunshot);
            }
        });
    };

    notifyAlliesOfAlert(sourceHuman, alertLevel = 2) {
        const notificationRadius = 250; // How far the alert spreads
        const sourceHumanPosition = sourceHuman.position;
        const sourceBuilding = sourceHuman.building;

        this.humans.forEach(otherHuman => {
            // Don't alert self, or if already alerted at this level or higher
            if (otherHuman === sourceHuman || otherHuman.alertLevel >= alertLevel) return;

            const distance = otherHuman.position.distance(sourceHumanPosition);
            const isInSameBuilding = otherHuman.building === sourceBuilding;

            // Alert if close enough, potentially prioritize same building
            if (distance < notificationRadius) {
                 // Maybe make alert level slightly lower if not in the same building?
                 const effectiveAlertLevel = isInSameBuilding ? alertLevel : Math.max(1, alertLevel -1);
                 otherHuman.alert(sourceHumanPosition, effectiveAlertLevel, false); // Assume non-gunshot for ally alerts
            }
        });
    };

    // Method to find the closest door to a point (e.g., for player interaction)
    findClosestDoor(point, maxDistance = 50) {
        let closestDoor = null;
        let minDistanceSq = maxDistance * maxDistance;

        this.buildings.forEach(building => {
            building.doors.forEach(door => {
                const distSq = point.distanceSq(door.position);
                if (distSq < minDistanceSq) {
                    minDistanceSq = distSq;
                    closestDoor = door;
                }
            });
        });
        return closestDoor;
    }

    // Method to get ALL doors (open or closed) from all buildings
    getAllStructureDoors() {
        let allDoors = [];
        this.buildings.forEach(building => {
            allDoors = allDoors.concat(building.doors); // Assumes Building has a 'doors' array
        });
        return allDoors;
    }

    // Method to find the closest interactable chest to a point
    findClosestChest(point, maxDistance = 50) {
        let closestChest = null;
        let minDistanceSq = maxDistance * maxDistance;

        this.buildings.forEach(building => {
            // Iterate through chests associated with the building (assuming building.chests exists)
            // Or iterate through the settlement's main chest list if they aren't tied to buildings
            // Let's assume chests are stored directly in the settlement for now based on constructor
            this.chests.forEach(chest => {
                if (chest.isInteractable) { // Only consider chests that can be interacted with
                    const distSq = point.distanceSq(chest.position);
                    if (distSq < minDistanceSq) {
                        minDistanceSq = distSq;
                        closestChest = chest;
                    }
                }
            });
        });
        return closestChest;
    }

    // Note: Chests are not currently added to getActiveObstacles as they aren't collision obstacles.
    // If they needed to block pathfinding, they'd need to be added there.

} // End of class Settlement
