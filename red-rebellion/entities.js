import { Vector2, lineIntersectsRect, lineIntersectsLine } from './utils.js';
import { findPath } from './pathfinding.js';

// Dependencies needed from main game scope:
// - settlements (Array of Settlement instances)
// - projectiles (Array of Projectile instances) -> Passed into Human.update -> Human.attack
// - player (Player instance)
// - camera (Object {x, y})
// - mousePos (Object {x, y})
// - worldWidth, worldHeight (Numbers)
// - gameOver (Function) -> Passed into Projectile.update as gameOverCallback
// - healthFill (DOM Element)
// - weaponDisplay (DOM Element)
// - isLineOfSightClear (Function defined below)

export class Obstacle {
     constructor(position, size) {
          this.position = position;
          this.size = size;
          this.color = '#555555';
     }

     draw(ctx, camera) {
          ctx.fillStyle = this.color;
          ctx.fillRect(
               this.position.x - this.size.x / 2 - camera.x,
               this.position.y - this.size.y / 2 - camera.y,
               this.size.x,
               this.size.y
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
        this.settlement = null; // Reference to the settlement this entity belongs to (if any)
    }

    update(deltaTime, settlements) { // Pass settlements for collision
        const prevPosition = new Vector2(this.position.x, this.position.y);
        // Apply velocity only if not zero
        if (this.velocity.x !== 0 || this.velocity.y !== 0) {
             this.position = this.position.add(this.velocity.multiply(deltaTime));
             // Obstacle collision handled by Human class now for pathfinding avoidance
             // Only player needs basic push-out collision
             if (this.isPlayer) {
                  this.checkObstacleCollisions(prevPosition, settlements);
             }
        }
    }

    // Basic push-out collision, primarily for player now
    checkObstacleCollisions(prevPosition, settlements) {
        let collisionResolved = false;
        const settlementsToCheck = [];
        if (this.settlement) { // Should only be relevant if player enters a settlement?
            settlementsToCheck.push(this.settlement);
        } else {
            settlements.forEach(s => {
                if (this.position.distance(s.position) < s.radius + 200) {
                    settlementsToCheck.push(s);
                }
            });
        }

        settlementsToCheck.forEach(settlement => {
             settlement.obstacles.forEach(obstacle => {
                  if (collisionResolved) return;
                  if (this.collidesWithRect(obstacle)) {
                       const currentPos = new Vector2(this.position.x, this.position.y);
                       const dx = currentPos.x - obstacle.position.x;
                       const dy = currentPos.y - obstacle.position.y;
                       const overlapX = (this.size.x / 2 + obstacle.size.x / 2) - Math.abs(dx);
                       const overlapY = (this.size.y / 2 + obstacle.size.y / 2) - Math.abs(dy);

                       if (overlapX < overlapY) {
                            this.position.x = prevPosition.x + Math.sign(dx) * 0.1;
                            this.position.y = prevPosition.y;
                            this.velocity.x *= -0.1;
                       } else {
                            this.position.y = prevPosition.y + Math.sign(dy) * 0.1;
                            this.position.x = prevPosition.x;
                            this.velocity.y *= -0.1;
                       }
                       if (this.collidesWithRect(obstacle)) {
                            this.position = prevPosition;
                            this.velocity = new Vector2(0,0);
                       }
                       collisionResolved = true;
                  }
             });
        });
    }


    collidesWithRect(obstacle) {
        const halfWidth = this.size.x / 2;
        const halfHeight = this.size.y / 2;
        const obsHalfWidth = obstacle.size.x / 2;
        const obsHalfHeight = obstacle.size.y / 2;

        return (
            this.position.x + halfWidth > obstacle.position.x - obsHalfWidth &&
            this.position.x - halfWidth < obstacle.position.x + obsHalfWidth &&
            this.position.y + halfHeight > obstacle.position.y - obsHalfHeight &&
            this.position.y - halfHeight < obstacle.position.y + obsHalfHeight
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

        // Draw health bar (requires healthFill element reference or callback)
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
        if (died && this.isHuman && this.settlement) { // Check if settlement exists
             this.settlement.notifyHumanDeath(this, source, killContext);
        }
        return died;
    }
}

export class Player extends Entity {
    constructor(position, worldWidth, worldHeight) { // Pass world dimensions
        super(position, new Vector2(30, 30), '#00ff00');
        this.health = 25;
        this.maxHealth = 25;
        this.isPlayer = true;
        this.baseSpeed = 250;
        this.sneakSpeed = 100;
        this.speed = this.baseSpeed;
        this.isSneaking = false;
        this.weapons = ['Knife', 'Gun'];
        this.currentWeaponIndex = 0;
        this.attackCooldown = 0;
        this.knifeRange = 45;
        this.knifeDamage = 1000;
        this.gunDamage = 30;
        this.gunCooldown = 0.2;
        this.knifeCooldown = 0.5;
        this.detectionMultiplier = 1.0;
        this.lastPosition = new Vector2(position.x, position.y);
        this.worldWidth = worldWidth; // Store world dimensions
        this.worldHeight = worldHeight;
    }

    update(deltaTime, keys, settlements, healthFill, weaponDisplay) { // Pass dependencies
        const wasSneaking = this.isSneaking;
        this.lastPosition = new Vector2(this.position.x, this.position.y);

        if (keys.shift && !this.isSneaking) {
            this.isSneaking = true;
            this.speed = this.sneakSpeed;
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

        this.velocity = new Vector2(0, 0);
        if (keys.w) this.velocity.y -= 1;
        if (keys.s) this.velocity.y += 1;
        if (keys.a) this.velocity.x -= 1;
        if (keys.d) this.velocity.x += 1;

        if (this.velocity.magnitude() > 0) {
            this.velocity = this.velocity.normalize().multiply(this.speed);
        }

        super.update(deltaTime, settlements); // Pass settlements to parent update
        this.constrainToWorld();

        if (keys.e) {
            this.switchWeapon();
            keys.e = false;
        }

        if (this.attackCooldown > 0) {
            this.attackCooldown -= deltaTime;
        }

        healthFill.style.width = `${Math.max(0, (this.health / this.maxHealth) * 100)}%`;
        weaponDisplay.textContent = `Weapon: ${this.weapons[this.currentWeaponIndex]}`;
    }

    draw(ctx, camera) {
         ctx.save();
         if (this.isSneaking) {
             ctx.globalAlpha = 0.6;
         }
         super.draw(ctx, camera);
         ctx.restore();

         // Draw knife range indicator during attack cooldown
         if (this.weapons[this.currentWeaponIndex] === 'Knife' && this.attackCooldown > 0 && this.attackCooldown < 0.1) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(this.position.x - camera.x, this.position.y - camera.y, this.knifeRange, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    attack(mousePos, camera, projectiles, settlements) { // Pass dependencies
        if (this.attackCooldown > 0) return;

        const weapon = this.weapons[this.currentWeaponIndex];

        if (weapon === 'Knife') {
            this.attackCooldown = this.knifeCooldown;
            let killed = false;
            // Find settlements near the player to check for humans
            settlements.forEach(settlement => {
                if (this.position.distance(settlement.position) < settlement.radius + this.knifeRange + 50) { // Check nearby settlements
                    settlement.humans.forEach(human => {
                        if (!killed && this.position.distance(human.position) < this.knifeRange) {
                            // Simple distance check for knife hit
                            if (human.takeDamage(this.knifeDamage, this, 'knife')) {
                                killed = true; // Stop checking after one kill per swing
                            }
                        }
                    });
                }
            });
            // Add visual effect for knife swing in draw method if needed

        } else if (weapon === 'Gun') {
            this.attackCooldown = this.gunCooldown;
            const targetWorldX = mousePos.x + camera.x;
            const targetWorldY = mousePos.y + camera.y;
            const direction = new Vector2(targetWorldX - this.position.x, targetWorldY - this.position.y).normalize();

            projectiles.push(new Projectile(this.position.add(direction.multiply(20)), direction, this.gunDamage, true));

            // Alert nearby settlements on gunshot
            settlements.forEach(settlement => {
                if (this.position.distance(settlement.position) < settlement.radius + 400) { // Alert radius for gunshot
                    settlement.alertSettlement(this.position, true); // True indicates gunshot
                }
            });
        }
    }

    switchWeapon() {
        this.currentWeaponIndex = (this.currentWeaponIndex + 1) % this.weapons.length;
    }

    takeDamage(amount, gameOverCallback, source = null, killContext = 'other') { // Pass gameOver callback
        if (super.takeDamage(amount, source, killContext)) {
            gameOverCallback(); // Call the game over function passed from main scope
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
    constructor(patrolPath, settlement, worldWidth, worldHeight) { // Pass world dimensions
        super(patrolPath[0], new Vector2(25, 25), '#ff3a3a');
        this.isHuman = true;
        this.settlement = settlement; // Reference to its settlement
        this.health = 150;
        this.maxHealth = 150;
        this.speed = 130;
        this.state = 'patrol'; // patrol, chase, attack, alert, idle
        this.patrolPath = patrolPath;
        this.currentPatrolIndex = 0;
        this.alertLevel = 0; // 0: normal, 1: suspicious, 2: alerted
        this.alertTimer = 0;
        this.target = null; // Can be a position (Vector2) or null
        this.investigationPoint = null; // Center of investigation area
        this.investigationSubPoints = []; // Points around the investigation point to check
        this.currentInvestigationSubPointIndex = 0;
        this.attackRange = 300;
        this.attackDamage = 8;
        this.attackCooldown = 0;
        this.gunCooldown = 1.5 + Math.random(); // Time between shots
        this.detectionRadius = 200;
        this.fieldOfView = Math.PI / 2; // 90 degrees
        this.viewDirection = Vector2.fromAngle(Math.random() * Math.PI * 2);
        this.idleTimer = 0; // Timer for how long to stay idle
        this.lastSawPlayer = false; // Flag if player was seen in the previous frame
        this.searchLookTimer = 0; // Timer for looking around during idle/alert
        this.currentPath = null; // Array of Vector2 waypoints from A*
        this.currentWaypointIndex = 0;
        this.pathRecalculateTimer = 0; // Timer to limit path recalculation frequency
        this.pathGridSize = 25; // Grid size for pathfinding
        this.worldWidth = worldWidth; // Store world dimensions
        this.worldHeight = worldHeight;
    }

    update(deltaTime, player, isLineOfSightClearFunc, projectiles) { // Pass dependencies, including projectiles
        if (this.attackCooldown > 0) this.attackCooldown -= deltaTime;
        if (this.alertTimer > 0) {
             this.alertTimer -= deltaTime;
             if (this.alertTimer <= 0 && this.state !== 'patrol') { // Only reset if timer runs out AND not already patrolling
                  this.alertLevel = 0;
                  this.investigationPoint = null;
                  this.investigationSubPoints = [];
                  this.currentInvestigationSubPointIndex = 0;
                  this.state = 'patrol';
                  this.calculatePath(this.patrolPath[this.currentPatrolIndex]); // Path to next patrol point when alert ends
             }
        }
        if (this.pathRecalculateTimer > 0) this.pathRecalculateTimer -= deltaTime;

        if (this.state !== 'attack') {
            this.detectPlayer(deltaTime, player, isLineOfSightClearFunc);
        }

        // Store velocity before state logic potentially changes it
        const previousVelocity = new Vector2(this.velocity.x, this.velocity.y);

        switch (this.state) {
            case 'patrol': this.patrol(deltaTime); break;
            case 'chase': this.chase(deltaTime, player); break; // Pass player
            case 'attack': this.attack(deltaTime, player, isLineOfSightClearFunc, projectiles); break; // Pass player, LoS func, projectiles
            case 'alert': this.alertState(deltaTime); break;
            case 'idle': this.idle(deltaTime); break;
        }

        // --- Separation Behavior ---
        const separationRadius = 40;
        const separationForceMultiplier = 80;
        let separationVector = new Vector2(0, 0);
        let neighbors = 0;

        // Apply separation only if not attacking or chasing the player directly
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
            // Add separation force to the velocity calculated by the state logic
            this.velocity = this.velocity.add(separationVector.multiply(deltaTime));
        }
        // --- End Separation Behavior ---

        // Apply final velocity (no call to super.update needed as we handle position update here)
        if (this.velocity.x !== 0 || this.velocity.y !== 0) {
             this.position = this.position.add(this.velocity.multiply(deltaTime));
             // Humans don't need the basic push-out collision check anymore
        }
        this.constrainToSettlement();
    }

    detectPlayer(deltaTime, player, isLineOfSightClearFunc) { // Pass dependencies
        const distanceToPlayer = this.position.distance(player.position);
        let canSeePlayer = false;

        if (distanceToPlayer < this.detectionRadius * player.detectionMultiplier) {
            const vectorToPlayer = player.position.subtract(this.position);
            const angleToPlayer = vectorToPlayer.angle();
            const viewAngle = this.viewDirection.angle();
            let angleDifference = Math.abs(angleToPlayer - viewAngle);
            if (angleDifference > Math.PI) angleDifference = 2 * Math.PI - angleDifference;

            if (angleDifference < this.fieldOfView / 2) {
                // Use the passed function for LoS check
                if (isLineOfSightClearFunc(this.position, player.position, this.settlement.obstacles)) {
                     canSeePlayer = true;
                }
            }
        }

        const previousState = this.state;

        if (canSeePlayer) {
            this.target = player.position;
            this.investigationPoint = null; // Clear investigation if player is seen
            this.investigationSubPoints = [];
            this.currentInvestigationSubPointIndex = 0;
            this.alertLevel = 2;
            this.alertTimer = 15; // Longer alert timer when player seen
            this.lastSawPlayer = true;

            // Use the passed function for LoS check
            if (distanceToPlayer < this.attackRange && isLineOfSightClearFunc(this.position, player.position, this.settlement.obstacles)) {
                this.state = 'attack';
                this.currentPath = null; // Stop moving to attack
            } else {
                this.state = 'chase';
                // Recalculate path if not already chasing or path is finished/invalid
                if (previousState !== 'chase' || !this.currentPath || this.currentWaypointIndex >= this.currentPath.length) {
                     this.calculatePath(player.position);
                } else {
                     // Optional: More frequent path recalculation during chase
                     const lastWaypoint = this.currentPath[this.currentPath.length - 1];
                     if (player.position.distance(lastWaypoint) > this.pathGridSize * 2 && this.pathRecalculateTimer <= 0) {
                          this.calculatePath(player.position);
                     }
                }
            }
        } else {
             // Player not currently visible
             if (this.lastSawPlayer && this.state !== 'alert') {
                  // Transition to alert state only if we just lost sight
                  this.state = 'alert';
                  this.target = player.lastPosition; // Target last known position
                  this.setInvestigationPoint(player.lastPosition); // Start investigation
                  this.alertLevel = 1;
                  this.alertTimer = 12; // Set alert timer for investigation
             } else if (this.state === 'alert' && this.alertTimer <= 0) {
                  // If alert timer runs out while in alert state, switch to patrol
                  this.state = 'patrol';
                  this.target = null;
                  this.investigationPoint = null;
                  this.investigationSubPoints = [];
                  this.currentInvestigationSubPointIndex = 0;
                  this.currentPath = null;
                  this.calculatePath(this.patrolPath[this.currentPatrolIndex]);
             } else if (this.state === 'chase' && this.alertTimer <= 0) {
                 // If alert timer runs out while chasing (shouldn't happen often), go investigate last known pos
                 this.state = 'alert';
                 this.target = player.lastPosition;
                 this.setInvestigationPoint(player.lastPosition);
                 this.alertLevel = 1;
                 this.alertTimer = 12;
             }
             // If patrolling or idle, and alert timer is 0, stay in that state.
             this.lastSawPlayer = false; // Reset flag as player is not seen this frame
        }
    }

    patrol(deltaTime) {
         this.velocity = new Vector2(0, 0); // Default to no movement
         if (!this.patrolPath || this.patrolPath.length < 1) {
              this.state = 'idle'; this.idleTimer = 1.0; return;
         }

         // If no current path, or path finished, calculate path to next patrol point
         if (!this.currentPath || this.currentWaypointIndex >= this.currentPath.length) {
              this.state = 'idle'; // Go idle before calculating next path
              this.idleTimer = 0.8 + Math.random() * 0.7;
              this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.patrolPath.length;
              this.target = this.patrolPath[this.currentPatrolIndex];
              // Path calculation will happen when idle timer finishes
              return;
         }

         // Follow the current path
         const targetWaypoint = this.currentPath[this.currentWaypointIndex];
         const distanceToWaypoint = this.position.distance(targetWaypoint);

         if (distanceToWaypoint < this.pathGridSize / 2) {
              this.currentWaypointIndex++;
              // Check if path ended *after* incrementing
              if (this.currentWaypointIndex >= this.currentPath.length) {
                   this.currentPath = null; // Clear completed path
                   this.state = 'idle';     // Go idle at the patrol point
                   this.idleTimer = 1.0 + Math.random(); // Longer idle at patrol point
                   return; // Let idle state handle next logic
              }
         }

         // Move towards the current waypoint
         if (this.currentPath && this.currentWaypointIndex < this.currentPath.length) {
             const currentTargetWaypoint = this.currentPath[this.currentWaypointIndex];
             const direction = currentTargetWaypoint.subtract(this.position).normalize();
             this.velocity = direction.multiply(this.speed * 0.5); // Slower patrol speed
             if (this.velocity.magnitude() > 0.1) this.viewDirection = direction;
         }
    }

    idle(deltaTime) {
         this.velocity = new Vector2(0, 0); // Ensure no movement while idle
         this.idleTimer -= deltaTime;

         // Look around only if investigating
         if (this.alertLevel > 0 && this.investigationPoint) {
              this.searchLookTimer -= deltaTime;
              if (this.searchLookTimer <= 0) {
                   this.viewDirection = Vector2.fromAngle(this.viewDirection.angle() + (Math.random() - 0.5) * 1.8);
                   this.searchLookTimer = 0.4 + Math.random() * 0.4;
              }
         }

         if (this.idleTimer <= 0) {
              // --- Decision Logic after Idle Timer Expires ---
              let nextTarget = null;
              let nextState = 'patrol'; // Default to patrol if nothing else applies

              // 1. Check Alert Status
              if (this.alertLevel > 0) {
                   if (this.alertTimer <= 0) {
                        // Alert timed out. Clear alert info.
                        this.alertLevel = 0;
                        this.investigationPoint = null;
                        this.investigationSubPoints = [];
                        this.currentInvestigationSubPointIndex = 0;
                        nextTarget = this.patrolPath[this.currentPatrolIndex]; // Target next patrol point
                        nextState = 'patrol';
                   } else if (this.investigationPoint) {
                        // Alert active, continue investigation.
                        if (this.currentInvestigationSubPointIndex >= this.investigationSubPoints.length) {
                             // Finished sub-points, re-investigate main point (generates new sub-points)
                             this.setInvestigationPoint(this.investigationPoint, true); // Re-calc path to main point
                             nextTarget = this.investigationPoint;
                             nextState = 'alert';
                        } else {
                             // Move to next sub-point
                             nextTarget = this.investigationSubPoints[this.currentInvestigationSubPointIndex];
                             nextState = 'alert';
                        }
                   } else {
                        // Alert active but no investigation point? Fallback to patrol.
                        this.alertLevel = 0; // Clear inconsistent state
                        nextTarget = this.patrolPath[this.currentPatrolIndex];
                        nextState = 'patrol';
                   }
              }
              // 2. Normal Patrol Idle
              else {
                   // This case handles finishing idle after reaching a patrol point
                   nextTarget = this.patrolPath[this.currentPatrolIndex];
                   nextState = 'patrol';
              }

              // 3. Set Target, Calculate Path, and Set State
              this.target = nextTarget;
              if (this.target) {
                   this.calculatePath(this.target);
                   // If path calculation fails, target remains but path is null.
                   // The alert/patrol state will then transition back to idle to retry.
              } else {
                   this.currentPath = null; // Ensure no path if no target
                   nextState = 'patrol'; // Fallback to patrol if target somehow becomes null
                   this.target = this.patrolPath[this.currentPatrolIndex]; // Try setting patrol target
                   if(this.target) this.calculatePath(this.target); // Calculate path if possible
              }
              this.state = nextState;
         }
    }

    chase(deltaTime, player) { // Pass player
        if (!this.target || !player || player.health <= 0) { // Stop chasing if no target or player is dead
             this.state = 'patrol'; this.currentPath = null; this.calculatePath(this.patrolPath[this.currentPatrolIndex]); return;
        }

        // Update target to player's current position
        this.target = player.position;

        // Recalculate path frequently during chase if needed
        if (this.pathRecalculateTimer <= 0) {
             this.calculatePath(this.target);
        }

        if (!this.currentPath || this.currentWaypointIndex >= this.currentPath.length) {
             // Path finished or invalid, try direct movement towards target
             const direction = this.target.subtract(this.position).normalize();
             this.velocity = direction.multiply(this.speed);
             if (this.velocity.magnitude() > 0.1) this.viewDirection = direction;
             // Keep trying to pathfind if direct movement is used
             if (this.pathRecalculateTimer <= 0) this.calculatePath(this.target);
             return;
        }

        // --- Standard Path Following ---
        const targetWaypoint = this.currentPath[this.currentWaypointIndex];
        const distanceToWaypoint = this.position.distance(targetWaypoint);

        if (distanceToWaypoint < this.pathGridSize / 2) {
             this.currentWaypointIndex++;
             // Check again if path ended after incrementing
             if (this.currentWaypointIndex >= this.currentPath.length) {
                  // Reached end of path segment, but still chasing. Recalculate.
                  if (this.pathRecalculateTimer <= 0) this.calculatePath(this.target);
                  this.velocity = new Vector2(0, 0); // Stop briefly while recalculating
                  return;
             }
        }

        // Move towards the current waypoint
        const currentTargetWaypoint = this.currentPath[this.currentWaypointIndex]; // Re-fetch in case index changed
        const direction = currentTargetWaypoint.subtract(this.position).normalize();
        this.velocity = direction.multiply(this.speed);
        if (this.velocity.magnitude() > 0.1) this.viewDirection = direction;
    }

    attack(deltaTime, player, isLineOfSightClearFunc, projectiles) { // Pass dependencies, including projectiles
        const distanceToPlayer = this.position.distance(player.position);
        // Check if player is valid, in range, and has line of sight
        if (!player || player.health <= 0 || distanceToPlayer > this.attackRange * 1.1 || !isLineOfSightClearFunc(this.position, player.position, this.settlement.obstacles)) {
             this.target = player ? player.position : this.position; // Keep player as target if alive, else target self (effectively stop)
             this.state = 'chase'; // Go back to chasing if player moved out of range/sight or died
             this.alertLevel = 2; // Stay highly alerted
             this.alertTimer = 15; // Reset alert timer
             this.calculatePath(this.target); // Calculate path to chase
             return;
        }

        // --- Attack Logic ---
        this.currentPath = null; // Stop path following while attacking
        this.velocity = new Vector2(0, 0); // Stand still to shoot
        const directionToPlayer = player.position.subtract(this.position).normalize();
        this.viewDirection = directionToPlayer; // Face the player

        if (this.attackCooldown <= 0) {
             // Use the passed projectiles array
             projectiles.push(new Projectile(this.position.add(directionToPlayer.multiply(20)), directionToPlayer, this.attackDamage, false));
             this.attackCooldown = this.gunCooldown;
        }
    }

    alertState(deltaTime) { // Moving towards investigation point or sub-points
         if (!this.target) {
              // If no target in alert state, transition to idle to figure things out.
              this.state = 'idle';
              this.idleTimer = 0.5;
              this.velocity = new Vector2(0, 0);
              return;
         }

         // --- Path Following Logic (Only executed in 'alert' or 'patrol' state if path exists) ---
         if (this.currentPath && this.currentWaypointIndex < this.currentPath.length) {
              const targetWaypoint = this.currentPath[this.currentWaypointIndex];
              const distanceToWaypoint = this.position.distance(targetWaypoint);

              if (distanceToWaypoint < this.pathGridSize / 2) {
                   this.currentWaypointIndex++;
                   if (this.currentWaypointIndex >= this.currentPath.length) {
                        // Reached the end of the current path segment
                        this.velocity = new Vector2(0, 0);
                        this.currentPath = null; // Clear the completed path
                        this.state = 'idle';     // ALWAYS transition to idle after completing a path segment
                        this.idleTimer = 0.8 + Math.random() * 0.7; // Set idle timer
                        this.searchLookTimer = 0; // Reset search look timer

                        // Increment sub-point index ONLY if we were in alert state AND reached a sub-point
                        if (this.alertLevel > 0 && this.investigationSubPoints.includes(this.target)) {
                             this.currentInvestigationSubPointIndex++;
                        }
                        // If we reached the main investigation point, the idle state will handle moving to the first sub-point.
                        return; // Exit update, let idle state handle the next logic cycle
                   }
              }
              // Still moving along the current path
              if (this.currentPath && this.currentWaypointIndex < this.currentPath.length) { // Check path again as state might change
                  const nextWaypoint = this.currentPath[this.currentWaypointIndex];
                  const direction = nextWaypoint.subtract(this.position).normalize();
                  this.velocity = direction.multiply(this.speed * 0.8); // Slightly slower investigation speed
                  if (this.velocity.magnitude() > 0.1) this.viewDirection = direction;
              } else {
                  this.velocity = new Vector2(0,0); // Stop if path became invalid
              }

         } else {
              // No current path exists (or path failed)
              this.velocity = new Vector2(0, 0); // Stop moving
              if (this.target && this.pathRecalculateTimer <= 0 && this.state !== 'idle') {
                   // Attempt to recalculate path if we have a target, timer allows, and not already idle
                   this.calculatePath(this.target);
                   // If path calculation still results in no path, force idle state
                   if (!this.currentPath) {
                        this.state = 'idle';
                        this.idleTimer = 0.5 + Math.random() * 0.5;
                   }
              } else if (this.state !== 'idle') {
                   // No target, or timer active, and not already idle? Go idle.
                   this.state = 'idle';
                   this.idleTimer = 0.5;
              }
              // If already idle, the idle logic will handle what to do next.
         }
    }


    setInvestigationPoint(point, isReinvestigation = false) {
         this.investigationPoint = point; // The center of the search area
         this.investigationSubPoints = [];
         // Reset sub-point index only if it's a new investigation, not a re-investigation loop
         if (!isReinvestigation) {
             this.currentInvestigationSubPointIndex = 0;
         }
         const numSubPoints = 3 + Math.floor(Math.random() * 2); // 3 or 4 sub-points
         for (let i = 0; i < numSubPoints; i++) {
              const angle = (i / numSubPoints) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
              const dist = Math.random() * 40 + 30;
              let subPoint = point.add(Vector2.fromAngle(angle, dist));
              // Ensure sub-point is within reasonable bounds (e.g., settlement radius)
              if (subPoint.distance(this.settlement.position) > this.settlement.radius * 1.1) { // Allow slightly outside radius
                   subPoint = this.settlement.position.add(subPoint.subtract(this.settlement.position).normalize().multiply(this.settlement.radius * 1.1));
              }
              // Ensure sub-point is not inside an obstacle
              if (!this.isPointInObstacle(subPoint)) {
                   this.investigationSubPoints.push(subPoint);
              } else {
                  // Optional: try a slightly different angle/dist if first attempt failed
              }
         }
         // Calculate path to the main investigation point first (or the first sub-point if main point is inside obstacle?)
         this.calculatePath(this.investigationPoint);
         this.target = this.investigationPoint; // Initial movement target
         // If path to main point fails, maybe target first sub-point directly?
         if (!this.currentPath && this.investigationSubPoints.length > 0) {
             this.target = this.investigationSubPoints[0];
             this.calculatePath(this.target);
             this.currentInvestigationSubPointIndex = 0; // Start with the first sub-point
         } else if (!this.currentPath) {
             // Path to main point failed and no sub-points? Go idle.
             this.state = 'idle';
             this.idleTimer = 1.0;
         }
    }


    alert(investigationPos, alertLevel = 1, isGunshot = false) {
         // Don't lower alert level if already highly alerted or attacking
         if (alertLevel < this.alertLevel && (this.state === 'chase' || this.state === 'attack' || this.state === 'alert')) return;
         // Don't interrupt attack state
         if (this.state === 'attack') return;

         const offset = Vector2.fromAngle(Math.random() * Math.PI * 2, Math.random() * 20 + 10);
         const finalInvestigationPos = investigationPos.add(offset);

         const previousAlertLevel = this.alertLevel;
         this.alertLevel = Math.max(this.alertLevel, alertLevel);
         this.alertTimer = Math.max(this.alertTimer, isGunshot ? 25 : 18); // Slightly longer timers

         // Only set a new investigation point if the alert level increased or was low
         // Or if the new alert is significantly far from the old one
         const setNewPoint = this.alertLevel > previousAlertLevel || !this.investigationPoint || finalInvestigationPos.distance(this.investigationPoint) > 100;

         if (setNewPoint) {
             this.setInvestigationPoint(finalInvestigationPos); // This calculates path to main point
         }
         // Ensure state is set to alert, even if investigation point wasn't reset
         this.state = 'alert';
    }

    getRandomPointInSettlement(radius = this.settlement.radius * 0.9) {
        let point;
        let attempts = 0;
        do {
             point = this.position.add(new Vector2( // Use current position as base for random offset
                  (Math.random() - 0.5) * 2 * radius,
                  (Math.random() - 0.5) * 2 * radius
             ));
             // Clamp point within world bounds and settlement radius
             point.x = Math.max(this.size.x / 2, Math.min(this.worldWidth - this.size.x / 2, point.x));
             point.y = Math.max(this.size.y / 2, Math.min(this.worldHeight - this.size.y / 2, point.y));
             if (point.distance(this.settlement.position) > this.settlement.radius) {
                 point = this.settlement.position.add(point.subtract(this.settlement.position).normalize().multiply(this.settlement.radius * 0.95));
             }
             attempts++;
        } while (this.isPointInObstacle(point) && attempts < 10);
        return attempts < 10 ? point : this.settlement.position; // Fallback to settlement center
    }

    isPointInObstacle(point) {
         for (const obstacle of this.settlement.obstacles) {
              if (
                   point.x > obstacle.position.x - obstacle.size.x / 2 &&
                   point.x < obstacle.position.x + obstacle.size.x / 2 &&
                   point.y > obstacle.position.y - obstacle.size.y / 2 &&
                   point.y < obstacle.position.y + obstacle.size.y / 2
              ) { return true; }
         }
         return false;
    }

    calculatePath(targetPos) {
         if (!targetPos) { // Don't calculate if target is null
             this.currentPath = null;
             this.currentWaypointIndex = 0;
             return;
         }
         if (this.pathRecalculateTimer > 0) return;

         const settlementBounds = {
              minX: this.settlement.position.x - this.settlement.radius,
              maxX: this.settlement.position.x + this.settlement.radius,
              minY: this.settlement.position.y - this.settlement.radius,
              maxY: this.settlement.position.y + this.settlement.radius,
         };
         const buffer = 50;
         const pathBounds = {
              minX: Math.max(0, settlementBounds.minX - buffer),
              maxX: Math.min(this.worldWidth, settlementBounds.maxX + buffer),
              minY: Math.max(0, settlementBounds.minY - buffer),
              maxY: Math.min(this.worldHeight, settlementBounds.maxY + buffer),
         };

         const newPath = findPath(this.position, targetPos, this.settlement.obstacles, pathBounds, this.pathGridSize);

         if (newPath && newPath.length > 1) {
              this.currentPath = newPath;
              this.currentWaypointIndex = 1; // Start moving towards the second point in the path
              this.pathRecalculateTimer = 0.3 + Math.random() * 0.2; // Slightly longer cooldown
         } else {
              this.currentPath = null;
              this.currentWaypointIndex = 0;
              // If path fails, immediately go idle to decide what to do next
              this.state = 'idle';
              this.idleTimer = 0.5 + Math.random() * 0.5;
         }
    }


    constrainToSettlement() {
         const distFromCenter = this.position.distance(this.settlement.position);
         if (distFromCenter > this.settlement.radius) {
             const directionToCenter = this.settlement.position.subtract(this.position).normalize();
             this.position = this.settlement.position.add(directionToCenter.multiply(this.settlement.radius));
             this.velocity = new Vector2(0,0);
             this.currentPath = null; // Stop pathfinding if pushed back
         }
    }

    draw(ctx, camera) {
         super.draw(ctx, camera);

         // Draw alert status indicator
         if (this.alertLevel === 1) {
              ctx.fillStyle = 'yellow';
              ctx.font = '16px Orbitron';
              ctx.fillText('?', this.position.x - camera.x - 5, this.position.y - camera.y - this.size.y / 2 - 15);
         } else if (this.alertLevel === 2) {
              ctx.fillStyle = 'red';
              ctx.font = '16px Orbitron';
              ctx.fillText('!', this.position.x - camera.x - 5, this.position.y - camera.y - this.size.y / 2 - 15);
         }
    }

    takeDamage(amount, source = null, killContext = 'other') {
         const died = super.takeDamage(amount, source, killContext); // Calls settlement.notifyHumanDeath if died
         if (!died && source && source.isPlayer) {
              this.alert(source.position, 2, killContext === 'gun'); // Alert if damaged by player
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
        this.lifeTime = 2; // Seconds before disappearing
    }

    update(deltaTime, settlements, player, gameOverCallback) { // Pass dependencies, including gameOverCallback
        const prevPos = new Vector2(this.position.x, this.position.y);
        this.position = this.position.add(this.velocity.multiply(deltaTime));
        this.lifeTime -= deltaTime;

        // Check collision with obstacles
        let hitObstacle = false;
        settlements.forEach(settlement => {
             if (hitObstacle) return;
             settlement.obstacles.forEach(obstacle => {
                  if (hitObstacle) return;
                  // Use line intersection check for better accuracy with fast bullets
                  if (lineIntersectsRect(prevPos, this.position, obstacle.getRectData())) {
                       this.lifeTime = 0;
                       hitObstacle = true;
                  }
             });
        });
        if (hitObstacle || this.lifeTime <= 0) return; // Exit if hit obstacle or lifetime expired


        // Check collision with humans (if player bullet) or player (if enemy bullet)
        if (this.isPlayerBullet) {
            settlements.forEach(settlement => {
                settlement.humans.forEach(human => {
                    // Check distance for collision
                    if (this.lifeTime > 0 && this.position.distance(human.position) < (this.size + human.size.x) / 2) {
                        if (human.takeDamage(this.damage, player, 'gun')) {
                            // Settlement handles removal via takeDamage -> notifyHumanDeath
                        }
                        this.lifeTime = 0; // Bullet is consumed on hit
                    }
                });
            });
        } else { // Enemy bullet
            if (this.lifeTime > 0 && this.position.distance(player.position) < (this.size + player.size.x) / 2) {
                // Player needs access to the global gameOver function reference
                player.takeDamage(this.damage, gameOverCallback, null, 'gun'); // Pass gameOver callback
                this.lifeTime = 0; // Bullet is consumed on hit
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

// Utility function needed by Human class, placed here for co-location
export function isLineOfSightClear(startPos, endPos, obstacles) {
     for (const obstacle of obstacles) {
          if (lineIntersectsRect(startPos, endPos, obstacle.getRectData())) {
               return false;
          }
     }
     return true;
}
