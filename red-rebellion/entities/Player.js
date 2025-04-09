import { Entity } from './Entity.js';
import { Vector2 } from '../utils.js';
import { Projectile } from './Projectile.js';

export class Player extends Entity {
    constructor(position, imgStandard, imgIdleFrame2) {
        super(position, new Vector2(20, 50), '#00ff00');
        this.visualSize = new Vector2(60, 60);
        this.imgStandard = imgStandard;
        this.imgIdleFrame2 = imgIdleFrame2;
        this.health = 25;
        this.maxHealth = 25;
        this.isPlayer = true;
        this.currentLayer = 'surface'; // Added layer state
        this.currentFloor = 0;
        this.baseSpeed = 250;
        this.sneakSpeed = 100;
        this.speed = this.baseSpeed;
        this.isSneaking = false;
        this.weapons = ['Knife', 'Gun']; // Removed Axe, Pickaxe, Shotgun
        this.currentWeaponIndex = 0; // Start with Knife
        this.attackCooldown = 0;
        this.knifeRange = 90;
        this.knifeDamage = 1000;
        this.gunDamage = 30;
        // Removed shotgun properties
        this.gunCooldown = 0.2;
        this.knifeCooldown = 0.5;
        // Removed shotgun cooldown
        this.knifeSwingDuration = 0.1;
        this.knifeSwingTimer = 0;
        this.gunFlashDuration = 0.05;
        this.gunFlashTimer = 0;
        this.isDashing = false;
        this.dashSpeed = 750;
        this.DASH_DURATION = 0.15;
        this.DASH_COOLDOWN = 1.2;
        this.dashDurationTimer = 0;
        this.dashCooldownTimer = 0;
        this.dashDirection = new Vector2(0, 0);
        this.detectionMultiplier = 1.0;
        this.lastPosition = new Vector2(position.x, position.y);
        this.interactKey = 'f';
        this.pickupKey = 'p';
        this.interactTarget = null;
        this.pickupTarget = null;
        this.chopTarget = null; 
        this.mineTarget = null; // Explicitly add mineTarget for tiles
        this.currentBuilding = null;
        this.inventory = {
            wood: 0,
            rock: 0,
            food: 0,
            hide: 0,
            heal: 0,
            plasma: 0
        };
        this.maxStackSize = 99; // Add max stack size for player inventory
    }

