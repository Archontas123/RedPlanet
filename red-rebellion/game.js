document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('start-button');
    const retryButton = document.getElementById('retry-button');
    const menuScreen = document.getElementById('menu-screen');
    const gameScreen = document.getElementById('game-screen');
    const gameOverScreen = document.getElementById('game-over-screen');
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const healthFill = document.getElementById('health-fill');
    const plasmaScoreDisplay = document.getElementById('plasma-score');
    const finalPlasmaScoreDisplay = document.getElementById('final-plasma-score');
    const weaponDisplay = document.getElementById('weapon-display');

    let gameActive = false;
    let lastTime = 0;
    let player;
    let settlements = [];
    let projectiles = [];
    let plasmaScore = 0;
    let worldWidth = 3000;
    let worldHeight = 3000;
    let camera = { x: 0, y: 0 };
    let mousePos = { x: 0, y: 0 };
    let mouseClick = false;

    // --- Utility Functions ---
    function lineIntersectsRect(p1, p2, rect) {
        // Check intersection with each of the 4 rectangle lines
        const { x, y, width, height } = rect;
        const topLeft = { x: x - width / 2, y: y - height / 2 };
        const topRight = { x: x + width / 2, y: y - height / 2 };
        const bottomLeft = { x: x - width / 2, y: y + height / 2 };
        const bottomRight = { x: x + width / 2, y: y + height / 2 };

        return (
            lineIntersectsLine(p1, p2, topLeft, topRight) ||
            lineIntersectsLine(p1, p2, topRight, bottomRight) ||
            lineIntersectsLine(p1, p2, bottomRight, bottomLeft) ||
            lineIntersectsLine(p1, p2, bottomLeft, topLeft)
        );
    }

    function lineIntersectsLine(p1, p2, p3, p4) {
        const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
        if (d === 0) return false; // Parallel lines

        const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
        const u = -((p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x)) / d;

        return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    }
    // --- End Utility Functions ---


    class Vector2 {
        constructor(x, y) { this.x = x; this.y = y; }
        add(v) { return new Vector2(this.x + v.x, this.y + v.y); }
        subtract(v) { return new Vector2(this.x - v.x, this.y - v.y); }
        multiply(scalar) { return new Vector2(this.x * scalar, this.y * scalar); }
        magnitude() { return Math.sqrt(this.x * this.x + this.y * this.y); }
        normalize() {
            const mag = this.magnitude();
            return mag === 0 ? new Vector2(0, 0) : new Vector2(this.x / mag, this.y / mag);
        }
        distance(v) { return this.subtract(v).magnitude(); }
        angle() { return Math.atan2(this.y, this.x); }
        static fromAngle(angle, magnitude = 1) {
             return new Vector2(Math.cos(angle) * magnitude, Math.sin(angle) * magnitude);
        }
    }

    class Obstacle {
         constructor(position, size) {
              this.position = position; // Center position
              this.size = size;
              this.color = '#555555'; // Dark grey
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

         // For line intersection checks
         getRectData() {
              return {
                   x: this.position.x,
                   y: this.position.y,
                   width: this.size.x,
                   height: this.size.y
              };
         }
    }


    class Entity {
        constructor(position, size, color) {
            this.position = position;
            this.size = size;
            this.color = color;
            this.velocity = new Vector2(0, 0);
            this.health = 100;
            this.maxHealth = 100;
            this.isPlayer = false;
            this.isHuman = false;
        }

        update(deltaTime) {
            // Store previous position for collision resolution
            const prevPosition = new Vector2(this.position.x, this.position.y);

            // Apply velocity
            this.position = this.position.add(this.velocity.multiply(deltaTime));

            // Check and resolve collisions with obstacles
            this.checkObstacleCollisions(prevPosition);
        }

        checkObstacleCollisions(prevPosition) {
            let collidedX = false;
            let collidedY = false;

            settlements.forEach(settlement => {
                 // Only check obstacles in nearby settlements for performance?
                 // For now, check all obstacles. Could optimize later.
                 settlement.obstacles.forEach(obstacle => {
                      if (this.collidesWithRect(obstacle)) {
                           // Collision detected, try resolving axis separately
                           const currentPos = new Vector2(this.position.x, this.position.y);

                           // Try moving only on X axis from previous position
                           this.position.x = prevPosition.x + this.velocity.x * (lastTime - performance.now() + 16.6)/1000; // Estimate delta time for this step
                           this.position.y = prevPosition.y;
                           if (!this.collidesWithRect(obstacle)) {
                                collidedY = true; // Collision happened due to Y movement
                                this.position.y = currentPos.y; // Keep original Y if X move is fine
                           } else {
                                // Try moving only on Y axis from previous position
                                this.position.x = prevPosition.x;
                                this.position.y = prevPosition.y + this.velocity.y * (lastTime - performance.now() + 16.6)/1000;
                                if (!this.collidesWithRect(obstacle)) {
                                     collidedX = true; // Collision happened due to X movement
                                     this.position.x = currentPos.x; // Keep original X if Y move is fine
                                } else {
                                     // Collision on both axes, revert to previous position
                                     collidedX = true;
                                     collidedY = true;
                                }
                           }
                           // Revert position fully if both failed or revert partially
                           if (collidedX && collidedY) {
                                this.position = prevPosition;
                                this.velocity = new Vector2(0, 0); // Stop movement
                           } else if (collidedX) {
                                this.position.x = prevPosition.x;
                                this.velocity.x = 0;
                           } else if (collidedY) {
                                this.position.y = prevPosition.y;
                                this.velocity.y = 0;
                           }
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

        takeDamage(amount, source = null) {
            this.health -= amount;
            return this.health <= 0;
        }
    }

    class Player extends Entity {
        constructor(position) {
            super(position, new Vector2(30, 30), '#00ff00');
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
        }

        update(deltaTime, keys) {
            if (keys.shift && !this.isSneaking) {
                this.isSneaking = true;
                this.speed = this.sneakSpeed;
                this.detectionMultiplier = 0.4;
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

            // Call Entity's update which handles movement and collision
            super.update(deltaTime);

            this.constrainToWorld(); // Keep player within world bounds

            if (keys.e) {
                this.switchWeapon();
                keys.e = false;
            }

            if (this.attackCooldown > 0) {
                this.attackCooldown -= deltaTime;
            }

            healthFill.style.width = `${(this.health / this.maxHealth) * 100}%`;
            weaponDisplay.textContent = `Weapon: ${this.weapons[this.currentWeaponIndex]}`;
        }

        draw(ctx, camera) {
             ctx.save();
             if (this.isSneaking) {
                 ctx.globalAlpha = 0.6;
             }
             super.draw(ctx, camera);
             ctx.restore();

             if (this.weapons[this.currentWeaponIndex] === 'Knife' && this.attackCooldown > 0 && this.attackCooldown < 0.1) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(this.position.x - camera.x, this.position.y - camera.y, this.knifeRange, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        attack() {
            if (this.attackCooldown > 0) return;

            const weapon = this.weapons[this.currentWeaponIndex];
            if (weapon === 'Knife') {
                this.attackCooldown = this.knifeCooldown;
                let killed = false;
                settlements.forEach(settlement => {
                    settlement.humans.forEach(human => {
                        if (!killed && this.position.distance(human.position) < this.knifeRange) {
                            // Check Line of Sight for knife too? Optional.
                            if (isLineOfSightClear(this.position, human.position, settlement.obstacles)) {
                                if (human.takeDamage(this.knifeDamage, this)) {
                                    settlement.removeHuman(human);
                                    killed = true;
                                }
                            }
                        }
                    });
                });
            } else if (weapon === 'Gun') {
                this.attackCooldown = this.gunCooldown;
                const targetWorldX = mousePos.x + camera.x;
                const targetWorldY = mousePos.y + camera.y;
                const direction = new Vector2(targetWorldX - this.position.x, targetWorldY - this.position.y).normalize();

                projectiles.push(new Projectile(this.position.add(direction.multiply(20)), direction, this.gunDamage, true));

                settlements.forEach(settlement => {
                    if (this.position.distance(settlement.position) < settlement.radius + 300) {
                        settlement.alertSettlement(this.position);
                    }
                });
            }
        }

        switchWeapon() {
            this.currentWeaponIndex = (this.currentWeaponIndex + 1) % this.weapons.length;
        }

        takeDamage(amount, source = null) {
            if (super.takeDamage(amount, source)) {
                gameOver();
            }
        }

        constrainToWorld() {
            const halfWidth = this.size.x / 2;
            const halfHeight = this.size.y / 2;
            this.position.x = Math.max(halfWidth, Math.min(worldWidth - halfWidth, this.position.x));
            this.position.y = Math.max(halfHeight, Math.min(worldHeight - halfHeight, this.position.y));
        }
    }

    class Human extends Entity {
        constructor(position, settlement) {
            super(position, new Vector2(25, 25), '#ff3a3a');
            this.isHuman = true;
            this.settlement = settlement;
            this.health = 150;
            this.maxHealth = 150;
            this.speed = 130;
            this.state = 'patrol'; // Start with patrol
            this.patrolPath = this.generatePatrolPath();
            this.currentPatrolIndex = 0;
            this.alertLevel = 0;
            this.alertTimer = 0;
            this.target = null;
            this.lastKnownPlayerPos = null;
            this.attackRange = 300;
            this.attackDamage = 8;
            this.attackCooldown = 0;
            this.gunCooldown = 1.5 + Math.random();
            this.detectionRadius = 200;
            this.fieldOfView = Math.PI / 2;
            this.viewDirection = Vector2.fromAngle(Math.random() * Math.PI * 2);
            this.idleTimer = 0; // Used for pausing during patrol/search
        }

        generatePatrolPath() {
             const path = [];
             const numPoints = Math.floor(Math.random() * 3) + 2; // 2-4 points
             for (let i = 0; i < numPoints; i++) {
                  path.push(this.getRandomPointInSettlement(this.settlement.radius * 0.8)); // Patrol within 80% radius
             }
             return path;
        }

        update(deltaTime) {
            if (this.attackCooldown > 0) this.attackCooldown -= deltaTime;
            if (this.alertTimer > 0) {
                 this.alertTimer -= deltaTime;
                 if (this.alertTimer <= 0) {
                      this.alertLevel = Math.max(0, this.alertLevel -1);
                      if(this.alertLevel === 1) this.alertTimer = 5;
                      if(this.alertLevel === 0) this.lastKnownPlayerPos = null;
                 }
            }

            this.detectPlayer(deltaTime);

            // State machine logic
            switch (this.state) {
                case 'patrol': this.patrol(deltaTime); break;
                case 'chase': this.chase(deltaTime); break;
                case 'attack': this.attack(deltaTime); break;
                case 'alert': this.alertState(deltaTime); break;
            }

            // Call Entity's update which handles movement and collision
            super.update(deltaTime);

            // Ensure human stays within settlement bounds after collision resolution
            this.constrainToSettlement();
        }

        detectPlayer(deltaTime) {
            const distanceToPlayer = this.position.distance(player.position);
            let canSeePlayer = false;

            if (distanceToPlayer < this.detectionRadius * player.detectionMultiplier) {
                const vectorToPlayer = player.position.subtract(this.position);
                const angleToPlayer = vectorToPlayer.angle();
                const viewAngle = this.viewDirection.angle();
                let angleDifference = Math.abs(angleToPlayer - viewAngle);
                if (angleDifference > Math.PI) angleDifference = 2 * Math.PI - angleDifference;

                if (angleDifference < this.fieldOfView / 2) {
                    // Check Line of Sight
                    if (isLineOfSightClear(this.position, player.position, this.settlement.obstacles)) {
                         canSeePlayer = true;
                    }
                }
            }

            if (canSeePlayer) {
                this.target = player.position;
                this.lastKnownPlayerPos = player.position;
                this.alertLevel = 2;
                this.alertTimer = 10;
                if (distanceToPlayer < this.attackRange) {
                    this.state = 'attack';
                } else {
                    this.state = 'chase';
                }
            } else {
                 if (this.state === 'attack' || this.state === 'chase') {
                      // Lost sight of player
                      if (this.lastKnownPlayerPos) {
                           this.state = 'alert'; // Go investigate last known position
                           this.target = this.lastKnownPlayerPos;
                           this.alertLevel = 1; // Become suspicious
                           this.alertTimer = 8; // Search for 8 seconds
                      } else {
                           this.state = 'patrol'; // No last known pos, return to patrol
                           this.alertLevel = 0;
                      }
                 } else if (this.state === 'alert') {
                      // Already searching, continue unless timer runs out
                      if (this.alertLevel === 0) {
                           this.state = 'patrol';
                           this.target = null;
                      }
                 } else {
                      // Currently patrolling or idle
                      this.state = 'patrol';
                      this.target = null;
                 }
            }
        }

        patrol(deltaTime) {
             if (this.patrolPath.length === 0) { // Should not happen, but fallback
                  this.state = 'idle'; // Use idle as fallback if no path
                  this.idle(deltaTime);
                  return;
             }

             const targetPoint = this.patrolPath[this.currentPatrolIndex];
             const distanceToTarget = this.position.distance(targetPoint);

             if (distanceToTarget < 10) {
                  // Reached patrol point, pause briefly
                  this.velocity = new Vector2(0, 0);
                  this.idleTimer = Math.random() * 1 + 0.5; // Pause for 0.5-1.5 seconds
                  this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.patrolPath.length;
                  this.state = 'idle'; // Use idle state for pausing
             } else {
                  // Move towards patrol point
                  const direction = targetPoint.subtract(this.position).normalize();
                  this.velocity = direction.multiply(this.speed * 0.5); // Patrol slower
                  this.viewDirection = direction;
             }
        }

        // Use idle state for pausing during patrol or searching
        idle(deltaTime) {
             this.velocity = new Vector2(0, 0);
             this.idleTimer -= deltaTime;
             if (this.idleTimer <= 0) {
                  if (this.state === 'idle' && this.alertLevel === 0) {
                       this.state = 'patrol'; // Return to patrol after pause
                  } else if (this.state === 'idle' && this.alertLevel > 0) {
                       // Finished pausing while searching, maybe look around?
                       this.viewDirection = Vector2.fromAngle(this.viewDirection.angle() + (Math.random() - 0.5));
                       this.idleTimer = 0.5; // Look for another 0.5s
                       if (this.alertTimer <= 0) this.state = 'patrol'; // If alert timed out, patrol
                  }
             }
        }


        chase(deltaTime) {
            if (!this.target) { this.state = 'patrol'; return; }
            const direction = this.target.subtract(this.position).normalize();
            this.velocity = direction.multiply(this.speed);
            this.viewDirection = direction;
        }

        attack(deltaTime) {
            if (!this.target) { this.state = 'patrol'; return; }
            this.velocity = new Vector2(0, 0);
            const directionToPlayer = player.position.subtract(this.position).normalize();
            this.viewDirection = directionToPlayer;

            if (this.attackCooldown <= 0) {
                 // Check LoS before firing
                 if (isLineOfSightClear(this.position, player.position, this.settlement.obstacles)) {
                      projectiles.push(new Projectile(this.position.add(directionToPlayer.multiply(20)), directionToPlayer, this.attackDamage, false));
                      this.attackCooldown = this.gunCooldown;
                 } else {
                      // Can't shoot, maybe move to get clear shot? (Advanced)
                      // For now, just wait or switch state
                      this.state = 'chase'; // Try to reposition
                 }
            }
        }

        alertState(deltaTime) {
             if (!this.target) { this.state = 'patrol'; return; } // Target should be lastKnownPlayerPos or noise source
             const distanceToTarget = this.position.distance(this.target);

             if (distanceToTarget < 15) {
                  // Reached investigation point
                  this.velocity = new Vector2(0, 0);
                  this.state = 'idle'; // Pause and "look around"
                  this.idleTimer = 1.5 + Math.random(); // Pause for 1.5-2.5 seconds
                  this.target = null; // Clear target, will return to patrol if alert timer runs out
             } else {
                  // Move towards investigation point
                  const direction = this.target.subtract(this.position).normalize();
                  this.velocity = direction.multiply(this.speed * 0.8); // Move faster than patrol, slower than chase
                  this.viewDirection = direction;
             }
        }


        alert(sourcePosition) {
             if (this.alertLevel < 2) {
                  this.alertLevel = 2;
                  this.alertTimer = 15;
                  this.lastKnownPlayerPos = sourcePosition;
                  this.target = sourcePosition;
                  this.state = 'alert';
             } else {
                  // Already fully alert, update last known position and reset timer
                  this.lastKnownPlayerPos = sourcePosition;
                  this.target = sourcePosition;
                  this.alertTimer = 15;
                  if (this.state !== 'attack') this.state = 'alert'; // Don't interrupt attack state
             }
        }

        getRandomPointInSettlement(radius = this.settlement.radius * 0.9) {
            // Ensure point is not inside an obstacle
            let point;
            let attempts = 0;
            do {
                 point = this.settlement.position.add(new Vector2(
                      (Math.random() - 0.5) * 2 * radius,
                      (Math.random() - 0.5) * 2 * radius
                 ));
                 attempts++;
            } while (this.isPointInObstacle(point) && attempts < 10);
            return point;
        }

        isPointInObstacle(point) {
             for (const obstacle of this.settlement.obstacles) {
                  if (
                       point.x > obstacle.position.x - obstacle.size.x / 2 &&
                       point.x < obstacle.position.x + obstacle.size.x / 2 &&
                       point.y > obstacle.position.y - obstacle.size.y / 2 &&
                       point.y < obstacle.position.y + obstacle.size.y / 2
                  ) {
                       return true;
                  }
             }
             return false;
        }


        constrainToSettlement() {
             const distFromCenter = this.position.distance(this.settlement.position);
             if (distFromCenter > this.settlement.radius) {
                 const directionToCenter = this.settlement.position.subtract(this.position).normalize();
                 this.position = this.settlement.position.add(directionToCenter.multiply(this.settlement.radius));
                 this.velocity = new Vector2(0,0);
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

        takeDamage(amount, source = null) {
             const died = super.takeDamage(amount, source);
             if (!died && source && source.isPlayer) {
                  this.alert(source.position);
                  this.settlement.alertSettlement(source.position);
             }
             return died;
        }
    }

     class Projectile {
        constructor(position, direction, damage, isPlayerBullet) {
            this.position = position;
            this.velocity = direction.multiply(800);
            this.damage = damage;
            this.isPlayerBullet = isPlayerBullet;
            this.size = 5;
            this.color = isPlayerBullet ? '#00ffff' : '#ffaa00';
            this.lifeTime = 2;
        }

        update(deltaTime) {
            this.position = this.position.add(this.velocity.multiply(deltaTime));
            this.lifeTime -= deltaTime;

            // Check collision with obstacles
            settlements.forEach(settlement => {
                 settlement.obstacles.forEach(obstacle => {
                      if (
                           this.position.x > obstacle.position.x - obstacle.size.x / 2 &&
                           this.position.x < obstacle.position.x + obstacle.size.x / 2 &&
                           this.position.y > obstacle.position.y - obstacle.size.y / 2 &&
                           this.position.y < obstacle.position.y + obstacle.size.y / 2
                      ) {
                           this.lifeTime = 0; // Destroy projectile on obstacle hit
                      }
                 });
            });
            if (this.lifeTime <= 0) return; // Skip entity collision if hit obstacle


            // Check collision with entities
            if (this.isPlayerBullet) {
                settlements.forEach(settlement => {
                    settlement.humans.forEach(human => {
                        if (this.position.distance(human.position) < (this.size + human.size.x) / 2) {
                            if (human.takeDamage(this.damage, player)) {
                                settlement.removeHuman(human);
                            }
                            this.lifeTime = 0;
                        }
                    });
                });
            } else { // Enemy bullet
                if (this.position.distance(player.position) < (this.size + player.size.x) / 2) {
                    player.takeDamage(this.damage);
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


    class Settlement {
        constructor(position, radius, numHumans) {
            this.position = position;
            this.radius = radius;
            this.humans = [];
            this.obstacles = []; // Added obstacles array
            this.color = 'rgba(100, 100, 100, 0.08)';
            this.cleared = false;
            this.plasmaReward = numHumans * 25;

            // Generate Obstacles
            const numObstacles = Math.floor(radius / 40) + Math.floor(Math.random() * 3); // More obstacles for larger settlements
            for (let i = 0; i < numObstacles; i++) {
                 let obsPos, obsSize;
                 let attempts = 0;
                 do {
                      const angle = Math.random() * Math.PI * 2;
                      const dist = Math.random() * radius * 0.85; // Place within 85% radius
                      obsPos = position.add(new Vector2(Math.cos(angle) * dist, Math.sin(angle) * dist));
                      const width = Math.random() * 40 + 20; // 20-60 width
                      const height = Math.random() * 40 + 20; // 20-60 height
                      obsSize = new Vector2(width, height);
                      attempts++;
                 } while (this.isObstacleTooClose(obsPos, obsSize) && attempts < 10); // Avoid overlaps

                 if (attempts < 10) {
                      this.obstacles.push(new Obstacle(obsPos, obsSize));
                 }
            }


            // Generate Humans (ensure they don't spawn inside obstacles)
            for (let i = 0; i < numHumans; i++) {
                let humanPos;
                let attempts = 0;
                do {
                     const angle = Math.random() * Math.PI * 2;
                     const dist = Math.random() * radius * 0.9;
                     humanPos = position.add(new Vector2(Math.cos(angle) * dist, Math.sin(angle) * dist));
                     attempts++;
                } while (this.isPointInObstacle(humanPos) && attempts < 10);

                if (attempts < 10) {
                     this.humans.push(new Human(humanPos, this));
                } else {
                     console.warn("Could not place human outside obstacle.");
                }
            }
        }

        isObstacleTooClose(pos, size) {
             const halfWidth = size.x / 2;
             const halfHeight = size.y / 2;
             for (const obs of this.obstacles) {
                  const obsHalfWidth = obs.size.x / 2;
                  const obsHalfHeight = obs.size.y / 2;
                  const minGap = 15; // Minimum gap between obstacles

                  if (
                       pos.x + halfWidth + minGap > obs.position.x - obsHalfWidth &&
                       pos.x - halfWidth - minGap < obs.position.x + obsHalfWidth &&
                       pos.y + halfHeight + minGap > obs.position.y - obsHalfHeight &&
                       pos.y - halfHeight - minGap < obs.position.y + obsHalfHeight
                  ) {
                       return true; // Too close
                  }
             }
             return false;
        }

         isPointInObstacle(point) {
             for (const obstacle of this.obstacles) {
                  if (
                       point.x > obstacle.position.x - obstacle.size.x / 2 &&
                       point.x < obstacle.position.x + obstacle.size.x / 2 &&
                       point.y > obstacle.position.y - obstacle.size.y / 2 &&
                       point.y < obstacle.position.y + obstacle.size.y / 2
                  ) {
                       return true;
                  }
             }
             return false;
        }


        update(deltaTime) {
            if (this.cleared) return;
            this.humans.forEach(human => human.update(deltaTime));
        }

        draw(ctx, camera) {
            if (this.cleared) return;
            // Draw settlement area (optional)
            // ctx.fillStyle = this.color;
            // ctx.beginPath();
            // ctx.arc(this.position.x - camera.x, this.position.y - camera.y, this.radius, 0, Math.PI * 2);
            // ctx.fill();

            // Draw obstacles first
            this.obstacles.forEach(obstacle => obstacle.draw(ctx, camera));
            // Draw humans
            this.humans.forEach(human => human.draw(ctx, camera));
        }

        removeHuman(human) {
            const index = this.humans.indexOf(human);
            if (index !== -1) {
                this.humans.splice(index, 1);
            }
            if (this.humans.length === 0 && !this.cleared) {
                this.clearSettlement();
            }
        }

        clearSettlement() {
            this.cleared = true;
            plasmaScore += this.plasmaReward;
            plasmaScoreDisplay.textContent = `Plasma: ${plasmaScore}`;
            spawnSettlement();
        }

        alertSettlement(alertSourcePosition) {
             this.humans.forEach(human => {
                  if (human.position.distance(alertSourcePosition) < 400) {
                       human.alert(alertSourcePosition);
                  }
             });
        }
    }

    // Line of Sight Check Function
    function isLineOfSightClear(startPos, endPos, obstacles) {
         for (const obstacle of obstacles) {
              if (lineIntersectsRect(startPos, endPos, obstacle.getRectData())) {
                   return false; // Blocked
              }
         }
         return true; // Clear
    }


    function spawnSettlement() {
        const minRadius = 120, maxRadius = 250;
        const radius = Math.random() * (maxRadius - minRadius) + minRadius;
        const numHumans = Math.floor(radius / 75) + (Math.random() > 0.5 ? 3 : 2);
        let position;
        let attempts = 0;
        const maxAttempts = 20;

        do {
            position = new Vector2(
                Math.random() * (worldWidth - radius * 2) + radius,
                Math.random() * (worldHeight - radius * 2) + radius
            );
            attempts++;
            if (attempts > maxAttempts) {
                 console.warn("Could not find suitable position for new settlement after", maxAttempts, "attempts.");
                 return;
            }
        } while (isPositionTooClose(position, radius));

        settlements.push(new Settlement(position, radius, numHumans));
    }

    function isPositionTooClose(position, radius) {
         if (player && position.distance(player.position) < 500) return true;
         for (const s of settlements) {
              if (!s.cleared && position.distance(s.position) < s.radius + radius + 200) {
                   return true;
              }
         }
         return false;
    }


    function initGame() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        worldWidth = Math.max(3000, canvas.width * 3);
        worldHeight = Math.max(3000, canvas.height * 3);

        player = new Player(new Vector2(worldWidth / 2, worldHeight / 2));
        settlements = [];
        projectiles = [];
        plasmaScore = 0;
        plasmaScoreDisplay.textContent = `Plasma: ${plasmaScore}`;

        for (let i = 0; i < 8; i++) {
            spawnSettlement();
        }

        gameActive = true;
        lastTime = performance.now();
        requestAnimationFrame(gameLoop);
    }

    const keys = { w: false, a: false, s: false, d: false, shift: false, e: false };

    window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if (key in keys) keys[key] = true;
    });
    window.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        if (key in keys) keys[key] = false;
    });

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mousePos.x = e.clientX - rect.left;
        mousePos.y = e.clientY - rect.top;
    });

    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
            mouseClick = true;
            if (gameActive && player) {
                 player.attack();
            }
        }
    });

     canvas.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
            mouseClick = false;
        }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());


    function updateCamera() {
        camera.x = player.position.x - canvas.width / 2;
        camera.y = player.position.y - canvas.height / 2;
        camera.x = Math.max(0, Math.min(worldWidth - canvas.width, camera.x));
        camera.y = Math.max(0, Math.min(worldHeight - canvas.height, camera.y));
    }

    function drawBackground(ctx, camera) {
        ctx.fillStyle = '#4d1a00';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = 'rgba(255, 255, 200, 0.6)';
        const starCount = 150;
        for(let i=0; i<starCount; i++) {
             const seed = i * 137;
             const starX = ((seed * 17) % worldWidth);
             const starY = ((seed * 29) % worldHeight);
             const screenX = starX - camera.x;
             const screenY = starY - camera.y;
             if (screenX > -10 && screenX < canvas.width + 10 && screenY > -10 && screenY < canvas.height + 10) {
                  ctx.fillRect(screenX, screenY, 2, 2);
             }
        }
    }

    function gameLoop(timestamp) {
        if (!gameActive) return;

        const deltaTime = Math.min((timestamp - lastTime) / 1000, 0.05);
        lastTime = timestamp;

        // Update
        player.update(deltaTime, keys); // Player update now handles its own collision
        settlements.forEach(settlement => settlement.update(deltaTime)); // Human update handles collision
        projectiles.forEach(p => p.update(deltaTime));
        projectiles = projectiles.filter(p => p.lifeTime > 0);
        updateCamera();

        // Draw
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBackground(ctx, camera);
        settlements.forEach(settlement => settlement.draw(ctx, camera)); // Draws obstacles and humans
        projectiles.forEach(p => p.draw(ctx, camera));
        player.draw(ctx, camera);

        requestAnimationFrame(gameLoop);
    }

    function showScreen(screen) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        screen.classList.add('active');
    }

    function startGame() {
        showScreen(gameScreen);
        initGame();
    }

    function gameOver() {
        gameActive = false;
        finalPlasmaScoreDisplay.textContent = plasmaScore;
        showScreen(gameOverScreen);
    }

    startButton.addEventListener('click', startGame);
    retryButton.addEventListener('click', startGame);

    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
});
