import { Vector2 } from './utils.js';
import { Human, HeavyHuman, Container, MedKit, Generator } from './entities.js';
import { Building, Wall, Door } from './structures.js';

export class Settlement {
    constructor(position, radius, numHumans, spawnSettlementCallback, updateScoreCallback, existingBuildings = []) {
        this.position = position;
        this.radius = radius;
        this.humans = [];
        this.buildings = [];
        this.cleared = false;
        this.alarmState = 'calm';
        this.plasmaReward = numHumans * 50;
        this.spawnSettlementCallback = spawnSettlementCallback;
        this.updateScoreCallback = updateScoreCallback;

        const buildingSize = new Vector2(600, 450);
        let buildingPos = this.position.subtract(new Vector2(buildingSize.x / 2, buildingSize.y / 2));

        let placementValid = false;
        let attempts = 0;
        const maxPlacementAttempts = 10;
        while (!placementValid && attempts < maxPlacementAttempts) {
            placementValid = true;
            for (const existing of existingBuildings) {
                 if (buildingPos.x < existing.position.x + existing.size.x &&
                     buildingPos.x + buildingSize.x > existing.position.x &&
                     buildingPos.y < existing.position.y + existing.size.y &&
                     buildingPos.y + buildingSize.y > existing.position.y) {
                    placementValid = false;
                    buildingPos = buildingPos.add(new Vector2(Math.random() * 100 - 50, Math.random() * 100 - 50));
                    console.warn(`Building overlap detected, attempting new position: ${buildingPos.x}, ${buildingPos.y}`);
                    break;
                 }
            }
            attempts++;
        }

        if (!placementValid) {
             console.error("Could not place building without overlap after multiple attempts. Skipping building creation.");
             this.cleared = true;
             return;
        }


        const mainBuilding = new Building(buildingPos, buildingSize);
        this.buildings.push(mainBuilding);
        console.log(`Created single large building at ${buildingPos.x}, ${buildingPos.y}`);

        const building = this.buildings[0];
        for (let i = 0; i < numHumans; i++) {
            const patrolPath = this.generatePatrolPathInside(building, 3);
            let newHuman;

                if (patrolPath.length > 0) {
                    const HumanClass = Math.random() < 0.20 ? HeavyHuman : Human;
                    console.log(`Settlement Constructor: Instantiating ${HumanClass.name} with building:`, building);
                     if (typeof building === 'undefined') {
                          console.error(`!!! Building is undefined right before creating ${HumanClass.name} !!!`);
                     }
                    newHuman = new HumanClass(patrolPath, this, building);
                    this.humans.push(newHuman);
                } else {
                    console.warn("Could not generate valid patrol path inside building for human.");
                    const fallbackPoint = building.getRandomPointInside();
                    const fallbackPath = [fallbackPoint];
                    const HumanClass = Math.random() < 0.20 ? HeavyHuman : Human;
                     console.log(`Settlement Constructor: Instantiating FALLBACK ${HumanClass.name} with building:`, building);
                      if (typeof building === 'undefined') {
                           console.error(`!!! Building is undefined right before creating FALLBACK ${HumanClass.name} !!!`);
                      }
                    newHuman = new HumanClass(fallbackPath, this, building);
                    this.humans.push(newHuman);
                 }
            }
        while (this.humans.length > numHumans) {
            this.humans.pop();
        }

    };

    generatePatrolPathInside(building, numPoints = 3) {
        const path = [];
        const maxAttemptsPerPoint = 15;

        for (let i = 0; i < numPoints; i++) {
            let point;
            let attempts = 0;
            do {
                point = building.getRandomPointInside(0);
                attempts++;
            } while (attempts < maxAttemptsPerPoint && !point);

            if (point) {
                path.push(point);
            } else {
                console.warn(`Failed to find valid point ${i + 1} for internal patrol path in building.`);
                return path;
            }
        }
        return path;
    };

    checkPlayerInsideFootprint(player) {
        for (const building of this.buildings) {
            if (building.containsPointFootprint(player.position)) {
                return building;
            }
        }
        return null;
    }


    update(deltaTime, player, isLineOfSightClearFunc, projectiles, game) {
        for (let i = this.humans.length - 1; i >= 0; i--) {
            this.humans[i].update(deltaTime, player, isLineOfSightClearFunc, projectiles, game);
        }
    };