    update(deltaTime, keys, worldManager, healthFill, weaponDisplay, projectiles, itemDrops, game) {
        this.lastPosition = new Vector2(this.position.x, this.position.y);
        let moveX = 0;
        let moveY = 0;
        const wasSneaking = this.isSneaking;

        const previousBuilding = this.currentBuilding;
        this.currentBuilding = null;
        let currentObstacles = [];
        const activeSettlements = worldManager.getActiveSettlements();

        for (const settlement of activeSettlements) {
            for (const building of settlement.buildings) {
                if (building.containsPoint(this.position)) {
                    this.currentBuilding = building;
                    if (previousBuilding !== this.currentBuilding) {
                        this.currentFloor = 0;
                    }
                    currentObstacles = this.currentBuilding.getObstacles(this.currentFloor);
                    this.settlement = settlement;
                    break;
                }
            }
            if (this.currentBuilding) break;
        }

        if (!this.currentBuilding) {
            if (previousBuilding) {
                this.currentFloor = 0;
            }
             this.settlement = null;
             currentObstacles = [];
             const checkRadiusSq = 150 * 150;
             activeSettlements.forEach(settlement => {
                 settlement.buildings.forEach(building => {
                     if (this.position.distanceSq(building.position.add(building.size.multiply(0.5))) < checkRadiusSq + building.size.magnitudeSq()) {
                         currentObstacles = currentObstacles.concat(building.getExteriorObstacles());
                     }
                 });
             });

             // Add obstacles based on the current layer when outside
             if (this.currentLayer === 'surface') {
                 const activeTrees = worldManager.getActiveTrees(); // Assumes this gets surface trees
                 currentObstacles = currentObstacles.concat(activeTrees.filter(tree => !tree.isFelled));
                 // TODO: Add other surface-specific obstacles if needed
             } else if (this.currentLayer === 'underground') {
                 // TODO: Add underground obstacles (e.g., rocks, mineral deposits)
                 // const activeMinerals = worldManager.getActiveMineralDeposits(); // Example
                 // currentObstacles = currentObstacles.concat(activeMinerals);
             }
         }


         if (this.dashCooldownTimer > 0) {
             this.dashCooldownTimer -= deltaTime;
         }
         if (this.isDashing) {
             this.dashDurationTimer -= deltaTime;
             if (this.dashDurationTimer <= 0) {
                 this.isDashing = false;
                 this.velocity = new Vector2(0, 0);
             } else {
                 this.velocity = this.dashDirection.multiply(this.dashSpeed);
             }
         }

         if (!this.isDashing) {
             if (keys.shift) {
                 this.isSneaking = true;
                 this.speed = this.sneakSpeed;
             } else {
                 this.isSneaking = false;
                 this.speed = this.baseSpeed;
             }

             let dx = 0;
             let dy = 0;
             if (keys.w) dy -= 1;
             if (keys.s) dy += 1;
             if (keys.a) dx -= 1;
             if (keys.d) dx += 1;

             if (dx !== 0 || dy !== 0) {
                 if (dx !== 0 && dy !== 0) {
                     const factor = this.speed / Math.sqrt(2);
                     moveX = dx * factor;
                     moveY = dy * factor;
                 } else {
                     moveX = dx * this.speed;
                     moveY = dy * this.speed;
                 }
             } else {
                 moveX = 0;
                 moveY = 0;
             }

             if (keys.space && this.dashCooldownTimer <= 0 && (moveX !== 0 || moveY !== 0 || dx !== 0 || dy !== 0)) {
                 this.isDashing = true;
                 this.dashDurationTimer = this.DASH_DURATION;
                 this.dashCooldownTimer = this.DASH_COOLDOWN;
                 this.dashDirection = new Vector2(dx, dy).normalize();
                 this.velocity = this.dashDirection.multiply(this.dashSpeed);
                 keys.space = false;
                 moveX = 0;
                 moveY = 0;
             } else {
                 this.velocity = new Vector2(0, 0);
             }
         }


         if (this.isSneaking && !wasSneaking) {
             this.detectionMultiplier = 0.4;
             activeSettlements.forEach(s => s.humans.forEach(h => {
                 const sameFloor = this.currentBuilding && h.building === this.currentBuilding && this.currentFloor === h.currentFloor;
                 const canBeAlerted = !this.currentBuilding || sameFloor;

                 if (canBeAlerted && (h.alertLevel === 2 || h.state === 'chase' || h.state === 'attack')) {
                      h.alert(this.lastPosition, this.currentFloor, 1, false);
                 }
             }));
         } else if (!keys.shift && this.isSneaking) {
             this.isSneaking = false;
             this.speed = this.baseSpeed;
             this.detectionMultiplier = 1.0;
         }

         this.interactTarget = null;
         let closestInteractable = null;
         let minDistanceSq = 60 * 60;

         if (this.currentBuilding && this.currentFloor >= 0 && this.currentFloor < this.currentBuilding.floors.length) {
             const floor = this.currentBuilding.floors[this.currentFloor];
             floor.doors.forEach(door => {
                 const distSq = this.position.distanceSq(door.position);
                 if (distSq < minDistanceSq) {
                     minDistanceSq = distSq;
                     closestInteractable = door;
                 }
             });
             floor.interactables.forEach(interactable => {
                 if (interactable.isInteractable && (interactable.isContainer || interactable.isMedKit || interactable.isGenerator)) {
                     const distSq = this.position.distanceSq(interactable.position);
                     if (distSq < minDistanceSq) {
                         minDistanceSq = distSq;
                         closestInteractable = interactable;
                     }
                 }
             });
             floor.stairs.forEach(stair => {
                 const distSq = this.position.distanceSq(stair.position);
                 if (distSq < minDistanceSq) {
                     minDistanceSq = distSq;
                     closestInteractable = stair;
                  }
              });
          } else {
              activeSettlements.forEach(settlement => {
                  settlement.buildings.forEach(building => {
                      const groundFloor = building.floors[0];
                      if (groundFloor && groundFloor.externalDoor) {
                          const door = groundFloor.externalDoor;
                          const distSq = this.position.distanceSq(door.position);
                          if (distSq < minDistanceSq) {
                              minDistanceSq = distSq;
                              closestInteractable = door;
                          }
                      }
                 });
             });

             // Check for nearby interactables ONLY when outside and on the surface layer
             if (this.currentLayer === 'surface') { // Added layer check
                 const depot = game.playerSettlement?.getStorageDepot(); // Get depot from game's settlement
                 if (depot && depot.isInteractable) {
                      const distSq = this.position.distanceSq(depot.position);
                      if (distSq < minDistanceSq) {
                          minDistanceSq = distSq;
                          closestInteractable = depot;
                     }
                 }
                 // TODO: Add check for Cave Entrances if they are surface interactables
             } // End if (this.currentLayer === 'surface') for outside interactables

            // Check for nearby choppable trees when outside and on surface
            this.chopTarget = null;
            if (!this.currentBuilding && this.currentLayer === 'surface') { // Added layer check
                let closestTree = null;
                let minTreeDistSq = 60 * 60; // Chopping range
                const activeTrees = worldManager.getActiveTrees(); // Assumes surface trees
                activeTrees.forEach(tree => {
                    if (!tree.isFelled) {
                        const distSq = this.position.distanceSq(tree.position);
                        if (distSq < minTreeDistSq) {
                            minTreeDistSq = distSq;
                            closestTree = tree;
                        }
                    }
                });
                this.chopTarget = closestTree;
            }

            // Check for nearby minable things when underground
            this.mineTarget = null;
            if (this.currentLayer === 'underground') { // Changed condition to check layer
                // TODO: Implement logic to find minable targets (e.g., Mineral Deposits)
                // This might involve getting active underground entities from WorldManager
                // Placeholder logic properly commented out:
                /*
                const reach = 60;
                let closestMinable = null;
                let minMineDistSq = reach * reach;
                const activeMinerals = worldManager.getActiveMineralDeposits(); // Needs implementation
                activeMinerals.forEach(mineral => {
                    const distSq = this.position.distanceSq(mineral.position);
                    if (distSq < minMineDistSq) {
                        minMineDistSq = distSq;
                        closestMinable = mineral;
                    }
                });
                this.mineTarget = closestMinable;
                */
            }
            // Old cave mining logic removed.
        }
        this.interactTarget = closestInteractable;


        this.pickupTarget = null;
          let closestItemDrop = null;
          let minItemDistanceSq = 50 * 50;

          // Only check item drops on the player's current layer
          // TODO: ItemDrop needs a 'layer' property assigned when created
          itemDrops.forEach(drop => {
              // Assuming drop.layer exists and matches player.currentLayer
              const onCorrectLayer = drop.layer === this.currentLayer; // Needs ItemDrop modification later
              const sameFloor = (!this.currentBuilding && drop.floorIndex === 0) ||
                                (this.currentBuilding && drop.floorIndex === this.currentFloor);

              // For now, assume all drops are surface until ItemDrop is modified
              if (this.currentLayer === 'surface' && sameFloor && drop.isPickup) {
                  const distSq = this.position.distanceSq(drop.position);
                  if (distSq < minItemDistanceSq) {
                      minItemDistanceSq = distSq;
                      closestItemDrop = drop;
                  }
              }
          });
          this.pickupTarget = closestItemDrop;


         if (!this.isDashing) {
             this.position.x += moveX * deltaTime;
             this.checkAxisCollision('x', currentObstacles, game); // Pass game object

             this.position.y += moveY * deltaTime;
             this.checkAxisCollision('y', currentObstacles, game); // Pass game object
         } else {
             const currentPosition = this.position.clone();
             const potentialNextPosition = this.position.add(this.velocity.multiply(deltaTime));
             const collisionResult = this.checkMovementCollision(currentPosition, potentialNextPosition, currentObstacles, game); // Pass game object
             this.position = collisionResult.finalPos;
             if (collisionResult.collisionNormal) {
                 this.isDashing = false;
                 this.velocity = new Vector2(0, 0);
             }
         }


         if (keys.e) {
             this.switchWeapon();
            keys.e = false;
        }

         if (this.attackCooldown > 0) this.attackCooldown -= deltaTime;
         if (this.knifeSwingTimer > 0) this.knifeSwingTimer -= deltaTime;
         if (this.gunFlashTimer > 0) this.gunFlashTimer -= deltaTime;

         // Handle automatic chopping
         if (keys.c && this.chopTarget) {
             // Add a cooldown or rate limit? For now, just call chop directly.
             // Need to implement chop method on Tree entity
             if (typeof this.chopTarget.chop === 'function') {
                 this.chopTarget.chop(deltaTime, game); // Pass deltaTime and game for potential item drops
             }
             // Prevent movement while chopping? Optional.
         }

         // Handle automatic mining (only if underground)
         if (keys.m && this.mineTarget && this.currentLayer === 'underground') {
             // TODO: Implement mining interaction with the target (e.g., MineralDeposit)
             // if (typeof this.mineTarget.mine === 'function') {
             //     this.mineTarget.mine(deltaTime, game);
             // }
             // Prevent movement while mining? Optional.
         }


         healthFill.style.width = `${Math.max(0, (this.health / this.maxHealth) * 100)}%`;
         weaponDisplay.textContent = `Weapon: ${this.weapons[this.currentWeaponIndex]}`;
     }
    

