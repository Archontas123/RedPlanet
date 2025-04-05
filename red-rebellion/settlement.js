import { Vector2 } from './utils.js';
import { Obstacle, Human } from './entities.js';

// Dependencies needed from main game scope:
// - spawnSettlement (Function)
// - plasmaScore (Number, needs to be updated) -> Better to return reward and update in main scope
// - plasmaScoreDisplay (DOM Element) -> Update in main scope
// - worldWidth, worldHeight (Numbers)

export class Settlement {
    constructor(position, radius, numHumans, worldWidth, worldHeight, spawnSettlementCallback, updateScoreCallback) {
        this.position = position;
        this.radius = radius;
        this.humans = [];
        this.obstacles = [];
        this.color = 'rgba(100, 100, 100, 0.08)';
        this.cleared = false;
        this.plasmaReward = numHumans * 25;
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;
        this.spawnSettlementCallback = spawnSettlementCallback; // Function to call when cleared
        this.updateScoreCallback = updateScoreCallback; // Function to update score

        const numObstacles = Math.floor(radius / 40) + Math.floor(Math.random() * 3);
        for (let i = 0; i < numObstacles; i++) {
             let obsPos, obsSize;
             let attempts = 0;
             do {
                  const angle = Math.random() * Math.PI * 2;
                  const dist = Math.random() * radius * 0.85;
                  obsPos = position.add(new Vector2(Math.cos(angle) * dist, Math.sin(angle) * dist));
                  const width = Math.random() * 40 + 20;
                  const height = Math.random() * 40 + 20;
                  obsSize = new Vector2(width, height);
                  attempts++;
             } while (this.isObstacleTooClose(obsPos, obsSize) && attempts < 10);

             if (attempts < 10) {
                  this.obstacles.push(new Obstacle(obsPos, obsSize));
             }
        }

        for (let i = 0; i < numHumans; i++) {
            const patrolPath = this.generatePatrolPath(3);

            if (patrolPath.length > 0) {
                 // Pass world dimensions and settlement reference to Human constructor
                 const newHuman = new Human(patrolPath, this, this.worldWidth, this.worldHeight);
                 // Calculate initial path for patrol
                 if (newHuman.patrolPath.length > 0) {
                      newHuman.calculatePath(newHuman.patrolPath[newHuman.currentPatrolIndex]);
                 }
                 this.humans.push(newHuman);
            } else {
                 console.warn("Could not generate valid patrol path for human.");
                 const fallbackPath = [this.getRandomPointInSettlement(this.radius * 0.5)];
                 if (!this.isPointInObstacle(fallbackPath[0])) {
                      const newHuman = new Human(fallbackPath, this, this.worldWidth, this.worldHeight);
                      // Calculate initial path for fallback
                      if (newHuman.patrolPath.length > 0) {
                           newHuman.calculatePath(newHuman.patrolPath[newHuman.currentPatrolIndex]);
                      }
                      this.humans.push(newHuman);
                 } else {
                      console.error("Fallback human placement failed.");
                 }
            }
        }
    }

    generatePatrolPath(numPoints = 3) {
         const path = [];
         const maxAttemptsPerPoint = 15;
         for (let i = 0; i < numPoints; i++) {
              let point;
              let attempts = 0;
              do {
                   const angle = Math.random() * Math.PI * 2;
                   const dist = Math.random() * this.radius * 0.8 + this.radius * 0.1;
                   point = this.position.add(new Vector2(Math.cos(angle) * dist, Math.sin(angle) * dist));
                   attempts++;
              } while (this.isPointInObstacle(point) && attempts < maxAttemptsPerPoint);

              if (attempts < maxAttemptsPerPoint) {
                   path.push(point);
              } else {
                   console.warn(`Failed to find non-obstacle point ${i+1} for patrol path.`);
                   // Return partial path if some points were found, or empty if none were
                   return path;
              }
         }
         return path;
    }

    getRandomPointInSettlement(radius = this.radius * 0.9) {
         let point;
         let attempts = 0;
         do {
              point = this.position.add(new Vector2(
                   (Math.random() - 0.5) * 2 * radius,
                   (Math.random() - 0.5) * 2 * radius
              ));
              // Clamp point within world bounds (important for pathfinding later)
              point.x = Math.max(10, Math.min(this.worldWidth - 10, point.x)); // Use worldWidth
              point.y = Math.max(10, Math.min(this.worldHeight - 10, point.y)); // Use worldHeight
              // Ensure it's within the desired radius of the settlement center
              if (point.distance(this.position) > radius) {
                  point = this.position.add(point.subtract(this.position).normalize().multiply(radius));
              }
              attempts++;
         } while (this.isPointInObstacle(point) && attempts < 10);
         return attempts < 10 ? point : this.position; // Fallback to settlement center
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
              ) { return true; }
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
              ) { return true; }
         }
         return false;
    }
 
 
    update(deltaTime, player, isLineOfSightClearFunc, projectiles) { // Pass dependencies needed by Human.update, including projectiles
        if (this.cleared) return;
        for (let i = this.humans.length - 1; i >= 0; i--) {
             // Pass player, LoS function, and projectiles to human update
             this.humans[i].update(deltaTime, player, isLineOfSightClearFunc, projectiles);
        }
    }

    draw(ctx, camera) {
        // Draw settlement radius (optional visualization)
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.position.x - camera.x, this.position.y - camera.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();


        if (this.cleared) return; // Don't draw obstacles/humans if cleared
        this.obstacles.forEach(obstacle => obstacle.draw(ctx, camera));
        this.humans.forEach(human => human.draw(ctx, camera));
    }

    notifyHumanDeath(deadHuman, killer, killContext) {
         const killPosition = deadHuman.position;
         const index = this.humans.indexOf(deadHuman);
         if (index !== -1) {
              this.humans.splice(index, 1);
         }

         // Alert nearby living humans
         if (killer && killer.isPlayer) {
              const isSilentKill = (killContext === 'knife');
              this.humans.forEach(livingHuman => {
                   const distanceToKill = livingHuman.position.distance(killPosition);
                   if (isSilentKill) {
                        // Alert if close enough to see/hear the silent kill
                        if (distanceToKill < 150) {
                             livingHuman.alert(killPosition, 1, false); // Suspicious
                        }
                   } else { // Gunshot or other non-silent kill
                        // Alert if within gunshot hearing range
                        if (distanceToKill < 400) {
                             livingHuman.alert(killPosition, 2, true); // Alerted, gunshot=true
                        }
                   }
              });
         }

         // Check if settlement is now cleared
         if (this.humans.length === 0 && !this.cleared) {
              this.clearSettlement();
         }
    }


    clearSettlement() {
        this.cleared = true;
        this.updateScoreCallback(this.plasmaReward); // Call callback to update score
        this.spawnSettlementCallback(); // Call callback to spawn a new settlement
    }

    // Alert all humans in this settlement
    alertSettlement(alertSourcePosition, isGunshot = false) {
         this.humans.forEach(human => {
              const alertLevel = isGunshot ? 2 : 1;
              human.alert(alertSourcePosition, alertLevel, isGunshot);
         });
    }
}
