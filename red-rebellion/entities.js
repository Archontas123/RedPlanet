import { Vector2, lineIntersectsRect, lineIntersectsLine, isLineOfSightClear } from './utils.js';
import { findPath } from './pathfinding.js';
import { Door } from './structures.js';

export class Entity {
    constructor(position, size, color) {
        this.position = position;
        this.size = size;
        this.color = color;
        this.velocity = new Vector2(0, 0);
        this.health = 100;
        this.maxHealth = 100;
        this.isPlayer = false;
        this.isHuman = false;
        this.settlement = null;
        this.building = null;
    }

    update(deltaTime, currentObstacles, allDoors = []) {
        const prevPosition = new Vector2(this.position.x, this.position.y);
        if (this.velocity.x !== 0 || this.velocity.y !== 0) {
            this.position = this.position.add(this.velocity.multiply(deltaTime));
            this.checkObstacleCollisions(prevPosition, currentObstacles, allDoors);
        }
    }

    checkObstacleCollisions(prevPosition, obstacles, allDoors) {
        let collisionResolved = false;
        obstacles.forEach(obstacle => {
            if (collisionResolved) return;

            const isDoor = obstacle instanceof Door;
            const isOpen = isDoor && obstacle.isOpen;

            if (isDoor && isOpen) {
                return;
            }

            if (this.collidesWithRect(obstacle)) {
                const obsRect = obstacle.getRectData();
                const dx = this.position.x - obsRect.x;
                const dy = this.position.y - obsRect.y;
                const combinedHalfWidths = this.size.x / 2 + obsRect.width / 2;
                const combinedHalfHeights = this.size.y / 2 + obsRect.height / 2;
                const overlapX = combinedHalfWidths - Math.abs(dx);
                const overlapY = combinedHalfHeights - Math.abs(dy);

                if (overlapX < overlapY) {
                    this.position.x += Math.sign(dx) * overlapX;
                    this.velocity.x = 0;
                } else {
                    this.position.y += Math.sign(dy) * overlapY;
                    this.velocity.y = 0;
                }
                collisionResolved = true;
            }
        });
    }

    collidesWithRect(obstacle) {
        const halfWidth = this.size.x / 2;
        const halfHeight = this.size.y / 2;
        const obsRect = obstacle.getRectData();
        const obsHalfWidth = obsRect.width / 2;
        const obsHalfHeight = obsRect.height / 2;

        return (
            this.position.x + halfWidth > obsRect.x - obsHalfWidth &&
            this.position.x - halfWidth < obsRect.x + obsHalfWidth &&
            this.position.y + halfHeight > obsRect.y - obsHalfHeight &&
            this.position.y - halfHeight < obsRect.y + obsHalfHeight
        );
    }

    draw(ctx, camera) {
        ctx.fillStyle = this.color;
        ctx.fillRect(
            this.position.x - this.size.x / 2 - camera.x,
            this.position.y - this.size.y / 2 - camera.y,
            this.size.x,
            this.size.y
        );

        if (this.health < this.maxHealth && this.health > 0) {
            const barWidth = this.size.x;
            const barHeight = 5;
            const barX = this.position.x - barWidth / 2 - camera.x;
            const barY = this.position.y - this.size.y / 2 - barHeight - 5 - camera.y;

            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(barX, barY, barWidth, barHeight);
            ctx.fillStyle = this.isPlayer ? '#00ff00' : '#ff0000';
            ctx.fillRect(barX, barY, (barWidth * this.health) / this.maxHealth, barHeight);
        }
    }

    takeDamage(amount, source = null, killContext = 'other') {
        this.health -= amount;
        const died = this.health <= 0;
        if (died && this.isHuman && this.settlement) {
             this.settlement.notifyHumanDeath(this, source, killContext);
        }
        return died;
    }
}

export class Player extends Entity {
    constructor(position, worldWidth, worldHeight, imgStandard, imgIdleFrame2) { // Added image parameters
        super(position, new Vector2(20, 50), '#00ff00'); // Narrower collision hitbox size (20 wide, 50 tall)
        this.visualSize = new Vector2(60, 60); // Visual sprite size remains 60x60
        this.imgStandard = imgStandard;
        this.imgIdleFrame2 = imgIdleFrame2;
        this.health = 25;
        this.maxHealth = 25;
        this.isPlayer = true;
        this.baseSpeed = 250;
        this.sneakSpeed = 100;
        this.speed = this.baseSpeed;
        this.isSneaking = false;
        this.weapons = ['Knife', 'Gun', 'Shotgun'];
        this.currentWeaponIndex = 0;
        this.attackCooldown = 0;
        this.knifeRange = 90;
        this.knifeDamage = 1000;
        this.gunDamage = 30;
        this.shotgunDamage = 15;
        this.shotgunPellets = 6;
        this.shotgunSpread = Math.PI / 8;
        this.gunCooldown = 0.2;
        this.knifeCooldown = 0.5;
        this.shotgunCooldown = 1.0;
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
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;
        this.interactKey = 'f';
        this.interactTarget = null;
    }

