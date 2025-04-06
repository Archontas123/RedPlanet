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
    }

    update(deltaTime, player, isLineOfSightClearFunc, projectiles, game) {
        if (this.attackCooldown > 0) this.attackCooldown -= deltaTime;
        if (this.initialAttackDelayTimer > 0) this.initialAttackDelayTimer -= deltaTime;
        if (this.doorInteractionCooldownTimer > 0) this.doorInteractionCooldownTimer -= deltaTime;
        if (this.stairInteractionCooldownTimer > 0) this.stairInteractionCooldownTimer -= deltaTime;

         let currentObstacles = [];
         if (this.building) {
             currentObstacles = this.building.getObstacles(this.currentFloor);
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

         const previousPosition = this.position.clone();
         super.update(deltaTime, currentObstacles);


         const moved = this.position.distanceSq(previousPosition) > (this.speed * deltaTime * 0.1) ** 2;
         const shouldBeMoving = this.currentPath && this.currentWaypointIndex < this.currentPath.length && (this.state === 'patrol' || this.state === 'chase' || this.state === 'alert');

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
        } else {
            if (this.lastSawPlayer && this.state !== 'alert') {
                this.state = 'alert';
                this.target = player.lastPosition;
                this.setInvestigationPoint(player.lastPosition, this.currentFloor, currentObstacles);
                this.alertLevel = 1;
                this.alertTimer = 12;
            } else if (this.state === 'alert' && this.alertTimer <= 0) {
                this.state = 'patrol';
                this.target = null;
                this.investigationPoint = null;
                 this.investigationSubPoints = [];
                 this.currentInvestigationSubPointIndex = 0;
                 this.currentPath = null;
                 this.calculatePath(this.patrolPath[this.currentPatrolIndex], this.currentFloor, currentObstacles);
             } else if (this.state === 'chase' && this.alertTimer <= 0) {
                  this.state = 'alert';
                  this.target = player.lastPosition;
                  this.setInvestigationPoint(player.lastPosition, this.currentFloor, currentObstacles);
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
                        this.setInvestigationPoint(this.investigationPoint, this.currentFloor, currentObstacles, true);
                        nextTarget = this.target;
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
            } else {
                nextTarget = this.patrolPath[this.currentPatrolIndex];
                nextState = 'patrol';
            }

            this.target = nextTarget;
            if (this.target) {
                this.calculatePath(this.target, this.currentFloor, currentObstacles);
            } else {
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
            this.state = 'patrol';
            this.currentPath = null;
            this.calculatePath(this.patrolPath[this.currentPatrolIndex], this.currentFloor, currentObstacles);
            return;
        }

        this.target = player.position;

        if (this.pathRecalculateTimer <= 0) {
            this.calculatePath(this.target, this.currentFloor, currentObstacles);
        }

        if (!this.currentPath || this.currentWaypointIndex >= this.currentPath.length) {
            const direction = this.target.subtract(this.position).normalize();
            this.velocity = direction.multiply(this.speed);
            if (this.velocity.magnitude() > 0.1) this.viewDirection = direction;
            if (this.pathRecalculateTimer <= 0) this.calculatePath(this.target, this.currentFloor, currentObstacles);
            return;
        }

        const targetWaypoint = this.currentPath[this.currentWaypointIndex];
        const distanceToWaypointSq = this.position.distanceSq(targetWaypoint);

        const currentTargetWaypoint = this.currentPath[this.currentWaypointIndex];
        if (currentTargetWaypoint instanceof Vector2) {
            const direction = currentTargetWaypoint.subtract(this.position).normalize();
            this.velocity = direction.multiply(this.speed);
            if (this.velocity.magnitude() > 0.1) this.viewDirection = direction;
        } else {
            this.velocity = new Vector2(0, 0);
            this.currentPath = null;
            if (this.pathRecalculateTimer <= 0) this.calculatePath(this.target, this.currentFloor, currentObstacles);
        }


        if (distanceToWaypointSq < (this.pathGridSize / 2) ** 2) {
            this.currentWaypointIndex++;
            if (this.currentWaypointIndex >= this.currentPath.length) {
                if (this.pathRecalculateTimer <= 0) this.calculatePath(this.target, this.currentFloor, currentObstacles);
            }
        }
    }

     attack(deltaTime, player, isLineOfSightClearFunc, projectiles, currentObstacles) {
        const sameBuildingAndFloor = this.building && player.currentBuilding === this.building && this.currentFloor === player.currentFloor;
        const canAttack = (!this.building || sameBuildingAndFloor) && player && player.health > 0;

        if (!canAttack) {
            this.state = 'patrol';
            this.calculatePath(this.patrolPath[this.currentPatrolIndex], this.currentFloor, currentObstacles);
            return;
        }

        const distanceToPlayer = this.position.distance(player.position);

        let hasLOS = isLineOfSightClearFunc(this.position, player.position, currentObstacles);

        if (distanceToPlayer > this.attackRange * 1.1 || !hasLOS) {
            this.target = player.position;
            this.state = 'chase';
            this.alertLevel = 2;
            this.alertTimer = 15;
            this.calculatePath(this.target, this.currentFloor, currentObstacles);
            return;
        }

        this.currentPath = null;
        this.velocity = new Vector2(0, 0);
        const directionToPlayer = player.position.subtract(this.position).normalize();
        if (directionToPlayer.magnitudeSq() > 0) {
            this.viewDirection = directionToPlayer;
        }

        if (this.attackCooldown <= 0 && this.initialAttackDelayTimer <= 0) {
            const projectileSpawnPos = this.position.add(this.viewDirection.multiply(this.size.x / 2 + 5));
            projectiles.push(new Projectile(projectileSpawnPos, this.viewDirection, this.attackDamage, false));
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
            const distanceToWaypointSq = this.position.distanceSq(targetWaypoint);

            if (targetWaypoint instanceof Vector2) {
                const direction = targetWaypoint.subtract(this.position).normalize();
                this.velocity = direction.multiply(this.speed * 0.8);
                if (this.velocity.magnitude() > 0.1) this.viewDirection = direction;
            } else {
                this.velocity = new Vector2(0, 0);
                this.currentPath = null;
            }


            if (distanceToWaypointSq < (this.pathGridSize / 2) ** 2) {
                this.currentWaypointIndex++;
                if (this.currentWaypointIndex >= this.currentPath.length) {
                    this.velocity = new Vector2(0, 0);
                    this.currentPath = null;
                    this.state = 'idle';
                    this.idleTimer = 1.5 + Math.random();
                    this.searchLookTimer = 0;

                    if (this.investigationPoint && this.investigationSubPoints.includes(this.target)) {
                         this.currentInvestigationSubPointIndex++;
                    }
                    return;
                }
            }
        } else {
            this.velocity = new Vector2(0, 0);
            if (this.target && this.pathRecalculateTimer <= 0 && this.state !== 'idle') {
                this.calculatePath(this.target, this.currentFloor, currentObstacles);
                if (!this.currentPath) {
                    this.state = 'idle';
                    this.idleTimer = 1.0 + Math.random();
                }
            } else if (this.state !== 'idle') {
                this.state = 'idle';
                this.idleTimer = Math.max(this.idleTimer, 0.5);
            }
        }
    }

    setInvestigationPoint(point, floor, currentObstacles, isReinvestigation = false) {
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

        this.calculatePath(this.investigationPoint, floor, currentObstacles);
        this.target = this.investigationPoint;

        if (!this.currentPath && this.investigationSubPoints.length > 0) {
            this.target = this.investigationSubPoints[0];
            this.calculatePath(this.target, floor, currentObstacles);
            this.currentInvestigationSubPointIndex = 0;
        } else if (!this.currentPath) {
            this.state = 'idle';
            this.idleTimer = 1.0;
        }
    }


    alert(investigationPos, alertFloor, alertLevel = 1, isGunshot = false) {
        if (alertLevel < this.alertLevel && (this.state === 'chase' || this.state === 'attack' || this.alertLevel === 2)) return;

        if (this.building && this.currentFloor !== alertFloor) {
            console.log(`Human on floor ${this.currentFloor} ignoring alert from floor ${alertFloor}`);
            return;
        }

        const offset = Vector2.fromAngle(Math.random() * Math.PI * 2, Math.random() * 20 + 10);
        const finalInvestigationPos = investigationPos.add(offset);

        const previousAlertLevel = this.alertLevel;
        this.alertLevel = Math.max(this.alertLevel, alertLevel);
        this.alertTimer = Math.max(this.alertTimer, isGunshot ? 25 : 18);

        const setNewPoint = this.alertLevel > previousAlertLevel ||
                           !this.investigationPoint ||
                           finalInvestigationPos.distance(this.investigationPoint) > 100;

        if (setNewPoint && this.state !== 'attack') {
            let obstaclesForAlertFloor = [];
            if (this.building) {
                obstaclesForAlertFloor = this.building.getObstacles(alertFloor);
            }

            this.setInvestigationPoint(finalInvestigationPos, alertFloor, obstaclesForAlertFloor);
            this.state = 'alert';
        } else if (this.state !== 'attack' && this.state !== 'chase') {
             this.state = 'alert';
        }
    }

    isPointInObstaclesList(point, obstacles) {
        for (const obstacle of obstacles) {
            if (obstacle.isStairs || (obstacle.isDoor && obstacle.isOpen)) continue;

            const rect = obstacle.getRectData();
            if (
                point.x >= rect.x - rect.width / 2 &&
                point.x <= rect.x + rect.width / 2 &&
                point.y >= rect.y - rect.height / 2 &&
                point.y <= rect.y + rect.height / 2
            ) { return true; }
        }
        return false;
    }


    calculatePath(targetPos, floorIndex, obstacles) {
        if (!targetPos) {
            this.currentPath = null;
            this.currentWaypointIndex = 0;
            return;
        }
        if (this.pathRecalculateTimer > 0 && this.currentPath) return;

        const targetFloorIndex = floorIndex;

        const newPath = findPath(
            this.position,
            this.currentFloor,
            targetPos,
            targetFloorIndex,
            this.building,
            this.pathGridSize
        );


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
              ctx.font = 'bold 18px Orbitron';
              ctx.textAlign = 'center';
              ctx.fillText('?', this.position.x - camera.x, this.position.y - camera.y - this.size.y / 2 - 10);
              ctx.textAlign = 'left';
         } else if (this.alertLevel === 2) {
              ctx.fillStyle = 'red';
              ctx.font = 'bold 18px Orbitron';
              ctx.textAlign = 'center';
              ctx.fillText('!', this.position.x - camera.x, this.position.y - camera.y - this.size.y / 2 - 10);
              ctx.textAlign = 'left';
         }

         if (this.gunFlashTimer > 0) {
             const flashSize = 12;
             const direction = this.viewDirection.magnitudeSq() > 0 ? this.viewDirection : new Vector2(0, -1);
             const flashX = this.position.x + direction.x * (this.size.x / 2 + 5) - camera.x;
             const flashY = this.position.y + direction.y * (this.size.y / 2 + 5) - camera.y;

             ctx.fillStyle = 'rgba(255, 220, 0, 0.9)';
             ctx.beginPath();
             ctx.arc(flashX, flashY, flashSize / 2, 0, Math.PI * 2);
             ctx.fill();
         }
    }

    takeDamage(amount, source = null, killContext = 'other') {
         const died = super.takeDamage(amount, source, killContext);
         if (!died && source && source.isPlayer) {
              this.alert(source.position, source.currentFloor, 2, killContext === 'gun');
         }
         return died;
    }
}
