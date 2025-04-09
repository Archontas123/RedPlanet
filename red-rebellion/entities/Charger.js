import { Human } from './Human.js';
import { Vector2 } from '../utils.js';
import { findPath } from '../pathfinding.js'; // Keep for potential complex movement later

export class Charger extends Human {
    constructor(patrolPath, settlement, building) {
        // Use super constructor but override some properties
        super(patrolPath, settlement, building);

        this.color = '#ff884d'; // Distinct color (e.g., orange)
        this.health = 120;      // Slightly less health
        this.maxHealth = 120;
        this.speed = 180;       // Faster speed
        this.attackRange = 40;  // Melee range
        this.attackDamage = 15; // Higher melee damage
        this.attackCooldown = 0;
        this.meleeAttackCooldownTime = 0.8; // Cooldown for melee swings
        this.state = 'patrol'; // Start patrolling like a normal human

        // Remove gun-related properties if not needed
        this.gunCooldown = 0;
        this.gunFlashDuration = 0;
        this.gunFlashTimer = 0;
        this.initialAttackDelayTimer = 0.1; // Shorter delay before first attack

        console.log("Charger created at:", this.position);
    }

    // Override the attack state for melee behavior
    attack(deltaTime, player, isLineOfSightClearFunc, projectiles, currentObstacles) {
        const sameBuildingAndFloor = this.building && player.currentBuilding === this.building && this.currentFloor === player.currentFloor;
        const canAttack = (!this.building || sameBuildingAndFloor) && player && player.health > 0;

        if (!canAttack) {
            this.state = 'patrol';
            this.calculatePath(this.patrolPath[this.currentPatrolIndex], this.currentFloor, currentObstacles);
            return;
        }

        const distanceToPlayer = this.position.distance(player.position);

        // If too far, switch back to chase (even if LOS is clear)
        if (distanceToPlayer > this.attackRange * 1.2) { // Use 1.2 buffer to prevent rapid state switching
            this.target = player.position;
            this.state = 'chase';
            this.alertLevel = 2;
            this.alertTimer = 15;
            this.calculatePath(this.target, this.currentFloor, currentObstacles);
            return;
        }

        // --- In Melee Range ---
        this.currentPath = null; // Stop path following
        const directionToPlayer = player.position.subtract(this.position).normalize();
        if (directionToPlayer.magnitudeSq() > 0) {
            this.viewDirection = directionToPlayer; // Face player
        }

        // Move slightly towards player even when attacking to close small gaps
        this.velocity = directionToPlayer.multiply(this.speed * 0.3);

        // Perform melee attack if cooldown allows
        if (this.attackCooldown <= 0 && this.initialAttackDelayTimer <= 0) {
            console.log("Charger attacking player!");
            // Directly damage player (no projectile)
            // Need access to gameOverCallback from player.takeDamage
            // We might need to pass 'game' instance here too if player.takeDamage needs it
            player.takeDamage(this.damage, null, this, 'melee'); // Pass self as source, context 'melee'
            this.attackCooldown = this.meleeAttackCooldownTime; // Reset attack cooldown
        }
    }

    // Override chase to be more aggressive? Or keep Human's chase?
    // For simplicity, let's keep Human's chase for now, which uses pathfinding.
    // chase(deltaTime, player, currentObstacles) {
    //     // Could implement a simpler direct charge here if desired
    //     super.chase(deltaTime, player, currentObstacles);
    // }

    // Chargers don't seek cover or reposition in the same way
    findNearbyCover(obstacles, threatPosition) {
        return null; // Chargers don't use cover
    }

    findRepositionPoint(obstacles, threatPosition, isLineOfSightClearFunc) {
        return null; // Chargers don't reposition, they charge
    }

    // Override draw if needed for different appearance (color is handled in constructor)
    // draw(ctx, camera) {
    //     super.draw(ctx, camera); // Call parent draw first
    //     // Add specific charger visuals if any
    // }
}