    update(deltaTime, keys, settlements, healthFill, weaponDisplay, projectiles) {
        const wasSneaking = this.isSneaking;
        this.lastPosition = new Vector2(this.position.x, this.position.y);

        let currentSettlement = null;
        let currentObstacles = [];
        for (const settlement of settlements) {
            if (this.position.distance(settlement.position) < settlement.radius + 100) {
                currentSettlement = settlement;
                currentObstacles = settlement.getActiveObstacles();
                break;
            }
        }
        this.settlement = currentSettlement;

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
        } else {
            const wasSneaking = this.isSneaking;
            if (keys.shift && !this.isSneaking) {
                this.isSneaking = true;
                this.speed = this.sneakSpeed;
            } else if (!keys.shift && this.isSneaking) {
                this.isSneaking = false;
                this.speed = this.baseSpeed;
            }

            this.velocity = new Vector2(0, 0);
            if (keys.w) this.velocity.y -= 1;
            if (keys.s) this.velocity.y += 1;
            if (keys.a) this.velocity.x -= 1;
            if (keys.d) this.velocity.x += 1;

            if (this.velocity.magnitude() > 0) {
                this.velocity = this.velocity.normalize().multiply(this.speed);
            }

            if (keys.space && this.dashCooldownTimer <= 0) {
                this.isDashing = true;
                this.dashDurationTimer = this.DASH_DURATION;
                this.dashCooldownTimer = this.DASH_COOLDOWN;
                this.dashDirection = this.velocity.magnitude() > 0 ? this.velocity.normalize() : Vector2.fromAngle(-Math.PI / 2);
                this.velocity = this.dashDirection.multiply(this.dashSpeed);
                keys.space = false;
            }
        }