     // Get the Y coordinate for depth sorting (bottom of the visual sprite)
     getSortY() {
         // Drawing is centered vertically, use visual size to match drawn position
         // Removed bias, relying on calculated bottom edge and stable sort tie-breaker
         return this.position.y + this.visualSize.y / 2;
     }

     getDirectionVector(mousePos, camera) {
         const targetWorldX = mousePos.x + camera.x;
         const targetWorldY = mousePos.y + camera.y;
         return new Vector2(targetWorldX - this.position.x, targetWorldY - this.position.y).normalize();
     }

     draw(ctx, camera) {
          ctx.save();
          if (this.isSneaking && !this.isDashing) {
               ctx.globalAlpha = 0.6;
          }

          let currentImage = this.imgStandard;

          if (currentImage && currentImage.complete && currentImage.naturalWidth > 0) {
              const drawWidth = this.visualSize.x;
              const drawHeight = this.visualSize.y;
              ctx.drawImage(
                  currentImage,
                  this.position.x - drawWidth / 2, // Removed - camera.x
                  this.position.y - drawHeight / 2, // Removed - camera.y
                  drawWidth,
                  drawHeight
              );
          } else {
              ctx.fillStyle = this.color;
              ctx.fillRect(
                  this.position.x - this.size.x / 2, // Removed - camera.x
                  this.position.y - this.size.y / 2, // Removed - camera.y
                  this.size.x,
                  this.size.y
              );
          }

          // Draw collision box (optional debug)
          // ctx.strokeStyle = 'red';
          // ctx.lineWidth = 1 / camera.zoom; // Adjust line width for zoom
          // ctx.strokeRect(
          //     this.position.x - this.size.x / 2, // Removed - camera.x
          //     this.position.y - this.size.y / 2, // Removed - camera.y
          //     this.size.x,
          //     this.size.y
          // );

          ctx.restore();

          if (this.health < this.maxHealth && this.health > 0) {
              const barWidth = this.visualSize.x; // Keep bar width relative to visual size
              const barHeight = 5 / camera.zoom; // Scale UI elements inversely with zoom
              const barX = this.position.x - barWidth / 2; // Removed - camera.x
              const barY = this.position.y - this.visualSize.y / 2 - barHeight - (5 / camera.zoom); // Removed - camera.y, adjust offset based on zoom

              // Draw health bar relative to player, scaling inversely with zoom
              ctx.fillStyle = 'rgba(0,0,0,0.7)';
              ctx.fillRect(barX, barY, barWidth, barHeight); // Use world coords for position
              ctx.fillStyle = '#00ff00';
              ctx.fillRect(barX, barY, (barWidth * this.health) / this.maxHealth, barHeight);
          }

          if (this.weapons[this.currentWeaponIndex] === 'Knife' && this.knifeSwingTimer > 0) {
            const swingAngle = Math.PI / 2;
            const startAngle = this.velocity.magnitude() > 0 ? this.velocity.angle() - swingAngle / 2 : -Math.PI / 2 - swingAngle / 2;
            const endAngle = startAngle + swingAngle;

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 3 / camera.zoom; // Scale line width
            ctx.beginPath();
            ctx.arc(this.position.x, this.position.y, this.knifeRange * 0.8, startAngle, endAngle); // Removed - camera.x/y
            ctx.stroke();
         }

          if (this.interactTarget) {
              let interactText = 'Interact';
              // Removed Tree hint text check
              if (this.interactTarget?.type === 'StorageDepot') interactText = 'Deposit Resources'; // Add Depot text
              else if (this.interactTarget?.isDoor) interactText = 'Open/Close Door';
              else if (this.interactTarget?.isGenerator) interactText = 'Siphon Plasma';
              else if (this.interactTarget?.isContainer) interactText = 'Open Container';
              else if (this.interactTarget?.isMedKit) interactText = 'Open MedKit';
              else if (this.interactTarget?.isStairs) interactText = 'Use Stairs';

              // Draw hints relative to player, scaling font/offset inversely with zoom
              const fontSize = 16 / camera.zoom;
              const yOffsetBase = -this.visualSize.y / 2 - (15 / camera.zoom);
              ctx.fillStyle = 'white';
              ctx.font = `${fontSize}px Orbitron`;
              ctx.textAlign = 'center';
              ctx.fillText(`[${this.interactKey.toUpperCase()}] ${interactText}`, this.position.x, this.position.y + yOffsetBase); // Removed - camera.x/y
              ctx.textAlign = 'left'; // Reset alignment
        }

        // Determine Y offset for hints to avoid overlap
        // Adjust hint offsets and font size based on zoom
        const fontSize = 16 / camera.zoom;
        const hintSpacing = 20 / camera.zoom;
        let hintOffsetY = -this.visualSize.y / 2 - (15 / camera.zoom); // Base offset adjusted for zoom

        if (this.interactTarget) {
            hintOffsetY -= hintSpacing; // Move subsequent hints down if interact hint is shown
        }

        if (this.pickupTarget) {
            ctx.fillStyle = 'yellow';
            ctx.font = `${fontSize}px Orbitron`;
            ctx.textAlign = 'center';
            ctx.fillText(`[${this.pickupKey.toUpperCase()}] Pick Up ${this.pickupTarget.itemType}`, this.position.x, this.position.y + hintOffsetY); // Removed - camera.x/y
            ctx.textAlign = 'left';
            hintOffsetY -= hintSpacing; // Move subsequent hints down
        }

        if (this.chopTarget) {
            ctx.fillStyle = 'orange';
            ctx.font = `${fontSize}px Orbitron`;
            ctx.textAlign = 'center';
            ctx.fillText(`[Hold C] Chop Tree`, this.position.x, this.position.y + hintOffsetY); // Removed - camera.x/y
            ctx.textAlign = 'left';
            hintOffsetY -= hintSpacing; // Move subsequent hints down
        }
        
        // Draw mining hint if a tile is targeted
        if (this.mineTarget) {
            const tileNames = ['Empty', 'Stone', 'Iron', 'Copper', 'Titanium', 'Plasma'];
            const tileName = tileNames[this.mineTarget.type] || 'Unknown';
            ctx.fillStyle = '#b0b0ff'; // Light blue/purple for mining
            ctx.font = `${fontSize}px Orbitron`;
            ctx.textAlign = 'center';
            ctx.fillText(`[Hold M] Mine ${tileName}`, this.position.x, this.position.y + hintOffsetY); // Removed - camera.x/y
            ctx.textAlign = 'left';
        }


        if (this.weapons[this.currentWeaponIndex] === 'Gun' && this.gunFlashTimer > 0) { // Removed Shotgun check
             const flashSize = 15 / camera.zoom; // Scale flash size
             // Use velocity for direction if moving, otherwise default (e.g., facing up)
             const direction = this.velocity.magnitudeSq() > 1 ? this.velocity.normalize() : Vector2.fromAngle(-Math.PI / 2);
             const flashX = this.position.x + direction.x * (this.size.x / 2 + (5 / camera.zoom)); // Removed - camera.x, adjust offset
             const flashY = this.position.y + direction.y * (this.size.y / 2 + (5 / camera.zoom)); // Removed - camera.y, adjust offset

             ctx.fillStyle = 'rgba(255, 255, 0, 0.9)';
             ctx.beginPath();
             ctx.arc(flashX, flashY, flashSize / 2, 0, Math.PI * 2);
             ctx.fill();
         }
    }

