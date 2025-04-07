import { Vector2, lineIntersectsRect, lineIntersectsLine, isLineOfSightClear, rayIntersectsRectDetailed } from '../utils.js';

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
        this.currentFloor = 0;
    }

    update(deltaTime, currentObstacles) {
        if (this.velocity.x === 0 && this.velocity.y === 0) return;

        const currentPosition = this.position.clone();
        const potentialNextPosition = this.position.add(this.velocity.multiply(deltaTime));

        const collisionResult = this.checkMovementCollision(currentPosition, potentialNextPosition, currentObstacles);

        this.position = collisionResult.finalPos;

        if (collisionResult.collisionNormal) {
            const dot = this.velocity.dot(collisionResult.collisionNormal);
            if (dot < 0) {
                this.velocity = this.velocity.subtract(collisionResult.collisionNormal.multiply(dot));
            }
        }
    }

    checkMovementCollision(startPos, endPos, obstacles) {
        let nearestCollisionTime = 1.0;
        let nearestCollisionNormal = null;
        const movementVector = endPos.subtract(startPos);
        const moveLength = movementVector.magnitude();

        if (moveLength < 1e-6) {
             // Return object structure consistent with the collision case
             return { finalPos: startPos, collisionNormal: null };
        }

        const rayOrigin = startPos;
        const rayDir = movementVector;

        obstacles.forEach(obstacle => {
            if ((obstacle.isDoor && obstacle.isOpen) || obstacle.isStairs) {
                return;
            }

            const obsRect = obstacle.getRectData();

            const expandedRect = {
                x: obsRect.x,
                y: obsRect.y,
                width: obsRect.width + this.size.x,
                height: obsRect.height + this.size.y
            };

            const intersection = rayIntersectsRectDetailed(rayOrigin, rayDir, expandedRect);

            if (intersection && intersection.t >= 0 && intersection.t < nearestCollisionTime) {
                const hitDistance = intersection.t * moveLength;
                if (hitDistance >= 0 && hitDistance <= moveLength) {
                    nearestCollisionTime = intersection.t;
                    nearestCollisionNormal = intersection.normal;
                }
            }
        });

        const epsilon = 0.001;
        const safeMoveFraction = Math.max(0, nearestCollisionTime - epsilon / moveLength);
        const finalPos = startPos.add(movementVector.multiply(safeMoveFraction));

        return { finalPos: finalPos, collisionNormal: nearestCollisionNormal };
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
        // Draw the entity's basic rectangle representation at its world position
        ctx.fillStyle = this.color;
        ctx.fillRect(
            this.position.x - this.size.x / 2, // Removed - camera.x
            this.position.y - this.size.y / 2, // Removed - camera.y
            this.size.x,
            this.size.y
        );

        // Draw health bar if needed, scaling UI elements inversely with zoom
        if (this.health < this.maxHealth && this.health > 0) {
            const barWidth = this.size.x; // Keep width relative to entity size
            const barHeight = 5 / camera.zoom; // Scale height based on zoom
            const barX = this.position.x - barWidth / 2; // Removed - camera.x
            const barY = this.position.y - this.size.y / 2 - barHeight - (5 / camera.zoom); // Removed - camera.y, adjust offset

            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(barX, barY, barWidth, barHeight); // Use world coords for position
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

    getRectData() {
        return {
            x: this.position.x,
            y: this.position.y,
            width: this.size.x,
             height: this.size.y
         };
     }

     // Get the Y coordinate for depth sorting (bottom of the entity)
     getSortY() {
         // Default assumes drawing is centered vertically on position.y
         // Override in subclasses if drawing anchor is different (e.g., bottom-anchored sprites)
         // Subtract epsilon for sort stability against player
         return this.position.y + this.size.y / 2 - 0.01;
     }
 }