        if (keys.shift && !wasSneaking) {
            this.detectionMultiplier = 0.4;
            settlements.forEach(s => s.humans.forEach(h => {
                if (h.alertLevel === 2 || h.state === 'chase' || h.state === 'attack') {
                     h.alert(this.lastPosition, 1, false);
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

        if (this.settlement) {
            const closestDoor = this.settlement.findClosestDoor(this.position, Math.sqrt(minDistanceSq));
            if (closestDoor) {
                closestInteractable = closestDoor;
                minDistanceSq = this.position.distanceSq(closestDoor.position);
            }

            if (this.settlement.chests) {
                this.settlement.chests.forEach(chest => {
                    const distSq = this.position.distanceSq(chest.position);
                    if (distSq < minDistanceSq && chest.isInteractable) {
                        minDistanceSq = distSq;
                        closestInteractable = chest;
                    }
                });
            }
        }

        // Interaction target finding for UI hint is okay
        this.interactTarget = closestInteractable;

        // REMOVED Redundant interaction logic block.
        // Interaction is now handled centrally in game.js -> handleInteraction()

        const allDoors = this.settlement ? this.settlement.getAllStructureDoors() : [];
        // Fetch the LATEST obstacles right before collision check to reflect interactions in the same frame
        if (this.settlement) currentObstacles = this.settlement.getActiveObstacles();
        super.update(deltaTime, currentObstacles, allDoors);
        this.constrainToWorld();

        if (keys.e) {
            this.switchWeapon();
            keys.e = false;
        }

        if (this.attackCooldown > 0) this.attackCooldown -= deltaTime;
        if (this.knifeSwingTimer > 0) this.knifeSwingTimer -= deltaTime;
        if (this.gunFlashTimer > 0) this.gunFlashTimer -= deltaTime;

        healthFill.style.width = `${Math.max(0, (this.health / this.maxHealth) * 100)}%`;
        weaponDisplay.textContent = `Weapon: ${this.weapons[this.currentWeaponIndex]}`;
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
          // Removed dashing fillStyle, rely on image/effects
          // super.draw(ctx, camera); // REMOVED - Draw image instead

          // --- Draw Player Image ---
          let currentImage = this.imgStandard; // Always use standard image

          if (currentImage && currentImage.complete && currentImage.naturalWidth > 0) {
              const drawWidth = this.visualSize.x; // Use visual size for drawing sprite
              const drawHeight = this.visualSize.y;
              ctx.drawImage(
                  currentImage,
                  this.position.x - drawWidth / 2 - camera.x, // Center based on visual size
                  this.position.y - drawHeight / 2 - camera.y,
                  drawWidth,
                  drawHeight
              );
          } else {
              // Fallback drawing if images fail to load
              ctx.fillStyle = this.color; // Use original color
              ctx.fillRect(
                  this.position.x - this.size.x / 2 - camera.x,
                  this.position.y - this.size.y / 2 - camera.y,
                  this.size.x,
                  this.size.y
              );
          }
          // --- End Draw Player Image ---

          // --- Draw Hitbox Outline (Debug) ---
          ctx.strokeStyle = 'red';
          ctx.lineWidth = 1;
          ctx.strokeRect(
              this.position.x - this.size.x / 2 - camera.x,
              this.position.y - this.size.y / 2 - camera.y,
              this.size.x,
              this.size.y
          );
          // --- End Hitbox Outline ---

          ctx.restore(); // Restore context after potential alpha changes

          // --- Draw Overlays (Weapon Effects, Health Bar, Interaction Hint) ---
          // Health bar (moved from Entity.draw)
          if (this.health < this.maxHealth && this.health > 0) {
              const barWidth = this.visualSize.x; // Match health bar width to visual size
              const barHeight = 5;
              const barX = this.position.x - barWidth / 2 - camera.x;
              const barY = this.position.y - this.visualSize.y / 2 - barHeight - 5 - camera.y; // Position above visual sprite

              ctx.fillStyle = 'rgba(0,0,0,0.7)';
              ctx.fillRect(barX, barY, barWidth, barHeight);
              ctx.fillStyle = '#00ff00'; // Player health is green
              ctx.fillRect(barX, barY, (barWidth * this.health) / this.maxHealth, barHeight);
          }

          // Weapon effects
          if (this.weapons[this.currentWeaponIndex] === 'Knife' && this.knifeSwingTimer > 0) {
            const swingAngle = Math.PI / 2;
            const startAngle = this.velocity.magnitude() > 0 ? this.velocity.angle() - swingAngle / 2 : -Math.PI / 2 - swingAngle / 2;
            const endAngle = startAngle + swingAngle;

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(this.position.x - camera.x, this.position.y - camera.y, this.knifeRange * 0.8, startAngle, endAngle);
            ctx.stroke();
         }

         if (this.interactTarget) {
             ctx.fillStyle = 'white';
             ctx.font = '16px Orbitron';
             ctx.textAlign = 'center';
             // Position hint above the visual sprite using visualSize
             ctx.fillText(`[${this.interactKey.toUpperCase()}] Interact`, this.position.x - camera.x, this.position.y - this.visualSize.y / 2 - 15 - camera.y);
             ctx.textAlign = 'left';
         }

         if (this.weapons[this.currentWeaponIndex] === 'Gun' && this.gunFlashTimer > 0) {
             const flashSize = 15;
             const direction = this.velocity.magnitude() > 0 ? this.velocity.normalize() : Vector2.fromAngle(-Math.PI / 2);
             const flashX = this.position.x + direction.x * (this.size.x / 2 + 5) - camera.x;
             const flashY = this.position.y + direction.y * (this.size.y / 2 + 5) - camera.y;

             ctx.fillStyle = 'rgba(255, 255, 0, 0.9)';
             ctx.beginPath();
             ctx.arc(flashX, flashY, flashSize / 2, 0, Math.PI * 2);
             ctx.fill();
         }
    }

    attack(mousePos, camera, projectiles, settlements) {
        if (this.attackCooldown > 0) return;

        const weapon = this.weapons[this.currentWeaponIndex];

        if (weapon === 'Knife') {
            this.attackCooldown = this.knifeCooldown;
            this.knifeSwingTimer = this.knifeSwingDuration;
            settlements.forEach(settlement => {
                settlement.humans.forEach(human => {
                    if (this.position.distance(human.position) < this.knifeRange) {
                        human.takeDamage(this.knifeDamage, this, 'knife');
                    }
                });
            });

        } else if (weapon === 'Gun') {
            this.attackCooldown = this.gunCooldown;
            const targetWorldX = mousePos.x + camera.x;
            const targetWorldY = mousePos.y + camera.y;
            const direction = new Vector2(targetWorldX - this.position.x, targetWorldY - this.position.y).normalize();
            const projectileSpawnPos = this.position.add(direction.multiply(this.size.x / 2 + 5));

            projectiles.push(new Projectile(projectileSpawnPos, direction, this.gunDamage, true));
            this.gunFlashTimer = this.gunFlashDuration;

        } else if (weapon === 'Shotgun') {
            this.attackCooldown = this.shotgunCooldown;
            const targetWorldX = mousePos.x + camera.x;
            const targetWorldY = mousePos.y + camera.y;
            const baseDirection = new Vector2(targetWorldX - this.position.x, targetWorldY - this.position.y).normalize();
            const baseAngle = baseDirection.angle();

            for (let i = 0; i < this.shotgunPellets; i++) {
                const spreadAngle = (Math.random() - 0.5) * this.shotgunSpread;
                const pelletDirection = Vector2.fromAngle(baseAngle + spreadAngle);
                const projectileSpawnPos = this.position.add(pelletDirection.multiply(this.size.x / 2 + 5));
                projectiles.push(new Projectile(projectileSpawnPos, pelletDirection, this.shotgunDamage, true));
            }
            this.gunFlashTimer = this.gunFlashDuration;

            settlements.forEach(settlement => {
                if (this.position.distance(settlement.position) < settlement.radius + 400) {
                    settlement.alertSettlement(this.position, true);
                }
            });
        }
    }

    switchWeapon() {
        this.currentWeaponIndex = (this.currentWeaponIndex + 1) % this.weapons.length;
    }

    takeDamage(amount, gameOverCallback, source = null, killContext = 'other') {
        if (super.takeDamage(amount, source, killContext)) {
            gameOverCallback();
        }
    }

    constrainToWorld() {
        const halfWidth = this.size.x / 2;
        const halfHeight = this.size.y / 2;
        this.position.x = Math.max(halfWidth, Math.min(this.worldWidth - halfWidth, this.position.x));
        this.position.y = Math.max(halfHeight, Math.min(this.worldHeight - halfHeight, this.position.y));
    }
}

export class Human extends Entity {
    constructor(patrolPath, settlement, building, worldWidth, worldHeight) {
        super(patrolPath[0], new Vector2(25, 25), '#ff3a3a');
        this.isHuman = true;
        this.settlement = settlement;
        this.health = 150;
        this.maxHealth = 150;
        this.speed = 130;
        this.state = 'patrol';
        this.patrolPath = patrolPath;
        this.currentPatrolIndex = 0;
        this.alertLevel = 0;
        this.alertTimer = 0;
        this.target = null;
        this.investigationPoint = null;
        this.investigationSubPoints = [];
        this.currentInvestigationSubPointIndex = 0;
        this.attackRange = 300;
        this.attackDamage = 8;
        this.attackCooldown = 0;
        this.gunCooldown = 1.5 + Math.random();
        this.detectionRadius = 200;
        this.fieldOfView = Math.PI / 2;
        this.viewDirection = Vector2.fromAngle(Math.random() * Math.PI * 2);
        this.idleTimer = 0;
        this.lastSawPlayer = false;
        this.searchLookTimer = 0;
        this.currentPath = null;
        this.currentWaypointIndex = 0;
        this.pathRecalculateTimer = 0;
        this.pathGridSize = 25;
        this.gunFlashDuration = 0.05;
        this.gunFlashTimer = 0;
        this.initialAttackDelayTimer = 0;
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;
        this.building = building;
        this.doorInteractionCooldownTimer = 0;
        this.DOOR_INTERACTION_COOLDOWN = 0.5;
    }

    update(deltaTime, player, isLineOfSightClearFunc, projectiles, currentObstacles) {
        if (this.attackCooldown > 0) this.attackCooldown -= deltaTime;
        if (this.initialAttackDelayTimer > 0) this.initialAttackDelayTimer -= deltaTime;
        if (this.doorInteractionCooldownTimer > 0) this.doorInteractionCooldownTimer -= deltaTime;
        if (this.alertTimer > 0) {
            this.alertTimer -= deltaTime;
             if (this.alertTimer <= 0 && this.state !== 'patrol') {
                  this.alertLevel = 0;
                  this.investigationPoint = null;
                  this.investigationSubPoints = [];
                  this.currentInvestigationSubPointIndex = 0;
                  this.state = 'patrol';
                  this.calculatePath(this.patrolPath[this.currentPatrolIndex], currentObstacles);
            }
        }
        if (this.pathRecalculateTimer > 0) this.pathRecalculateTimer -= deltaTime;
        if (this.gunFlashTimer > 0) this.gunFlashTimer -= deltaTime;

        if (this.state !== 'attack') {
            this.detectPlayer(deltaTime, player, isLineOfSightClearFunc, currentObstacles);
        }

        const previousVelocity = new Vector2(this.velocity.x, this.velocity.y);

        switch (this.state) {
            case 'patrol': this.patrol(deltaTime, currentObstacles); break;
            case 'chase': this.chase(deltaTime, player, currentObstacles); break;
            case 'attack': this.attack(deltaTime, player, isLineOfSightClearFunc, projectiles, currentObstacles); break;
            case 'alert': this.alertState(deltaTime, currentObstacles); break;
            case 'idle': this.idle(deltaTime, currentObstacles); break;
        }

        const separationRadius = 40;
        const separationForceMultiplier = 80;
        let separationVector = new Vector2(0, 0);
        let neighbors = 0;

        if (this.state !== 'attack' && !(this.state === 'chase' && this.target === player.position)) {
            this.settlement.humans.forEach(otherHuman => {
                if (otherHuman === this) return;
                const distance = this.position.distance(otherHuman.position);
                if (distance < separationRadius && distance > 0) {
                    const awayVector = this.position.subtract(otherHuman.position).normalize();
                    separationVector = separationVector.add(awayVector.multiply(1 / distance));
                    neighbors++;
                }
            });
        }

        if (neighbors > 0) {
            separationVector = separationVector.normalize().multiply(separationForceMultiplier);
            this.velocity = this.velocity.add(separationVector.multiply(deltaTime));
        }

        const previousPosition = this.position.clone();
        const allDoorsForHuman = this.settlement ? this.settlement.getAllStructureDoors() : [];
        super.update(deltaTime, currentObstacles, allDoorsForHuman);

        const moved = this.position.distanceSq(previousPosition) > (this.speed * deltaTime * 0.1) ** 2;
        const shouldBeMoving = this.currentPath && this.currentWaypointIndex < this.currentPath.length && (this.state === 'patrol' || this.state === 'chase' || this.state === 'alert');

        if (shouldBeMoving && !moved && this.doorInteractionCooldownTimer <= 0) {
            const checkRadius = this.size.x * 1.5;

            const targetWaypoint = this.currentPath[this.currentWaypointIndex];

            if (!(targetWaypoint instanceof Vector2)) {
                this.currentPath = null;
                this.state = 'idle';
                this.idleTimer = 0.5;
                return;
            }

            const directionToWaypoint = targetWaypoint.subtract(this.position).normalize();

            if (!(directionToWaypoint instanceof Vector2)) {
                 return;
            }

            if (directionToWaypoint.magnitudeSq() > 0.001) {
                for (const obstacle of currentObstacles) {
                    if (obstacle instanceof Door && !obstacle.isOpen) {
                        const distToDoor = this.position.distance(obstacle.position);
                        if (distToDoor < checkRadius) {
                            const directionToDoor = obstacle.position.subtract(this.position).normalize();

                            if (!(directionToWaypoint instanceof Vector2) || !(directionToDoor instanceof Vector2)) {
                                continue;
                            }

                            if (directionToDoor.magnitudeSq() > 0.001 && typeof directionToWaypoint.dot === 'function') {
                                const dotProduct = directionToWaypoint.dot(directionToDoor);
                                if (dotProduct > 0.7) {
                                    obstacle.open();
                                    this.doorInteractionCooldownTimer = this.DOOR_INTERACTION_COOLDOWN;
                                    this.velocity = new Vector2(0, 0);
                                    break;
                                }
                            } else if (directionToDoor.magnitudeSq() > 0.001) {
                            }
                        }
                    }
                }
            }
        }
    }

    detectPlayer(deltaTime, player, isLineOfSightClearFunc, currentObstacles) {
        const distanceToPlayer = this.position.distance(player.position);
        let canSeePlayer = false;

        if (distanceToPlayer < this.detectionRadius * player.detectionMultiplier) {
            const vectorToPlayer = player.position.subtract(this.position);
            const angleToPlayer = vectorToPlayer.angle();

            const viewAngle = this.viewDirection.angle();
            let angleDifference = Math.abs(angleToPlayer - viewAngle);
            if (angleDifference > Math.PI) angleDifference = 2 * Math.PI - angleDifference;

            if (angleDifference < this.fieldOfView / 2) {
                if (isLineOfSightClearFunc(this.position, player.position, currentObstacles)) {
                    canSeePlayer = true;
                }
            }
        }

        const previousState = this.state;
        let justBecameAlerted = false;

        if (canSeePlayer) {
            this.target = player.position;
            this.investigationPoint = null;
            this.investigationSubPoints = [];
            this.currentInvestigationSubPointIndex = 0;
            this.alertLevel = 2;
            this.alertTimer = 15;
            this.lastSawPlayer = true;

            if (distanceToPlayer < this.attackRange && isLineOfSightClearFunc(this.position, player.position, currentObstacles)) {
                if (previousState !== 'attack') {
                    justBecameAlerted = true;
                    this.initialAttackDelayTimer = 0.3 + Math.random() * 0.4;
                }
                this.state = 'attack';
                this.currentPath = null;
            } else {
                if (previousState !== 'chase' && previousState !== 'attack') justBecameAlerted = true;
                this.state = 'chase';
                if (previousState !== 'chase' || !this.currentPath || this.currentWaypointIndex >= this.currentPath.length) {
                    this.calculatePath(player.position, currentObstacles);
                } else {
                    const lastWaypoint = this.currentPath[this.currentPath.length - 1];
                    if (player.position.distance(lastWaypoint) > this.pathGridSize * 2 && this.pathRecalculateTimer <= 0) {
                        this.calculatePath(player.position, currentObstacles);
                    }
                }
            }
            if (justBecameAlerted && this.settlement) {
                this.settlement.notifyAlliesOfAlert(this);
            }
        } else {
            if (this.lastSawPlayer && this.state !== 'alert') {
                this.state = 'alert';
                this.target = player.lastPosition;
                this.setInvestigationPoint(player.lastPosition, currentObstacles);
                this.alertLevel = 1;
                this.alertTimer = 12;
            } else if (this.state === 'alert' && this.alertTimer <= 0) {
                this.state = 'patrol';
                this.target = null;
                this.investigationPoint = null;
                this.investigationSubPoints = [];
                this.currentInvestigationSubPointIndex = 0;
                this.currentPath = null;
                this.calculatePath(this.patrolPath[this.currentPatrolIndex], currentObstacles);
            } else if (this.state === 'chase' && this.alertTimer <= 0) {
                this.state = 'alert';
                this.target = player.lastPosition;
                this.setInvestigationPoint(player.lastPosition, currentObstacles);
                this.alertLevel = 1;
                this.alertTimer = 12;
            }
            this.lastSawPlayer = false;
        }
    }


    patrol(deltaTime, currentObstacles) {
        this.velocity = new Vector2(0, 0);
        if (!this.patrolPath || this.patrolPath.length < 1) {
            this.state = 'idle'; this.idleTimer = 1.0; return;
        }

        if (!this.currentPath || this.currentWaypointIndex >= this.currentPath.length) {
            this.state = 'idle';
            this.idleTimer = 0.8 + Math.random() * 0.7;
            this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.patrolPath.length;
            this.target = this.patrolPath[this.currentPatrolIndex];
            return;
        }

        const targetWaypoint = this.currentPath[this.currentWaypointIndex];
        const distanceToWaypoint = this.position.distance(targetWaypoint);

        if (distanceToWaypoint < this.pathGridSize / 2) {
            this.currentWaypointIndex++;
            if (this.currentWaypointIndex >= this.currentPath.length) {
                this.currentPath = null;
                this.state = 'idle';
                this.idleTimer = 1.0 + Math.random();
                return;
            }
        }

        if (this.currentPath && this.currentWaypointIndex < this.currentPath.length) {
            const currentTargetWaypoint = this.currentPath[this.currentWaypointIndex];
            const direction = currentTargetWaypoint.subtract(this.position).normalize();
            this.velocity = direction.multiply(this.speed * 0.5);
            if (this.velocity.magnitude() > 0.1) this.viewDirection = direction;
        }
    }

    idle(deltaTime, currentObstacles) {
        this.velocity = new Vector2(0, 0);
        this.idleTimer -= deltaTime;

        if (this.alertLevel > 0 && this.investigationPoint) {
            this.searchLookTimer -= deltaTime;
            if (this.searchLookTimer <= 0) {
                this.viewDirection = Vector2.fromAngle(this.viewDirection.angle() + (Math.random() - 0.5) * 1.8);
                this.searchLookTimer = 0.4 + Math.random() * 0.4;
            }
        }

        if (this.idleTimer <= 0) {
            let nextTarget = null;
            let nextState = 'patrol';

            if (this.alertLevel > 0) {
                if (this.alertTimer <= 0) {
                    this.alertLevel = 0;
                    this.investigationPoint = null;
                    this.investigationSubPoints = [];
                    this.currentInvestigationSubPointIndex = 0;
                    nextTarget = this.patrolPath[this.currentPatrolIndex];
                    nextState = 'patrol';
                } else if (this.investigationPoint) {
                    if (this.currentInvestigationSubPointIndex >= this.investigationSubPoints.length) {
                        this.setInvestigationPoint(this.investigationPoint, currentObstacles, true);
                        nextTarget = this.investigationPoint;
                        nextState = 'alert';
                    } else {
                        nextTarget = this.investigationSubPoints[this.currentInvestigationSubPointIndex];
                        nextState = 'alert';
                    }
                } else {
                    this.alertLevel = 0;
                    nextTarget = this.patrolPath[this.currentPatrolIndex];
                    nextState = 'patrol';
                }
            }
            else {
                nextTarget = this.patrolPath[this.currentPatrolIndex];
                nextState = 'patrol';
            }

            this.target = nextTarget;
            if (this.target) {
                this.calculatePath(this.target, currentObstacles);
            } else {
                this.currentPath = null;
                nextState = 'patrol';
                this.target = this.patrolPath[this.currentPatrolIndex];
                if (this.target) this.calculatePath(this.target, currentObstacles);
            }
            this.state = nextState;
        }
    }

    chase(deltaTime, player, currentObstacles) {
        if (!this.target || !player || player.health <= 0) {
            this.state = 'patrol'; this.currentPath = null; this.calculatePath(this.patrolPath[this.currentPatrolIndex], currentObstacles); return;
        }

        this.target = player.position;

        if (this.pathRecalculateTimer <= 0) {
            this.calculatePath(this.target, currentObstacles);
        }

        if (!this.currentPath || this.currentWaypointIndex >= this.currentPath.length) {
            const direction = this.target.subtract(this.position).normalize();
            this.velocity = direction.multiply(this.speed);
            if (this.velocity.magnitude() > 0.1) this.viewDirection = direction;
            if (this.pathRecalculateTimer <= 0) this.calculatePath(this.target, currentObstacles);
            return;
        }

        const targetWaypoint = this.currentPath[this.currentWaypointIndex];
        const distanceToWaypoint = this.position.distance(targetWaypoint);

        if (distanceToWaypoint < this.pathGridSize / 2) {
            this.currentWaypointIndex++;
            if (this.currentWaypointIndex >= this.currentPath.length) {
                if (this.pathRecalculateTimer <= 0) this.calculatePath(this.target, currentObstacles);
                this.velocity = new Vector2(0, 0);
                return;
            }
        }

        const currentTargetWaypoint = this.currentPath[this.currentWaypointIndex];
        const direction = currentTargetWaypoint.subtract(this.position).normalize();
        this.velocity = direction.multiply(this.speed);
        if (this.velocity.magnitude() > 0.1) this.viewDirection = direction;
    }

    attack(deltaTime, player, isLineOfSightClearFunc, projectiles, currentObstacles) {
        const distanceToPlayer = this.position.distance(player.position);

        let shouldStopAttacking = !player || player.health <= 0 ||
                                  distanceToPlayer > this.attackRange * 1.1 ||
                                  !isLineOfSightClearFunc(this.position, player.position, currentObstacles);

        if (shouldStopAttacking) {
            this.target = player ? player.position : this.position;
            this.state = 'chase';
            this.alertLevel = 2;
            this.alertTimer = 15;
            this.calculatePath(this.target, currentObstacles);
            return;
        }

        this.currentPath = null;
        this.velocity = new Vector2(0, 0);
        const directionToPlayer = player.position.subtract(this.position).normalize();
        this.viewDirection = directionToPlayer;

        if (this.attackCooldown <= 0 && this.initialAttackDelayTimer <= 0) {
            const projectileSpawnPos = this.position.add(directionToPlayer.multiply(this.size.x / 2 + 5));
            projectiles.push(new Projectile(projectileSpawnPos, directionToPlayer, this.attackDamage, false));
            this.attackCooldown = this.gunCooldown;
            this.gunFlashTimer = this.gunFlashDuration;
        }
    }

    alertState(deltaTime, currentObstacles) {
        if (!this.target) {
            this.state = 'idle';
            this.idleTimer = 0.5;
            this.velocity = new Vector2(0, 0);
            return;
        }

        if (this.currentPath && this.currentWaypointIndex < this.currentPath.length) {
            const targetWaypoint = this.currentPath[this.currentWaypointIndex];
            const distanceToWaypoint = this.position.distance(targetWaypoint);

            if (distanceToWaypoint < this.pathGridSize / 2) {
                this.currentWaypointIndex++;
                if (this.currentWaypointIndex >= this.currentPath.length) {
                    this.velocity = new Vector2(0, 0);
                    this.currentPath = null;
                    this.state = 'idle';
                    this.idleTimer = 0.8 + Math.random() * 0.7;
                    this.searchLookTimer = 0;

                    if (this.alertLevel > 0 && this.investigationSubPoints.includes(this.target)) {
                        this.currentInvestigationSubPointIndex++;
                    }
                    return;
                }
            }

            if (this.currentPath && this.currentWaypointIndex < this.currentPath.length) {
                const nextWaypoint = this.currentPath[this.currentWaypointIndex];
                const direction = nextWaypoint.subtract(this.position).normalize();
                this.velocity = direction.multiply(this.speed * 0.8);
                if (this.velocity.magnitude() > 0.1) this.viewDirection = direction;
            } else {
                this.velocity = new Vector2(0, 0);
            }

        } else {
            this.velocity = new Vector2(0, 0);
            if (this.target && this.pathRecalculateTimer <= 0 && this.state !== 'idle') {
                this.calculatePath(this.target, currentObstacles);
                if (!this.currentPath) {
                    this.state = 'idle';
                    this.idleTimer = 0.5 + Math.random() * 0.5;
                }
            } else if (this.state !== 'idle') {
                this.state = 'idle';
                this.idleTimer = 0.5;
            }
        }
    }

    setInvestigationPoint(point, currentObstacles, isReinvestigation = false) {
        this.investigationPoint = point;
        this.investigationSubPoints = [];
        if (!isReinvestigation) {
            this.currentInvestigationSubPointIndex = 0;
        }
        const numSubPoints = 3 + Math.floor(Math.random() * 2);
        for (let i = 0; i < numSubPoints; i++) {
            const angle = (i / numSubPoints) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            const dist = Math.random() * 40 + 30;
            let subPoint = point.add(Vector2.fromAngle(angle, dist));


            if (!this.isPointInObstaclesList(subPoint, currentObstacles)) {
                this.investigationSubPoints.push(subPoint);
            }
        }

        this.calculatePath(this.investigationPoint, currentObstacles);
        this.target = this.investigationPoint;

        if (!this.currentPath && this.investigationSubPoints.length > 0) {
            this.target = this.investigationSubPoints[0];
            this.calculatePath(this.target, currentObstacles);
            this.currentInvestigationSubPointIndex = 0;
        } else if (!this.currentPath) {
            this.state = 'idle';
            this.idleTimer = 1.0;
        }
    }


    alert(investigationPos, alertLevel = 1, isGunshot = false) {
        if (alertLevel < this.alertLevel && (this.state === 'chase' || this.state === 'attack' || this.alertLevel === 2)) return;


        const offset = Vector2.fromAngle(Math.random() * Math.PI * 2, Math.random() * 20 + 10);
        const finalInvestigationPos = investigationPos.add(offset);

        const previousAlertLevel = this.alertLevel;
        this.alertLevel = Math.max(this.alertLevel, alertLevel);
        this.alertTimer = Math.max(this.alertTimer, isGunshot ? 25 : 18);

        const setNewPoint = this.alertLevel > previousAlertLevel || !this.investigationPoint || finalInvestigationPos.distance(this.investigationPoint) > 100;

        if (setNewPoint && this.state !== 'attack') {

            this.investigationPoint = finalInvestigationPos;
            this.investigationSubPoints = [];
            this.currentInvestigationSubPointIndex = 0;
            this.target = finalInvestigationPos;
            this.state = 'alert';
            this.currentPath = null;
        } else if (this.state !== 'attack' && this.state !== 'chase') {
             this.state = 'alert';
        }
    }

    isPointInObstaclesList(point, obstacles) {
        for (const obstacle of obstacles) {
            const rect = obstacle.getRectData();
            if (
                point.x > rect.x - rect.width / 2 &&
                point.x < rect.x + rect.width / 2 &&
                point.y > rect.y - rect.height / 2 &&
                point.y < rect.y + rect.height / 2
            ) { return true; }
        }
        return false;
    }


    calculatePath(targetPos, obstacles) {
        if (!targetPos) {
            this.currentPath = null;
            this.currentWaypointIndex = 0;
            return;
        }
        if (this.pathRecalculateTimer > 0) return;

        const minX = Math.min(this.position.x, targetPos.x) - 200;
        const maxX = Math.max(this.position.x, targetPos.x) + 200;
        const minY = Math.min(this.position.y, targetPos.y) - 200;
        const maxY = Math.max(this.position.y, targetPos.y) + 200;
        const pathBounds = {
             minX: Math.max(0, minX),
             maxX: Math.min(this.worldWidth, maxX),
             minY: Math.max(0, minY),
             maxY: Math.min(this.worldHeight, maxY),
        };

        const newPath = findPath(this.position, targetPos, obstacles, pathBounds, this.pathGridSize);

        if (newPath && newPath.length > 1) {
            this.currentPath = newPath;
            this.currentWaypointIndex = 1;
            this.pathRecalculateTimer = 0.3 + Math.random() * 0.2;
        } else {
            this.currentPath = null;
            this.currentWaypointIndex = 0;
            if (this.state !== 'attack' && this.state !== 'chase') {
                 this.state = 'idle';
                 this.idleTimer = 0.5 + Math.random() * 0.5;
            }
        }
    }


    draw(ctx, camera) {
         super.draw(ctx, camera);

         if (this.alertLevel === 1) {
              ctx.fillStyle = 'yellow';
              ctx.font = '16px Orbitron';
              ctx.fillText('?', this.position.x - camera.x - 5, this.position.y - camera.y - this.size.y / 2 - 15);
         } else if (this.alertLevel === 2) {
              ctx.fillStyle = 'red';
              ctx.font = '16px Orbitron';
              ctx.fillText('!', this.position.x - camera.x - 5, this.position.y - camera.y - this.size.y / 2 - 15);
         }

         if (this.gunFlashTimer > 0) {
             const flashSize = 12;
             const flashX = this.position.x + this.viewDirection.x * (this.size.x / 2 + 5) - camera.x;
             const flashY = this.position.y + this.viewDirection.y * (this.size.y / 2 + 5) - camera.y;

             ctx.fillStyle = 'rgba(255, 165, 0, 0.9)';
             ctx.beginPath();
             ctx.arc(flashX, flashY, flashSize / 2, 0, Math.PI * 2);
             ctx.fill();
         }
    }

    takeDamage(amount, source = null, killContext = 'other') {
         const died = super.takeDamage(amount, source, killContext);
         if (!died && source && source.isPlayer) {
              this.alert(source.position, 2, killContext === 'gun');
         }
         return died;
    }
}

 export class Projectile {
    constructor(position, direction, damage, isPlayerBullet) {
        this.position = position;
        this.velocity = direction.multiply(800);
        this.damage = damage;
        this.isPlayerBullet = isPlayerBullet;
        this.size = 5;
        this.color = isPlayerBullet ? '#00ffff' : '#ffaa00';
        this.lifeTime = 2;
    }

    update(deltaTime, settlements, player, gameOverCallback) {
        const prevPos = new Vector2(this.position.x, this.position.y);
        this.position = this.position.add(this.velocity.multiply(deltaTime));
        this.lifeTime -= deltaTime;

        let hitObstacle = false;
        settlements.forEach(settlement => {
             if (hitObstacle) return;
             const currentObstacles = settlement.getActiveObstacles();
             currentObstacles.forEach(obstacle => {
                  if (hitObstacle) return;
                  if (lineIntersectsRect(prevPos, this.position, obstacle.getRectData())) {
                       this.lifeTime = 0;
                       hitObstacle = true;
                  }
             });
        });
        if (hitObstacle || this.lifeTime <= 0) return;


        if (this.isPlayerBullet) {
            settlements.forEach(settlement => {
                settlement.humans.forEach(human => {
                    if (this.lifeTime > 0 && this.position.distance(human.position) < (this.size + human.size.x) / 2) {
                        if (human.takeDamage(this.damage, player, 'gun')) {
                        }
                        this.lifeTime = 0;
                    }
                });
            });
        } else {
            if (this.lifeTime > 0 && this.position.distance(player.position) < (this.size + player.size.x) / 2) {
                player.takeDamage(this.damage, gameOverCallback, null, 'gun');
                this.lifeTime = 0;
            }
        }
    }

    draw(ctx, camera) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.position.x - camera.x, this.position.y - camera.y, this.size / 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

export class Item extends Entity {
    constructor(position, itemType, quantity = 1) {
        let size = new Vector2(15, 15);
        let color = '#ffffff'; // Default white
        if (itemType === 'Plasma') {
            color = '#00ffff'; // Cyan for Plasma
        } else if (itemType === 'Medkit') {
            color = '#ff6b6b'; // Reddish for Medkit
        }
        // Add more item types and their appearances here

        super(position, size, color);
        this.itemType = itemType;
        this.quantity = quantity;
        this.isInteractable = true; // Can be picked up
        this.pickupRadius = 30;
    }

    interact(player) {
        // Logic for player picking up the item
        // This might be better handled in the player or game loop based on proximity
        console.log(`Player picked up ${this.quantity} ${this.itemType}`);
        // In a real implementation, add to player inventory and remove this item entity
        return { pickedUp: true, type: this.itemType, quantity: this.quantity };
    }

    draw(ctx, camera) {
        // Simple drawing for now
        ctx.fillStyle = this.color;
        ctx.beginPath();
        // Draw a diamond shape for items
        const halfW = this.size.x / 2;
        const halfH = this.size.y / 2;
        ctx.moveTo(this.position.x - camera.x, this.position.y - halfH - camera.y); // Top point
        ctx.lineTo(this.position.x + halfW - camera.x, this.position.y - camera.y); // Right point
        ctx.lineTo(this.position.x - camera.x, this.position.y + halfH - camera.y); // Bottom point
        ctx.lineTo(this.position.x - halfW - camera.x, this.position.y - camera.y); // Left point
        ctx.closePath();
        ctx.fill();

        // Optional: Draw quantity if > 1
        // if (this.quantity > 1) {
        //     ctx.fillStyle = 'black';
        //     ctx.font = '10px Arial';
        //     ctx.textAlign = 'center';
        //     ctx.fillText(this.quantity, this.position.x - camera.x, this.position.y + 4 - camera.y);
        //     ctx.textAlign = 'left';
        // }
    }

     update(deltaTime, currentObstacles, allDoors = []) {
        // Items generally don't move or update themselves
    }

    takeDamage(amount, source = null, killContext = 'other') {
        return false; // Items can't take damage
    }

    getRectData() {
        // Provide a bounding box if needed for quadtrees or broad-phase collision
        return {
            x: this.position.x,
            y: this.position.y,
            width: this.size.x,
            height: this.size.y
        };
    }
}


export class HeavyHuman extends Human {
    constructor(patrolPath, settlement, building, worldWidth, worldHeight) {
        if (typeof building === 'undefined') {
        }
        super(patrolPath, settlement, building, worldWidth, worldHeight);
        this.size = new Vector2(40, 40);
        this.color = '#cc0000';
        this.health = 300;
        this.maxHealth = 300;
        this.speed = 90; // Slower speed
        this.attackDamage = 12; // Slightly more damage
        this.gunCooldown = 2.0 + Math.random() * 0.5; // Slower fire rate
        // Inherits other properties and methods from Human
    }

}

export class Chest extends Entity {
    constructor(position, items = []) {
        super(position, new Vector2(35, 30), '#8B4513'); // Brown color, slightly wider than tall
        this.isOpen = false;
        this.items = items; // Array of items (e.g., { name: 'Medkit', quantity: 1 })
        this.isInteractable = true; // Flag for player interaction system
    }

    interact(player) { // Accept player in case interaction depends on player state later
        if (!this.isOpen) {
            this.isOpen = true;
            this.color = '#A0522D'; // Change color to indicate opened state

            const plasmaIndex = this.items.findIndex(item => item.name === 'Plasma');
            let spawnedItemDetails = null;

            if (plasmaIndex !== -1) {
                const plasmaItem = this.items.splice(plasmaIndex, 1)[0]; // Remove plasma from chest

                // Calculate spawn position slightly offset from the chest
                const spawnOffset = new Vector2(0, this.size.y / 2 + 10); // Spawn below the chest
                const spawnPosition = this.position.add(spawnOffset);

                spawnedItemDetails = {
                    type: plasmaItem.name,
                    quantity: plasmaItem.quantity,
                    position: spawnPosition
                };
                 this.isInteractable = false; // Cannot interact again once opened and emptied (or just opened)
                 return { itemSpawned: spawnedItemDetails };
            } else {
                 this.isInteractable = false; // Cannot interact again once opened (even if empty initially)
                 return { itemSpawned: null }; // Opened, but no plasma found
            }
        }
        // Already open, do nothing
        return null;
    }

    draw(ctx, camera) {
        // Basic rectangle drawing for now
        ctx.fillStyle = this.color;
        ctx.fillRect(
            this.position.x - this.size.x / 2 - camera.x,
            this.position.y - this.size.y / 2 - camera.y,
            this.size.x,
            this.size.y
        );

        // Add a simple visual cue for open/closed state (e.g., a lid line)
        ctx.strokeStyle = '#50280e'; // Darker brown for outline/details
        ctx.lineWidth = 2;
        ctx.strokeRect(
            this.position.x - this.size.x / 2 - camera.x,
            this.position.y - this.size.y / 2 - camera.y,
            this.size.x,
            this.size.y
        );

        if (this.isOpen) {
            // Draw a line suggesting an open lid
            ctx.beginPath();
            ctx.moveTo(this.position.x - this.size.x / 2 - camera.x, this.position.y - this.size.y / 2 - camera.y);
            ctx.lineTo(this.position.x - camera.x, this.position.y - this.size.y / 2 - 10 - camera.y); // Lid angled up
            ctx.lineTo(this.position.x + this.size.x / 2 - camera.x, this.position.y - this.size.y / 2 - camera.y);
            ctx.stroke();
        }
    }

    // Chests don't need an update loop typically
    update(deltaTime, currentObstacles, allDoors = []) {
    }

    // Chests shouldn't take damage
    takeDamage(amount, source = null, killContext = 'other') {
        return false;
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