    // attackScreenPos is the mouse position relative to the canvas center, adjusted for zoom in game.js
    attack(attackScreenPos, camera, projectiles, settlements) {
        if (this.attackCooldown > 0) return;

        const weapon = this.weapons[this.currentWeaponIndex];
        const activeSettlements = settlements;

         if (weapon === 'Knife') {
             this.attackCooldown = this.knifeCooldown;
             this.knifeSwingTimer = this.knifeSwingDuration;
             activeSettlements.forEach(settlement => {
                 settlement.humans.forEach(human => {
                     const sameFloor = this.currentBuilding && human.building === this.currentBuilding && this.currentFloor === human.currentFloor;
                     const canHit = !this.currentBuilding || sameFloor;

                     if (canHit && this.position.distance(human.position) < this.knifeRange) {
                         human.takeDamage(this.knifeDamage, this, 'knife');
                     }
                 });
             });

         } else if (weapon === 'Gun') {
             this.attackCooldown = this.gunCooldown;
             // Calculate world target based on screen position and camera
             const targetWorldX = attackScreenPos.x / camera.zoom + camera.x;
             const targetWorldY = attackScreenPos.y / camera.zoom + camera.y;
             const direction = new Vector2(targetWorldX - this.position.x, targetWorldY - this.position.y).normalize();
             const projectileSpawnPos = this.position.add(direction.multiply(this.size.x / 2 + 5)); // Spawn relative to player center

             projectiles.push(new Projectile(projectileSpawnPos, direction, this.gunDamage, true));
             this.gunFlashTimer = this.gunFlashDuration;

         } // Removed Shotgun attack logic
     }