    draw(ctx, camera, player) {
        const playerBuilding = player.currentBuilding;
        const playerFloor = player.currentFloor;
        const isPlayerInside = !!playerBuilding;

        this.buildings.forEach(building => {
            const drawInterior = isPlayerInside && playerBuilding === building;
            const floorToDraw = drawInterior ? playerFloor : 0;
            building.draw(ctx, camera, floorToDraw, drawInterior);
        });

        this.humans.forEach(human => {
            const sameBuildingAndFloor = isPlayerInside && human.building === playerBuilding && human.currentFloor === playerFloor;
            const bothOutside = !isPlayerInside && !human.building;

            if (sameBuildingAndFloor || bothOutside) {
                human.draw(ctx, camera);
            }
        });

    };

     notifyHumanDeath(deadHuman, killer, killContext) {
        const killPosition = deadHuman.position;
        const buildingOfVictim = deadHuman.building;
        const floorOfVictim = deadHuman.currentFloor;
        const index = this.humans.indexOf(deadHuman);
        if (index !== -1) {
            this.humans.splice(index, 1);
        }

        if (killer && killer.isPlayer) {
            const isSilentKill = (killContext === 'knife');
            this.humans.forEach(livingHuman => {
                const distanceToKill = livingHuman.position.distance(killPosition);
                const isInSameBuilding = livingHuman.building === buildingOfVictim;
                const isInSameBuildingAndFloor = isInSameBuilding && livingHuman.currentFloor === floorOfVictim;

                let alertRange = 100;
                let alertLevel = 1;
                let isGunshotAlert = !isSilentKill;

                if (isGunshotAlert) {
                    alertRange = isInSameBuildingAndFloor ? 500 : (isInSameBuilding ? 250 : 100);
                    alertLevel = 2;
                } else {
                    alertRange = isInSameBuildingAndFloor ? 150 : (isInSameBuilding ? 50 : 0);
                    alertLevel = 1;
                }

                if (distanceToKill < alertRange) {
                    livingHuman.alert(killPosition, floorOfVictim, alertLevel, isGunshotAlert);
                }
            });
        }

        if (this.humans.length === 0 && !this.cleared) {
            this.clearSettlement();
        }
    };


    clearSettlement() {
        this.updateScoreCallback(this.plasmaReward);
        console.log("Settlement cleared (but remains for now).");
    };

    alertSettlement(alertSourcePosition, alertFloor, isGunshot = false) {
        console.log(`Settlement alerted by event at floor ${alertFloor}!`);
        this.alarmState = 'alerted';

        this.humans.forEach(human => {
            const distance = human.position.distance(alertSourcePosition);
            const isInSameBuilding = !!human.building;
            const isOnSameFloor = isInSameBuilding && human.currentFloor === alertFloor;

            let alertRange = 100;
            let alertLevel = 1;

            if (isGunshot) {
                alertRange = isOnSameFloor ? 500 : (isInSameBuilding ? 250 : 100);
                alertLevel = 2;
            } else {
                alertRange = isOnSameFloor ? 200 : (isInSameBuilding ? 100 : 50);
                alertLevel = 1;
            }

            if (distance < alertRange) {
                human.alert(alertSourcePosition, alertFloor, alertLevel, isGunshot);
            }
        });
    };

    notifyAlliesOfAlert(sourceHuman, alertLevel = 2) {
        const notificationRadius = 250;
        const sourcePosition = sourceHuman.position;
        const sourceBuilding = sourceHuman.building;
        const sourceFloor = sourceHuman.currentFloor;

        this.humans.forEach(otherHuman => {
            if (otherHuman === sourceHuman || otherHuman.alertLevel >= alertLevel) return;

            const distance = otherHuman.position.distance(sourcePosition);
            const isInSameBuilding = otherHuman.building === sourceBuilding;
            const isOnSameFloor = isInSameBuilding && otherHuman.currentFloor === sourceFloor;

            let effectiveRadius = notificationRadius;
            if (!isOnSameFloor) effectiveRadius *= 0.5;
            if (!isInSameBuilding) effectiveRadius *= 0.3;

            if (distance < effectiveRadius) {
                 otherHuman.alert(sourcePosition, sourceFloor, alertLevel, false);
            }
        });
    };

}
