import { Entity } from './Entity.js';
import { Vector2 } from '../utils.js';
import { findPath } from '../pathfinding.js';
import { Projectile } from './Projectile.js';

export class Human extends Entity {
    constructor(patrolPath, settlement, building) {
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
        this.building = building;
        this.currentFloor = 0;
        this.doorInteractionCooldownTimer = 0;
        this.DOOR_INTERACTION_COOLDOWN = 0.5;
        this.stairInteractionCooldownTimer = 0;
        this.STAIR_INTERACTION_COOLDOWN = 1.0;

        // Cover related properties
        this.coverSearchRadius = 150;
        this.timeSinceLastSawPlayer = 0;
        this.timeUnderFireWithoutLOS = 0;
        this.seekCoverCooldown = 0;
        this.COVER_COOLDOWN = 3.0; // Cooldown between seeking cover attempts
        this.currentCoverPoint = null;

        // Repositioning properties
        this.repositionTimer = 2.0 + Math.random() * 2.0; // Time until next reposition attempt
        this.REPOSITION_COOLDOWN = 1.0; // Min time between repositions
        this.isRepositioning = false;
        this.repositionTarget = null;
    }

    update(deltaTime, player, isLineOfSightClearFunc, projectiles, game) {
        if (this.attackCooldown > 0) this.attackCooldown -= deltaTime;
        if (this.initialAttackDelayTimer > 0) this.initialAttackDelayTimer -= deltaTime;
        if (this.doorInteractionCooldownTimer > 0) this.doorInteractionCooldownTimer -= deltaTime;
        if (this.stairInteractionCooldownTimer > 0) this.stairInteractionCooldownTimer -= deltaTime;
        if (this.seekCoverCooldown > 0) this.seekCoverCooldown -= deltaTime;
        // Decrement reposition timer only when in attack state and not already repositioning or seeking cover
        if (this.state === 'attack' && !this.isRepositioning && this.state !== 'seekCover' && this.repositionTimer > 0) {
             this.repositionTimer -= deltaTime;
        }

         let currentObstacles = [];
         if (this.building) {
             currentObstacles = this.building.getObstacles(this.currentFloor);
         } else if (game && game.worldManager) {
             // TODO: Need worldManager.getObstaclesNear or similar for non-building humans
             // currentObstacles = game.worldManager.getObstaclesNear(this.position);
         }


         if (this.alertTimer > 0) {
             this.alertTimer -= deltaTime;
              if (this.alertTimer <= 0 && this.state !== 'patrol') {
                   this.alertLevel = 0;
                   this.investigationPoint = null;
                   this.investigationSubPoints = [];
                   this.currentInvestigationSubPointIndex = 0;
                   this.state = 'patrol';
                   this.calculatePath(this.patrolPath[this.currentPatrolIndex], this.currentFloor, currentObstacles);
             }
         }
         if (this.pathRecalculateTimer > 0) this.pathRecalculateTimer -= deltaTime;
         if (this.gunFlashTimer > 0) this.gunFlashTimer -= deltaTime;

         // Always detect player unless seeking cover (to potentially re-engage)
         if (this.state !== 'seekCover') {
             this.detectPlayer(deltaTime, player, isLineOfSightClearFunc, currentObstacles);
         }

         const previousVelocity = new Vector2(this.velocity.x, this.velocity.y);

         // State machine logic
         switch (this.state) {
             case 'patrol': this.patrol(deltaTime, currentObstacles); break;
             case 'chase': this.chase(deltaTime, player, currentObstacles); break;
             case 'attack': this.attack(deltaTime, player, isLineOfSightClearFunc, projectiles, currentObstacles); break;
             case 'alert': this.alertState(deltaTime, currentObstacles); break;
             case 'idle': this.idle(deltaTime, currentObstacles); break;
             case 'seekCover': this.seekCover(deltaTime, currentObstacles); break;
         }

         // Separation logic (unchanged)
         const separationRadius = 40;
         const separationForceMultiplier = 80;
         let separationVector = new Vector2(0, 0);
         let neighbors = 0;

         if (this.settlement && this.state !== 'attack' && !(this.state === 'chase' && this.target === player.position)) {
             this.settlement.humans.forEach(otherHuman => {
                 if (otherHuman === this) return;
                 const sameLocation = (!this.building && !otherHuman.building) ||
                                      (this.building && this.building === otherHuman.building && this.currentFloor === otherHuman.currentFloor);

                 if (sameLocation) {
                     const distance = this.position.distance(otherHuman.position);
                     if (distance < separationRadius && distance > 0) {
                         const awayVector = this.position.subtract(otherHuman.position).normalize();
                         separationVector = separationVector.add(awayVector.multiply(1 / distance));
                         neighbors++;
                     }
                 }
             });
         }

         if (neighbors > 0) {
             separationVector = separationVector.normalize().multiply(separationForceMultiplier);
             this.velocity = this.velocity.add(separationVector.multiply(deltaTime));
         }

         // Update position based on velocity
         const previousPosition = this.position.clone();
         super.update(deltaTime, currentObstacles);


         // Door interaction logic (unchanged)
         const moved = this.position.distanceSq(previousPosition) > (this.speed * deltaTime * 0.1) ** 2;
         const shouldBeMoving = this.currentPath && this.currentWaypointIndex < this.currentPath.length && (this.state === 'patrol' || this.state === 'chase' || this.state === 'alert' || this.state === 'seekCover');

         if (shouldBeMoving && !moved) {
             if (this.doorInteractionCooldownTimer <= 0) {
                 const checkRadius = this.size.x * 1.5;
                 const targetWaypoint = this.currentPath[this.currentWaypointIndex];
                 if (targetWaypoint instanceof Vector2) {
                     const directionToWaypoint = targetWaypoint.subtract(this.position).normalize();
                     if (directionToWaypoint.magnitudeSq() > 0.001) {
                         for (const obstacle of currentObstacles) {
                             if (obstacle.isDoor && !obstacle.isOpen) {
                                 const distToDoor = this.position.distance(obstacle.position);
                                 if (distToDoor < checkRadius) {
                                     const directionToDoor = obstacle.position.subtract(this.position).normalize();
                                     if (directionToDoor.magnitudeSq() > 0.001 && typeof directionToWaypoint.dot === 'function') {
                                         const dotProduct = directionToWaypoint.dot(directionToDoor);
                                         if (dotProduct > 0.7) {
                                             obstacle.open();
                                             this.doorInteractionCooldownTimer = this.DOOR_INTERACTION_COOLDOWN;
                                             this.velocity = new Vector2(0, 0);
                                             break;
                                         }
                                     }
                                 }
                             }
                         }
                     }
                 }
             }
         }
    }