    switchWeapon() {
        this.currentWeaponIndex = (this.currentWeaponIndex + 1) % this.weapons.length;
    }

    takeDamage(amount, gameOverCallback, source = null, killContext = 'other') {
        if (super.takeDamage(amount, source, killContext)) {
            gameOverCallback();
         }
     }

    checkAxisCollision(axis, obstacles, game) { // Added game parameter
        const halfSize = axis === 'x' ? this.size.x / 2 : this.size.y / 2;
        // const pos = axis === 'x' ? this.position.x : this.position.y; // Original pos variable unused

        // Collision logic depends on the layer
        if (this.currentLayer === 'underground') {
            // --- Underground Collision (Placeholder) ---
            // TODO: Implement collision with underground features (e.g., walls, rocks)
        } else if (this.currentLayer === 'surface') {
             // --- Surface Obstacle Collision ---
             obstacles.forEach(obstacle => {
                 // Skip collision check for open doors or stairs
                 if ((obstacle.isDoor && obstacle.isOpen) || obstacle.isStairs) {
                     return;
                 }

                 // Get collision rectangle data
                 let obsRect;
                 if (typeof obstacle.getRectData === 'function') {
                      obsRect = obstacle.getRectData();
                 } else if (obstacle instanceof Entity) {
                      obsRect = {
                          x: obstacle.position.x, y: obstacle.position.y,
                          width: obstacle.size.x, height: obstacle.size.y
                      };
                 } else {
                      return; // Skip unknown obstacles
                 }

                 const obsHalfWidth = obsRect.width / 2;
                 const obsHalfHeight = obsRect.height / 2;

                 // AABB collision check
                 if (
                     this.position.x + this.size.x / 2 > obsRect.x - obsHalfWidth &&
                     this.position.x - this.size.x / 2 < obsRect.x + obsHalfWidth &&
                     this.position.y + this.size.y / 2 > obsRect.y - obsHalfHeight &&
                     this.position.y - this.size.y / 2 < obsRect.y + obsHalfHeight
                 ) {
                     // Collision detected, resolve it
                     if (axis === 'x') {
                         const overlap = (this.size.x / 2 + obsHalfWidth) - Math.abs(this.position.x - obsRect.x);
                         if (overlap > 0) {
                             if (this.position.x < obsRect.x) {
                                 this.position.x -= overlap; // Move left
                             } else {
                                 this.position.x += overlap; // Move right
                             }
                         }
                     } else { // axis === 'y'
                         const overlap = (this.size.y / 2 + obsHalfHeight) - Math.abs(this.position.y - obsRect.y);
                          if (overlap > 0) {
                             if (this.position.y < obsRect.y) {
                                 this.position.y -= overlap; // Move up
                             } else {
                                 this.position.y += overlap; // Move down
                             }
                         }
                     }
                 }
             }); // End obstacles.forEach for surface
        } // End surface collision check
    } // End checkAxisCollision method

