import { Vector2, lineIntersectsRect } from '../utils.js';

export class Projectile {
    constructor(position, direction, damage, isPlayerBullet) {
        this.position = position;
        this.velocity = direction.multiply(800);
        this.damage = damage;
        this.isPlayerBullet = isPlayerBullet;
        this.size = 5;
        this.color = isPlayerBullet ? '#00ffff' : '#ffaa00';
        this.lifeTime = 2;
        this.collided = false;
    }

    update(deltaTime, worldManager, player, gameOverCallback) {
        if (this.collided) return;

        const prevPos = new Vector2(this.position.x, this.position.y);
        this.position = this.position.add(this.velocity.multiply(deltaTime));
        this.lifeTime -= deltaTime;

        if (this.lifeTime <= 0) {
            this.collided = true;
            return;
        }

        let hitObstacle = false;
        let currentBuilding = null;
        let currentFloorIndex = 0;
        let obstaclesToCheck = [];

        const { chunkX, chunkY } = worldManager.getChunkCoords(this.position.x, this.position.y);
        const currentChunk = worldManager.getChunk(chunkX, chunkY);

        if (currentChunk && currentChunk.settlement) {
            for (const building of currentChunk.settlement.buildings) {
                if (building.containsPoint(this.position)) {
                    currentBuilding = building;
                    break;
                }
            }
        }

        if (currentBuilding) {
            currentFloorIndex = 0;
            obstaclesToCheck = currentBuilding.getObstacles(currentFloorIndex);
        } else {
            obstaclesToCheck = [];
        }

        for (const obstacle of obstaclesToCheck) {
             if ((obstacle.isDoor && obstacle.isOpen) || obstacle.isStairs) {
                 continue;
             }
             if (lineIntersectsRect(prevPos, this.position, obstacle.getRectData())) {
                 this.lifeTime = 0;
                 hitObstacle = true;
                 this.collided = true;
                 break;
             }
        }

        if (hitObstacle) return;


        if (this.isPlayerBullet) {
            const activeSettlements = worldManager.getActiveSettlements();
            activeSettlements.forEach(settlement => {
                settlement.humans.forEach(human => {
                    const sameFloor = !human.building || human.currentFloor === currentFloorIndex;
                    if (sameFloor && this.lifeTime > 0 && this.position.distance(human.position) < (this.size + human.size.x) / 2) {
                        human.takeDamage(this.damage, player, 'gun');
                        this.lifeTime = 0;
                        this.collided = true; // Mark as collided after hitting human
                    }
                });
            });
        } else {
            // Check floor match for player collision if player is inside
            const sameFloorAsPlayer = !player.currentBuilding || player.currentFloor === currentFloorIndex;
            if (sameFloorAsPlayer && this.lifeTime > 0 && this.position.distance(player.position) < (this.size + player.size.x) / 2) {
                player.takeDamage(this.damage, gameOverCallback, null, 'gun');
                this.lifeTime = 0;
                this.collided = true; // Mark as collided after hitting player
            }
        }
    }

    draw(ctx, camera) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
         // Draw at world position, scale radius inversely with zoom
         ctx.arc(this.position.x, this.position.y, (this.size / 2) / camera.zoom, 0, Math.PI * 2); // Removed - camera.x/y
         ctx.fill();
     }

     // Get the Y coordinate for depth sorting (bottom of the projectile)
     getSortY() {
         // Since drawing is centered, bottom is position.y + radius
         // Subtract epsilon for sort stability against player
         return this.position.y + this.size / 2 - 0.01;
     }
 }
