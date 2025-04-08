import { Entity } from './Entity.js';
import { Vector2 } from '../math/Vector2.js';
import { ItemDrop } from './ItemDrop.js';

export class MineralDeposit extends Entity {
    constructor(position, depositType = 'stone') {
        // Set properties based on deposit type
        const size = new Vector2(40, 30);
        let color = '#808080'; // Default stone color
        
        if (depositType === 'iron') {
            color = '#a52a2a'; // Reddish for iron oxide
        } else if (depositType === 'copper') {
            color = '#b87333'; // Copper color
        } else if (depositType === 'titanium') {
            color = '#c0c0c0'; // Silvery for titanium
        } else if (depositType === 'plasma_crystal') {
            color = '#00ffff'; // Cyan for plasma crystals
        }
        
        super(position, size, color);
        
        this.depositType = depositType;
        this.health = this.getMaxHealthForType(depositType);
        this.maxHealth = this.health;
        this.requiredTool = 'pickaxe';
        this.resourceType = depositType;
        this.dropAmount = this.getDropAmountForType(depositType);
        this.isInteractable = true;
        this.interactionRadius = 70;
        this.isResourceNode = true;
        this.type = 'MineralDeposit';
    }
    
    getMaxHealthForType(type) {
        switch(type) {
            case 'stone': return 3;
            case 'iron': return 5;
            case 'copper': return 7;
            case 'titanium': return 10;
            case 'plasma_crystal': return 15;
            default: return 3;
        }
    }
    
    getDropAmountForType(type) {
        switch(type) {
            case 'stone': return 1;
            case 'iron': return 1;
            case 'copper': return 1;
            case 'titanium': return 1;
            case 'plasma_crystal': return 1;
            default: return 1;
        }
    }

    interact(player, game) {
        // Check if the deposit is already mined out
        if (this.health <= 0) {
            console.log("Mineral deposit is depleted.");
            return { mined: true, entity: this };
        }

        // Check if player has the required tool equipped
        const equippedWeapon = player.weapons[player.currentWeaponIndex];
        if (equippedWeapon.toLowerCase() === this.requiredTool) {
            this.health--;
            console.log(`Mining deposit! Health: ${this.health}/${this.maxHealth}`);

            if (this.health <= 0) {
                console.log("Mineral deposit mined out!");
                this.isInteractable = false;
                return { mined: true, entity: this };
            }
            return { mined: false };
        } else {
            console.log(`Need a ${this.requiredTool} to mine this deposit.`);
            return { mined: false, error: `Requires ${this.requiredTool}` };
        }
    }

    // Method called when the deposit takes damage, e.g., from mining
    takeDamage(amount, source, toolType = 'other') {
        if (this.health <= 0) return false; // Can't damage a depleted deposit

        // Only take damage from the correct tool
        if (toolType.toLowerCase() === this.requiredTool) {
            this.health -= amount;
            console.log(`Deposit took ${amount} damage from ${toolType}. Health: ${this.health}/${this.maxHealth}`);

            if (this.health <= 0) {
                this.health = 0;
                this.isInteractable = false;
                console.log("Deposit depleted by takeDamage!");
                return true; // Indicate that the deposit was depleted
            }
            return false; // Indicate deposit was damaged but not depleted
        } else {
            console.log(`Ineffective tool (${toolType}) used on deposit.`);
            return false; // No damage taken
        }
    }

    // Method to get the resources dropped when mined
    getResourceDrops() {
        if (this.health > 0) return []; // Only drop when depleted

        return [{ type: this.resourceType, quantity: this.dropAmount }];
    }

    draw(ctx, camera) {
        if (this.health <= 0) return; // Don't draw if depleted

        // Use world coordinates directly
        const worldX = this.position.x;
        const worldY = this.position.y;

        // Draw the main deposit
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.ellipse(
            worldX,
            worldY,
            this.size.x / 2,
            this.size.y / 2,
            0,
            0,
            Math.PI * 2
        );
        ctx.fill();
        
        // Draw some mineral detail lines
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1 / camera.zoom;
        
        // Draw a few random lines to represent mineral veins
        const numLines = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < numLines; i++) {
            const angle1 = Math.random() * Math.PI * 2;
            const angle2 = angle1 + (Math.random() * Math.PI / 2 - Math.PI / 4);
            const radius = (this.size.x / 2) * 0.8;
            
            const x1 = worldX + Math.cos(angle1) * radius * 0.5;
            const y1 = worldY + Math.sin(angle1) * radius * 0.5;
            const x2 = worldX + Math.cos(angle2) * radius;
            const y2 = worldY + Math.sin(angle2) * radius;
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }

        // Draw health bar if damaged
        if (this.health < this.maxHealth && this.health > 0) {
            const barWidth = this.size.x;
            const barHeight = 5 / camera.zoom;
            const barX = worldX - barWidth / 2;
            const barY = worldY - this.size.y / 2 - barHeight - (5 / camera.zoom);
            
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(barX, barY, barWidth, barHeight);
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(barX, barY, barWidth * (this.health / this.maxHealth), barHeight);
        }
    }

    // Override default getRectData for collision detection
    getRectData() {
        return {
            x: this.position.x,
            y: this.position.y,
            width: this.size.x,
            height: this.size.y
        };
    }

    // Get the Y coordinate for depth sorting
    getSortY() {
        return this.position.y + this.size.y / 2 - 0.01;
    }
}