    // Added helper for dash collision as it needs more complex checks
    checkMovementCollision(startPos, endPos, obstacles, game) { // Added game parameter
        let finalPos = endPos.clone();
        let collisionNormal = null;
        let minCollisionTime = 1.0;

        const movementVector = endPos.subtract(startPos);

        // Swept collision should also be layer-aware
        if (this.currentLayer === 'underground') {
             // --- Underground Swept Collision (Placeholder) ---
             // TODO: Implement swept collision for underground obstacles
        } else if (this.currentLayer === 'surface') {
            // --- Surface Swept Collision (Original Logic) ---
            obstacles.forEach(obstacle => {
                if ((obstacle.isDoor && obstacle.isOpen) || obstacle.isStairs) {
                    return;
                }

                let obsRect;
                 if (typeof obstacle.getRectData === 'function') { // Check if the method exists
                     obsRect = obstacle.getRectData(); // Use the method (e.g., for Tree)
             } else if (obstacle instanceof Entity) { // Fallback for basic entities
                 obsRect = { x: obstacle.position.x, y: obstacle.position.y, width: obstacle.size.x, height: obstacle.size.y }; // Assumes center anchor
             } else {
                 return; // Skip unknown obstacles
             }


            // Broad phase check (optional but can optimize)
            // ...

            // AABB Swept Collision Check (Simplified)
            const expandedObstacle = {
                minX: obsRect.x - obsRect.width / 2 - this.size.x / 2,
                maxX: obsRect.x + obsRect.width / 2 + this.size.x / 2,
                minY: obsRect.y - obsRect.height / 2 - this.size.y / 2,
                maxY: obsRect.y + obsRect.height / 2 + this.size.y / 2,
            };

            let tEnterX = -Infinity, tLeaveX = Infinity;
            let tEnterY = -Infinity, tLeaveY = Infinity;

            if (movementVector.x === 0) {
                if (startPos.x <= expandedObstacle.minX || startPos.x >= expandedObstacle.maxX) return; // No X collision possible
            } else {
                tEnterX = (expandedObstacle.minX - startPos.x) / movementVector.x;
                tLeaveX = (expandedObstacle.maxX - startPos.x) / movementVector.x;
                if (tEnterX > tLeaveX) [tEnterX, tLeaveX] = [tLeaveX, tEnterX]; // Swap if needed
            }

             if (movementVector.y === 0) {
                 if (startPos.y <= expandedObstacle.minY || startPos.y >= expandedObstacle.maxY) return; // No Y collision possible
             } else {
                 tEnterY = (expandedObstacle.minY - startPos.y) / movementVector.y;
                 tLeaveY = (expandedObstacle.maxY - startPos.y) / movementVector.y;
                 if (tEnterY > tLeaveY) [tEnterY, tLeaveY] = [tLeaveY, tEnterY]; // Swap if needed
             }

            const tEnter = Math.max(tEnterX, tEnterY);
            const tLeave = Math.min(tLeaveX, tLeaveY);

            if (tEnter < tLeave && tEnter >= 0 && tEnter < 1.0 && tEnter < minCollisionTime) {
                 minCollisionTime = tEnter;
                 // Determine collision normal (simplified: assumes axis-aligned collision)
                 if (tEnterX > tEnterY) {
                     collisionNormal = new Vector2(movementVector.x > 0 ? -1 : 1, 0);
                 } else {
                     collisionNormal = new Vector2(0, movementVector.y > 0 ? -1 : 1);
                 }
            } // End if collision time check
        }); // End obstacles.forEach for surface
    } // End surface swept collision


        if (collisionNormal) {
            // Move player just before collision
            finalPos = startPos.add(movementVector.multiply(minCollisionTime * 0.99)); // Move slightly less than full collision time
        }

        // Return the final position and collision normal (if any)
        return { finalPos, collisionNormal };
    }
}