    detectPlayer(deltaTime, player, isLineOfSightClearFunc, currentObstacles) {
        const sameBuildingAndFloor = this.building && player.currentBuilding === this.building && this.currentFloor === player.currentFloor;
        const canDetect = !this.building || sameBuildingAndFloor;

        if (!canDetect) {
            if (this.lastSawPlayer && this.state !== 'alert') {
                 this.state = 'alert';
                 this.target = player.lastPosition;
                 this.setInvestigationPoint(player.lastPosition, this.currentFloor, currentObstacles);
                 this.alertLevel = 1;
                 this.alertTimer = 12;
                 this.lastSawPlayer = false;
            }
            return;
        }

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
            this.timeSinceLastSawPlayer = 0; // Reset timer
            this.timeUnderFireWithoutLOS = 0; // Reset timer

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
                const needsNewPath = previousState !== 'chase' || !this.currentPath || this.currentWaypointIndex >= this.currentPath.length;
                 const targetMovedSignificantly = this.currentPath && player.position.distance(this.currentPath[this.currentPath.length - 1]) > this.pathGridSize * 2;

                 if ((needsNewPath || targetMovedSignificantly) && this.pathRecalculateTimer <= 0) {
                     this.calculatePath(player.position, this.currentFloor, currentObstacles);
                 }
             }
            if (justBecameAlerted && this.settlement) {
                this.settlement.notifyAlliesOfAlert(this);
            }
        } else { // Cannot see player
            if (this.lastSawPlayer && this.state !== 'alert' && this.state !== 'seekCover') {
                // If just lost sight, go to alert state
                this.state = 'alert';
                this.target = player.lastPosition;
                this.setInvestigationPoint(player.lastPosition, this.currentFloor, currentObstacles);
                this.alertLevel = 1;
                this.alertTimer = 12;
            } else if (this.state === 'alert' && this.alertTimer <= 0) {
                // If was alert and timer ran out, go back to patrol
                this.state = 'patrol';
                this.target = null;
                this.investigationPoint = null;
                 this.investigationSubPoints = [];
                 this.currentInvestigationSubPointIndex = 0;
                 this.currentPath = null;
                 this.calculatePath(this.patrolPath[this.currentPatrolIndex], this.currentFloor, currentObstacles);
             } else if (this.state === 'chase' && this.alertTimer <= 0) {
                  // If was chasing and timer ran out (shouldn't happen if LOS lost?), go to alert
                  this.state = 'alert';
                  this.target = player.lastPosition;
                  this.setInvestigationPoint(player.lastPosition, this.currentFloor, currentObstacles);
                  this.alertLevel = 1;
                  this.alertTimer = 12;
            }
            // Update timers only when player is not seen
            this.lastSawPlayer = false;
            this.timeSinceLastSawPlayer += deltaTime;
            if (this.state === 'attack') { // Should only happen briefly if LOS check fails in attack state
                this.timeUnderFireWithoutLOS += deltaTime;
            }
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
            this.calculatePath(this.target, this.currentFloor, currentObstacles);
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

        // Look around while idle and alert
        if (this.alertLevel > 0) {
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
                    // Alert timer expired, go back to patrol
                    this.alertLevel = 0;
                    this.investigationPoint = null;
                    this.investigationSubPoints = [];
                    this.currentInvestigationSubPointIndex = 0;
                    nextTarget = this.patrolPath[this.currentPatrolIndex];
                    nextState = 'patrol';
                } else if (this.investigationPoint) {
                    // Still alert, continue investigating sub-points or main point
                    if (this.currentInvestigationSubPointIndex >= this.investigationSubPoints.length) {
                        // Finished sub-points, maybe re-investigate main point or new sub-points
                        this.setInvestigationPoint(this.investigationPoint, this.currentFloor, currentObstacles, true); // Generate new sub-points
                        nextTarget = this.target; // Target might be updated in setInvestigationPoint
                        nextState = 'alert';
                    } else {
                        // Go to next sub-point
                        nextTarget = this.investigationSubPoints[this.currentInvestigationSubPointIndex];
                        nextState = 'alert';
                    }
                } else {
                    // Alert but no investigation point? Fallback to patrol.
                    this.alertLevel = 0;
                    nextTarget = this.patrolPath[this.currentPatrolIndex];
                    nextState = 'patrol';
                }
            } else {
                // Not alert, go back to patrol
                nextTarget = this.patrolPath[this.currentPatrolIndex];
                nextState = 'patrol';
            }

            this.target = nextTarget;
            if (this.target) {
                this.calculatePath(this.target, this.currentFloor, currentObstacles);
                // If path calculation fails immediately, go back to idle
                if (!this.currentPath) {
                    nextState = 'idle';
                    this.idleTimer = 1.0;
                }
            } else {
                // No target, stay idle
                this.currentPath = null;
                nextState = 'idle';
                this.idleTimer = 1.0;
            }
            this.state = nextState;
        }
    }

     chase(deltaTime, player, currentObstacles) {
        const sameBuildingAndFloor = this.building && player.currentBuilding === this.building && this.currentFloor === player.currentFloor;
        const canChase = !this.building || sameBuildingAndFloor;

        if (!this.target || !player || player.health <= 0 || !canChase) {
            // Target lost or invalid, go back to patrol (or alert if recently saw player)
            this.state = this.lastSawPlayer ? 'alert' : 'patrol';
            if (this.state === 'alert') {
                this.target = player.lastPosition;
                this.setInvestigationPoint(player.lastPosition, this.currentFloor, currentObstacles);
                this.alertLevel = 1;
                this.alertTimer = 12;
            } else {
                 this.currentPath = null;
                 this.calculatePath(this.patrolPath[this.currentPatrolIndex], this.currentFloor, currentObstacles);
            }
            return;
        }

        this.target = player.position; // Update target position

        // Recalculate path periodically or if target moved significantly
        const targetMovedSignificantly = this.currentPath && player.position.distance(this.currentPath[this.currentPath.length - 1]) > this.pathGridSize * 1.5;
        if (this.pathRecalculateTimer <= 0 || targetMovedSignificantly) {
            this.calculatePath(this.target, this.currentFloor, currentObstacles);
        }

        // If no path, move directly towards target (simple fallback)
        if (!this.currentPath || this.currentWaypointIndex >= this.currentPath.length) {
            const direction = this.target.subtract(this.position).normalize();
            this.velocity = direction.multiply(this.speed);
            if (this.velocity.magnitude() > 0.1) this.viewDirection = direction;
            // Try calculating path again if none exists
            if (!this.currentPath && this.pathRecalculateTimer <= 0) this.calculatePath(this.target, this.currentFloor, currentObstacles);
            return;
        }

        // Follow the path
        const targetWaypoint = this.currentPath[this.currentWaypointIndex];
        const distanceToWaypointSq = this.position.distanceSq(targetWaypoint);

        if (targetWaypoint instanceof Vector2) {
            const direction = targetWaypoint.subtract(this.position).normalize();
            this.velocity = direction.multiply(this.speed);
            if (this.velocity.magnitude() > 0.1) this.viewDirection = direction;
        } else {
            // Invalid waypoint? Stop and recalculate.
            this.velocity = new Vector2(0, 0);
            this.currentPath = null;
            if (this.pathRecalculateTimer <= 0) this.calculatePath(this.target, this.currentFloor, currentObstacles);
        }


        // Advance waypoint if close enough
        if (distanceToWaypointSq < (this.pathGridSize / 2) ** 2) {
            this.currentWaypointIndex++;
            // If reached end of path, recalculate towards current target position
            if (this.currentWaypointIndex >= this.currentPath.length) {
                if (this.pathRecalculateTimer <= 0) this.calculatePath(this.target, this.currentFloor, currentObstacles);
            }
        }
    }

     attack(deltaTime, player, isLineOfSightClearFunc, projectiles, currentObstacles) {
        const sameBuildingAndFloor = this.building && player.currentBuilding === this.building && this.currentFloor === player.currentFloor;
        const canAttack = (!this.building || sameBuildingAndFloor) && player && player.health > 0;

        if (!canAttack) {
            // Cannot attack (different floor, player dead, etc.)
            this.state = 'patrol'; // Revert to patrol
            this.calculatePath(this.patrolPath[this.currentPatrolIndex], this.currentFloor, currentObstacles);
            return;
        }

        const distanceToPlayer = this.position.distance(player.position);
        let hasLOS = isLineOfSightClearFunc(this.position, player.position, currentObstacles);

        // If too far or lost LOS, switch back to chase
        if (distanceToPlayer > this.attackRange * 1.1 || !hasLOS) {
            this.target = player.position;
            this.state = 'chase';
            this.alertLevel = 2; // Stay highly alert
            this.alertTimer = 15; // Reset alert timer
            this.calculatePath(this.target, this.currentFloor, currentObstacles); // Start chasing
            this.timeUnderFireWithoutLOS = 0; // Reset this timer as we are now chasing
            return;
        }

        // --- In Attack Range with LOS ---

        // --- Repositioning Logic ---
        if (this.isRepositioning) {
            // Currently moving to a reposition target
            if (!this.repositionTarget || !this.currentPath || this.currentWaypointIndex >= this.currentPath.length) {
                // Reached target or path failed
                this.isRepositioning = false;
                this.repositionTarget = null;
                this.currentPath = null;
                this.velocity = new Vector2(0, 0);
                this.repositionTimer = this.REPOSITION_COOLDOWN + Math.random() * 2.0; // Reset timer after reposition
                console.log("Human finished repositioning.");
            } else {
                // Follow path to reposition target
                const targetWaypoint = this.currentPath[this.currentWaypointIndex];
                const distanceToWaypointSq = this.position.distanceSq(targetWaypoint);
                if (targetWaypoint instanceof Vector2) {
                    const direction = targetWaypoint.subtract(this.position).normalize();
                    this.velocity = direction.multiply(this.speed * 0.7); // Move slightly slower when repositioning
                    if (this.velocity.magnitude() > 0.1) this.viewDirection = direction; // Look where going
                } else {
                    this.isRepositioning = false; // Path error
                    this.velocity = new Vector2(0, 0);
                }
                if (distanceToWaypointSq < (this.pathGridSize / 2) ** 2) {
                    this.currentWaypointIndex++;
                }
                // Don't shoot while repositioning
                return; // Skip shooting logic for this frame
            }
        } else {
             // Not currently repositioning, aim and potentially shoot
             this.velocity = new Vector2(0, 0); // Stand still to shoot
             const directionToPlayer = player.position.subtract(this.position).normalize();
             if (directionToPlayer.magnitudeSq() > 0) {
                 this.viewDirection = directionToPlayer; // Aim at player
             }
        }
        // --- End Repositioning Movement ---


        // Fire weapon if cooldown allows and not repositioning
        if (!this.isRepositioning && this.attackCooldown <= 0 && this.initialAttackDelayTimer <= 0) {
            const projectileSpawnPos = this.position.add(this.viewDirection.multiply(this.size.x / 2 + 5));
            projectiles.push(new Projectile(projectileSpawnPos, this.viewDirection, this.attackDamage, false)); // Assuming false = enemy projectile
            this.attackCooldown = this.gunCooldown; // Reset attack cooldown
            this.gunFlashTimer = this.gunFlashDuration; // Trigger gun flash visual
        }

        // --- Cover logic within Attack state ---
        // If taking damage without LOS (shouldn't happen often here, but as fallback)
        // Or maybe add a timer: if player hasn't been seen for X seconds while in attack state?
        if (this.timeUnderFireWithoutLOS > 1.5 && this.seekCoverCooldown <= 0) { // Using the timer updated in detectPlayer
            const coverPoint = this.findNearbyCover(currentObstacles, player.lastPosition || player.position); // Use last known position if current LOS is lost
            if (coverPoint) {
                this.state = 'seekCover';
                this.currentCoverPoint = coverPoint;
                this.calculatePath(this.currentCoverPoint, this.currentFloor, currentObstacles);
                this.seekCoverCooldown = this.COVER_COOLDOWN;
                this.timeUnderFireWithoutLOS = 0; // Reset timer
                console.log("Human seeking cover from attack state (lost LOS?)");
                return; // Exit attack state logic
            } else {
                // No cover found, reset cooldown slightly so it doesn't check every frame
                this.seekCoverCooldown = 0.5;
            }
        }
        // --- End Cover logic ---

       // --- Repositioning Trigger ---
       // Check if it's time to reposition (only if not already repositioning or seeking cover)
       if (!this.isRepositioning && this.state === 'attack' && this.repositionTimer <= 0 && this.seekCoverCooldown <= 0) {
           const repositionPoint = this.findRepositionPoint(currentObstacles, player.position, isLineOfSightClearFunc);
           if (repositionPoint) {
               this.isRepositioning = true;
               this.repositionTarget = repositionPoint;
               this.calculatePath(this.repositionTarget, this.currentFloor, currentObstacles);
               if (!this.currentPath) { // Path failed immediately
                   this.isRepositioning = false;
                   this.repositionTarget = null;
                   this.repositionTimer = this.REPOSITION_COOLDOWN + Math.random(); // Short delay before trying again
                   console.log("Reposition path failed immediately.");
               } else {
                   console.log("Human starting reposition.");
                   // Timer reset happens when repositioning finishes or fails in the update logic above
               }
           } else {
                // Couldn't find a point, reset timer with shorter delay before trying again
                this.repositionTimer = this.REPOSITION_COOLDOWN + Math.random();
                // console.log("Could not find reposition point."); // Optional debug
           }
       }
       // --- End Repositioning Trigger ---
    }

    alertState(deltaTime, currentObstacles) {
        // If alert timer runs out, go back to patrol
        if (this.alertTimer <= 0) {
             this.state = 'patrol';
             this.target = null;
             this.investigationPoint = null;
             this.investigationSubPoints = [];
             this.currentInvestigationSubPointIndex = 0;
             this.alertLevel = 0;
             this.calculatePath(this.patrolPath[this.currentPatrolIndex], this.currentFloor, currentObstacles);
             return;
        }

        // If no target (investigation point), go idle briefly
        if (!this.target) {
            this.state = 'idle';
            this.idleTimer = 0.5;
            this.velocity = new Vector2(0, 0);
            return;
        }

        // Follow path to investigation point/sub-point
        if (this.currentPath && this.currentWaypointIndex < this.currentPath.length) {
            const targetWaypoint = this.currentPath[this.currentWaypointIndex];
            const distanceToWaypointSq = this.position.distanceSq(targetWaypoint);

            if (targetWaypoint instanceof Vector2) {
                const direction = targetWaypoint.subtract(this.position).normalize();
                this.velocity = direction.multiply(this.speed * 0.8); // Move slower when alert
                if (this.velocity.magnitude() > 0.1) this.viewDirection = direction;
            } else {
                // Invalid waypoint
                this.velocity = new Vector2(0, 0);
                this.currentPath = null;
            }


            // Check if waypoint reached
            if (distanceToWaypointSq < (this.pathGridSize / 2) ** 2) {
                this.currentWaypointIndex++;
                if (this.currentWaypointIndex >= this.currentPath.length) {
                    // Reached destination (investigation point or sub-point)
                    this.velocity = new Vector2(0, 0);
                    this.currentPath = null;
                    this.state = 'idle'; // Idle briefly to look around
                    this.idleTimer = 1.5 + Math.random();
                    this.searchLookTimer = 0; // Reset look timer

                    // If we were heading to a sub-point, advance index
                    if (this.investigationPoint && this.investigationSubPoints.includes(this.target)) {
                         this.currentInvestigationSubPointIndex++;
                    }
                    return;
                }
            }
        } else {
            // No path, or path finished unexpectedly
            this.velocity = new Vector2(0, 0);
            // Try to calculate path again if target exists
            if (this.target && this.pathRecalculateTimer <= 0) {
                this.calculatePath(this.target, this.currentFloor, currentObstacles);
                // If path still fails, go idle
                if (!this.currentPath) {
                    this.state = 'idle';
                    this.idleTimer = 1.0 + Math.random();
                }
            } else if (this.state !== 'idle') {
                // If cannot recalculate path, just go idle
                this.state = 'idle';
                this.idleTimer = Math.max(this.idleTimer, 0.5);
            }
        }
    }

    setInvestigationPoint(point, floor, currentObstacles, isReinvestigation = false) {
        this.investigationPoint = point; // Store the main point of interest
        this.investigationSubPoints = []; // Reset sub-points

        if (!isReinvestigation) {
            this.currentInvestigationSubPointIndex = 0; // Reset index only on initial investigation
        } else {
             // If re-investigating, maybe clear sub-points or generate new ones slightly differently
             console.log("Re-investigating point:", point);
        }

        // Generate sub-points around the main investigation point
        const numSubPoints = 3 + Math.floor(Math.random() * 2);
        for (let i = 0; i < numSubPoints; i++) {
            const angle = (i / numSubPoints) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            const dist = Math.random() * 40 + 30; // Distance from main point
            let subPoint = point.add(Vector2.fromAngle(angle, dist));

            // Basic check to avoid spawning sub-points inside obstacles
            if (!this.isPointInObstaclesList(subPoint, currentObstacles)) {
                this.investigationSubPoints.push(subPoint);
            }
        }

        // Decide initial target: first sub-point if available, otherwise the main point
        if (this.investigationSubPoints.length > 0 && this.currentInvestigationSubPointIndex < this.investigationSubPoints.length) {
             this.target = this.investigationSubPoints[this.currentInvestigationSubPointIndex];
        } else {
             this.target = this.investigationPoint; // Fallback to main point
             this.currentInvestigationSubPointIndex = 0; // Ensure index is reset if no valid sub-points
        }

        // Calculate path to the chosen target
        this.calculatePath(this.target, floor, currentObstacles);

        // If path calculation fails immediately, go idle
        if (!this.currentPath) {
            console.warn("Path calculation failed immediately in setInvestigationPoint");
            this.state = 'idle';
            this.idleTimer = 1.0;
        }
    }


    alert(investigationPos, alertFloor, alertLevel = 1, isGunshot = false) {
        // Ignore lower level alerts if already highly alerted or engaging player
        if (alertLevel < this.alertLevel && (this.state === 'chase' || this.state === 'attack' || this.alertLevel === 2)) return;

        // Ignore alerts from different floors if inside a building
        if (this.building && this.currentFloor !== alertFloor) {
            // console.log(`Human on floor ${this.currentFloor} ignoring alert from floor ${alertFloor}`); // Reduce console spam
            return;
        }

        // Add randomness to the investigation position
        const offset = Vector2.fromAngle(Math.random() * Math.PI * 2, Math.random() * 20 + 10);
        const finalInvestigationPos = investigationPos.add(offset);

        const previousAlertLevel = this.alertLevel;
        this.alertLevel = Math.max(this.alertLevel, alertLevel); // Set alert level
        this.alertTimer = Math.max(this.alertTimer, isGunshot ? 25 : 18); // Set alert duration

        // Determine if we need to set a new investigation point
        // Set new point if: alert level increased, or no current point, or new point is far from current one
        const setNewPoint = this.alertLevel > previousAlertLevel ||
                           !this.investigationPoint ||
                           finalInvestigationPos.distance(this.investigationPoint) > 100; // Threshold distance

        // Only change state and set point if not already attacking
        if (setNewPoint && this.state !== 'attack') {
            let obstaclesForAlertFloor = [];
            if (this.building) {
                obstaclesForAlertFloor = this.building.getObstacles(alertFloor);
            } else {
                 // Need a way to get world obstacles here if needed for pathfinding/sub-point generation
            }

            this.setInvestigationPoint(finalInvestigationPos, alertFloor, obstaclesForAlertFloor);
            this.state = 'alert'; // Switch to alert state
        } else if (this.state !== 'attack' && this.state !== 'chase') {
             // If alert level didn't increase but we are idle/patrolling, still go to alert state
             this.state = 'alert';
        }
    }

    isPointInObstaclesList(point, obstacles) {
        for (const obstacle of obstacles) {
            // Skip check for interactable obstacles like open doors or stairs
            if (obstacle.isStairs || (obstacle.isDoor && obstacle.isOpen)) continue;

            // Use getRectData if available, otherwise estimate from position/size
            const rect = obstacle.getRectData ? obstacle.getRectData() : { x: obstacle.position.x, y: obstacle.position.y, width: obstacle.size.x, height: obstacle.size.y };
            const halfWidth = rect.width / 2;
            const halfHeight = rect.height / 2;

            if (
                point.x >= rect.x - halfWidth &&
                point.x <= rect.x + halfWidth &&
                point.y >= rect.y - halfHeight &&
                point.y <= rect.y + halfHeight
            ) { return true; } // Point is inside this obstacle
        }
        return false; // Point is not inside any solid obstacle
    }


    calculatePath(targetPos, floorIndex, obstacles) {
        if (!targetPos) {
            this.currentPath = null;
            this.currentWaypointIndex = 0;
            return;
        }
        // Allow recalculation more often if chasing or alert? Maybe not needed yet.
        if (this.pathRecalculateTimer > 0 && this.currentPath) return;

        const targetFloorIndex = floorIndex; // Assuming target is on the same floor for now

        // Call the pathfinding function
        const newPath = findPath(
            this.position,
            this.currentFloor,
            targetPos,
            targetFloorIndex,
            this.building, // Pass building context for stairs/floor transitions
            this.pathGridSize
        );


        if (newPath && newPath.length > 1) {
            // Successfully found a path
            this.currentPath = newPath;
            this.currentWaypointIndex = 1; // Start moving towards the second node (index 1)
            this.pathRecalculateTimer = 0.3 + Math.random() * 0.2; // Cooldown before next recalc
        } else {
            // Pathfinding failed or path is too short
            this.currentPath = null;
            this.currentWaypointIndex = 0;
            // If path failed while trying to patrol/alert/chase, go idle
            if (this.state !== 'attack' && this.state !== 'idle') {
                 this.state = 'idle';
                 this.idleTimer = 0.5 + Math.random() * 0.5;
            }
        }
    }


    draw(ctx, camera) {
         // Call Entity's draw method first
         super.draw(ctx, camera);

         // Draw alert indicators (? or !) above the human
         const fontSize = 18 / camera.zoom;
         const yOffset = -this.size.y / 2 - (10 / camera.zoom); // Offset above the entity

         if (this.alertLevel === 1) {
              ctx.fillStyle = 'yellow';
              ctx.font = `bold ${fontSize}px Orbitron`;
              ctx.textAlign = 'center';
              // Draw relative to entity position (world coordinates)
              ctx.fillText('?', this.position.x, this.position.y + yOffset);
              ctx.textAlign = 'left'; // Reset alignment
         } else if (this.alertLevel === 2) {
              ctx.fillStyle = 'red';
              ctx.font = `bold ${fontSize}px Orbitron`;
              ctx.textAlign = 'center';
              ctx.fillText('!', this.position.x, this.position.y + yOffset);
              ctx.textAlign = 'left'; // Reset alignment
         }

         // Draw gun flash visual if firing
         if (this.gunFlashTimer > 0) {
             const flashSize = 12 / camera.zoom;
             // Ensure viewDirection is valid before using it
             const direction = this.viewDirection.magnitudeSq() > 0 ? this.viewDirection : new Vector2(0, -1); // Default up if no direction
             // Calculate flash position at the "barrel"
             const flashX = this.position.x + direction.x * (this.size.x / 2 + (5 / camera.zoom));
             const flashY = this.position.y + direction.y * (this.size.y / 2 + (5 / camera.zoom));

             ctx.fillStyle = 'rgba(255, 220, 0, 0.9)'; // Yellowish flash
             ctx.beginPath();
             ctx.arc(flashX, flashY, flashSize / 2, 0, Math.PI * 2);
             ctx.fill();
         }
    }

    // Added 'game' parameter
    takeDamage(amount, source = null, killContext = 'other', game = null) {
        const died = super.takeDamage(amount, source, killContext); // Call super first

        if (!died) { // Only process if not dead
            // Always alert if damaged by player
            if (source && source.isPlayer) {
                this.alert(source.position, source.currentFloor, 2, killContext === 'gun');
            }

            // Check for cover seeking condition
            if (source && source.isPlayer && this.state !== 'attack' && this.state !== 'chase' && this.seekCoverCooldown <= 0) {
                let obstaclesForFloor = [];
                if (this.building) {
                   obstaclesForFloor = this.building.getObstacles(this.currentFloor);
                } else if (game && game.worldManager) {
                   // TODO: Implement worldManager.getObstaclesNear or pass obstacles differently
                   console.warn("Human.takeDamage: Cannot get world obstacles for cover check yet.");
                } else {
                    console.warn("Human.takeDamage: Missing game reference for world obstacle check.");
                }

                // Only proceed if we have obstacles to check against
                if (obstaclesForFloor.length > 0) {
                   const coverPoint = this.findNearbyCover(obstaclesForFloor, source.position);
                   if (coverPoint) {
                       this.state = 'seekCover';
                       this.currentCoverPoint = coverPoint;
                       this.calculatePath(this.currentCoverPoint, this.currentFloor, obstaclesForFloor);
                       this.seekCoverCooldown = this.COVER_COOLDOWN;
                       console.log("Human seeking cover after taking damage");
                   }
                 }
             }
        } // End of if (!died) block

        return died; // Return the result from super.takeDamage
    }

    // --- New State: Seek Cover ---
    seekCover(deltaTime, currentObstacles) {
        // If no cover point or path, transition back immediately
        if (!this.currentCoverPoint || !this.currentPath || this.currentWaypointIndex >= this.currentPath.length) {
            this.state = 'alert'; // Go back to alert to reassess
            this.target = this.currentCoverPoint || this.target; // Keep target if cover point was lost
            this.alertLevel = 1; // Stay alert
            this.alertTimer = 8 + Math.random() * 4; // Reset alert timer
            this.currentCoverPoint = null;
            this.currentPath = null;
            this.velocity = new Vector2(0, 0);
            console.log("Human reached cover or path failed, transitioning to alert");
            return;
        }

        // Follow path to cover
        const targetWaypoint = this.currentPath[this.currentWaypointIndex];
        const distanceToWaypointSq = this.position.distanceSq(targetWaypoint);

        if (targetWaypoint instanceof Vector2) {
            const direction = targetWaypoint.subtract(this.position).normalize();
            this.velocity = direction.multiply(this.speed * 0.9); // Move slightly slower when seeking cover
            if (this.velocity.magnitude() > 0.1) this.viewDirection = direction;
        } else {
            // Invalid waypoint
            this.velocity = new Vector2(0, 0);
            this.currentPath = null;
            this.state = 'alert'; // Revert to alert if path is broken
            this.alertTimer = 5;
            return;
        }

        // Check if waypoint reached
        if (distanceToWaypointSq < (this.pathGridSize / 2) ** 2) {
            this.currentWaypointIndex++;
            if (this.currentWaypointIndex >= this.currentPath.length) {
                // Reached final destination (cover point)
                this.state = 'idle'; // Briefly idle at cover before reassessing
                this.idleTimer = 0.5 + Math.random() * 0.5;
                this.currentCoverPoint = null; // Clear cover point target
                this.currentPath = null;
                this.velocity = new Vector2(0, 0);
                console.log("Human reached cover point, idling briefly");
            }
        }
    }

    // --- New Helper: Find Nearby Cover ---
    findNearbyCover(obstacles, threatPosition) {
        let bestCoverPoint = null;
        let bestScore = -Infinity;

        const checkPoints = 16; // Number of points around the human to check
        for (let i = 0; i < checkPoints; i++) {
            const angle = (i / checkPoints) * Math.PI * 2;
            const checkDist = this.coverSearchRadius * (0.5 + Math.random() * 0.5); // Check varying distances
            const potentialCoverPos = this.position.add(Vector2.fromAngle(angle, checkDist));

            // Basic check: Is the point inside an obstacle?
            let isInObstacle = false;
            let nearestObstacle = null;
            let minDistSqToObstacle = Infinity;

            for (const obs of obstacles) {
                // Ignore interactables for cover calculation
                if (obs.isDoor || obs.isStairs) continue;

                const rect = obs.getRectData ? obs.getRectData() : { x: obs.position.x, y: obs.position.y, width: obs.size.x, height: obs.size.y };
                const halfWidth = rect.width / 2;
                const halfHeight = rect.height / 2;

                // Check if potential point is inside this obstacle
                if (potentialCoverPos.x >= rect.x - halfWidth && potentialCoverPos.x <= rect.x + halfWidth &&
                    potentialCoverPos.y >= rect.y - halfHeight && potentialCoverPos.y <= rect.y + halfHeight) {
                    isInObstacle = true;
                    break; // Don't consider points inside obstacles
                }

                // Track the nearest obstacle to the potential point
                const distSq = potentialCoverPos.distanceSq(obs.position);
                if (distSq < minDistSqToObstacle) {
                    minDistSqToObstacle = distSq;
                    nearestObstacle = obs;
                }
            }

            // Skip if the point is inside an obstacle or no obstacles are nearby
            if (isInObstacle || !nearestObstacle) continue;

            // --- Refine the cover point: Snap it towards the edge of the nearest obstacle ---
            // Calculate direction from potential point to the center of the nearest obstacle
            const dirToObstacleCenter = nearestObstacle.position.subtract(potentialCoverPos).normalize();
            // Move the point slightly *away* from the obstacle center to place it just outside the edge
            // The distance to move depends on the obstacle size, but let's use a small fixed offset for simplicity
            const coverPoint = potentialCoverPos.subtract(dirToObstacleCenter.multiply(this.size.x * 0.6)); // Place it just outside own radius from edge

            // --- Check Line of Sight from Cover Point to Threat ---
            // We ideally want a point where LOS to the threat is blocked.
            // This requires the isLineOfSightClearFunc. If we had it:
            // if (isLineOfSightClearFunc(coverPoint, threatPosition, obstacles)) {
            //     continue; // Skip points with clear LOS to the threat
            // }
            // For now, we skip this check and rely on proximity to obstacle.

            // --- Scoring the Cover Point ---
            const distToThreat = coverPoint.distance(threatPosition);
            const distToSelf = coverPoint.distance(this.position);

            // Score: Prefer points further from threat, closer to self, maybe slightly penalize points directly behind human?
            let score = -distToSelf * 0.5 + distToThreat * 0.2 + Math.random() * 20;

            // Basic check: Is the path to this cover point likely clear? (Very simplified LOS check to target)
            // This is NOT a pathfinding check, just a quick LOS.
            // if (!isLineOfSightClearFunc(this.position, coverPoint, obstacles)) {
            //     score -= 50; // Penalize if direct path is blocked
            // }

            if (score > bestScore) {
                bestScore = score;
                bestCoverPoint = coverPoint;
            }
        }

        // console.log("Best cover point found:", bestCoverPoint); // Debugging
        return bestCoverPoint;
    }

    // --- New Helper: Find Reposition Point ---
    findRepositionPoint(obstacles, threatPosition, isLineOfSightClearFunc) {
        const repositionDist = 50 + Math.random() * 50; // How far to move
        const attempts = 8;
        const threatDir = threatPosition.subtract(this.position).normalize();

        for (let i = 0; i < attempts; i++) {
            // Try points roughly perpendicular to the threat direction
            const angleOffset = (Math.PI / 2) * (Math.random() > 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.5);
            const repositionDir = threatDir.rotate(angleOffset);
            const potentialPoint = this.position.add(repositionDir.multiply(repositionDist));

            // Check if point is valid: not inside obstacle and maintains LOS to threat
            if (!this.isPointInObstaclesList(potentialPoint, obstacles)) {
                 // Check LOS - requires isLineOfSightClearFunc to be passed or accessible
                 // For now, assume LOS is maintained if point is not in obstacle
                 // if (isLineOfSightClearFunc(potentialPoint, threatPosition, obstacles)) {
                     return potentialPoint; // Found a valid point
                 // }
            }
        }
        return null; // No suitable point found
    }
}
