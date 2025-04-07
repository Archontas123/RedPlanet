import { Entity } from './Entity.js';
import { Vector2 } from '../math/Vector2.js';
import { ItemDrop } from './ItemDrop.js';

export class Tree extends Entity {
    constructor(position) {
        const size = new Vector2(30, 20); // Further adjusted trunk collision size (Width: 30, Height: 20)
        super(position, size, '#654321'); // Fallback color
        this.visualSize = new Vector2(80, 120); // Visual size of the sprite
        this.health = 4; // Requires 4 axe swings
        this.maxHealth = 4;
        this.isFelled = false; // Flag to track if felled
        this.requiredTool = 'axe';
        this.resourceType = 'wood';
        this.dropAmount = 1;
        this.isInteractable = true;
        this.interactionRadius = 70;
        this.isResourceNode = true;
        this.type = 'Tree';
        this.hitboxOffsetY = 15; // Pixels to shift the hitbox up

        // Load the image
        this.image = new Image();
        this.image.src = 'assets/items/Tree_1.png'; // Assuming path is correct relative to index.html
        this.image.onerror = () => {
            console.error(`Failed to load tree image: ${this.image.src}`);
            this.image = null; // Prevent drawing errors if load fails
        };
    }

    interact(player, game) {
        // Check if the tree is already felled
        if (this.health <= 0) {
            console.log("Tree is already felled.");
            return { felled: true, entity: this }; // Already felled, do nothing more
        }

        // Check if player has the required tool equipped
        const equippedWeapon = player.weapons[player.currentWeaponIndex];
        if (equippedWeapon.toLowerCase() === this.requiredTool) {
            this.health--;
            console.log(`Tree hit! Health: ${this.health}/${this.maxHealth}`);

            // Resource drop logic moved to takeDamage -> handleTreeFelled

            if (this.health <= 0) {
                console.log("Tree felled via interact!"); // Should ideally not happen now
                this.isFelled = true; // Set felled flag
                this.isInteractable = false; // Stop further interaction
                // The tree will stop being drawn and collided with based on the flag
                return { felled: true, entity: this };
            }
            return { felled: false };
        } else {
            console.log(`Need an ${this.requiredTool} to chop this tree.`);
            // Maybe add a visual/audio cue for wrong tool?
            return { felled: false, error: `Requires ${this.requiredTool}` };
        }
    }

    // Method called when the tree takes damage, e.g., from chopping
    takeDamage(amount, source, toolType = 'other') {
        if (this.isFelled) return false; // Can't damage a felled tree

        // Only take damage from the correct tool
        if (toolType.toLowerCase() === this.requiredTool) {
            this.health -= amount;
            console.log(`Tree took ${amount} damage from ${toolType}. Health: ${this.health}/${this.maxHealth}`);

            if (this.health <= 0) {
                this.health = 0;
                this.isFelled = true;
                this.isInteractable = false; // Stop interaction prompts
                console.log("Tree felled by takeDamage!");
                // Resource dropping is handled by game.handleTreeFelled calling getResourceDrops
                return true; // Indicate that the tree was felled
            }
            return false; // Indicate tree was damaged but not felled
        } else {
            console.log(`Ineffective tool (${toolType}) used on tree.`);
            return false; // No damage taken
        }
    }

    // Method to get the resources dropped when felled
    getResourceDrops() {
        if (!this.isFelled) return []; // Only drop when felled

        return [{ type: this.resourceType, quantity: this.dropAmount }];
    }


    draw(ctx, camera) {
        if (this.isFelled) return; // Don't draw if felled

        // Use world coordinates directly as context is already translated
        const worldX = this.position.x;
        const worldY = this.position.y;

        // Draw image if loaded
         if (this.image && this.image.complete && this.image.naturalWidth > 0) {
              // Adjust draw position based on image dimensions and desired anchor (e.g., bottom center)
              // Round coordinates to prevent subpixel rendering blur
              const drawX = Math.round(worldX - this.visualSize.x / 2);
              const drawY = Math.round(worldY - this.visualSize.y); // Anchor at bottom center
              ctx.drawImage(this.image, drawX, drawY, this.visualSize.x, this.visualSize.y);
         } else {
              // Fallback drawing if image fails to load
             ctx.fillStyle = this.color; // Trunk color
             ctx.fillRect(worldX - this.size.x / 2, worldY - this.size.y / 2, this.size.x, this.size.y);
             ctx.fillStyle = '#228B22'; // Leaf color
             ctx.beginPath();
             ctx.arc(worldX, worldY - this.size.y / 2, this.size.x * 1.5, 0, Math.PI * 2);
             ctx.fill();
        }

        // --- Draw Debug Hitbox ---
        // ctx.strokeStyle = 'rgba(255, 0, 255, 0.7)'; // Magenta for hitbox
        // ctx.lineWidth = 1 / camera.zoom; // Scale line width
        // // Draw the hitbox anchored at the bottom-center (worldX, worldY), adjusted upwards
        // ctx.strokeRect(
        //     worldX - this.size.x / 2, // Center horizontally
        //     worldY - this.size.y - this.hitboxOffsetY, // Adjusted top edge using offset
        //     this.size.x,               // Collision width
        //     this.size.y                // Collision height
        // );
        // --- End Debug Hitbox ---

        // Draw health bar if damaged, scaling UI elements inversely with zoom
        if (this.health < this.maxHealth && this.health > 0) {
            const barWidth = this.size.x; // Keep width relative to collision size
            const barHeight = 5 / camera.zoom; // Scale height
            const barX = worldX - barWidth / 2; // Use world coords
            const barY = worldY - this.size.y / 2 - barHeight - (2 / camera.zoom); // Position above the trunk base, adjust offset
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(barX, barY, barWidth, barHeight);
            ctx.fillStyle = '#ff0000'; // Red for damage
            ctx.fillRect(barX, barY, barWidth * (this.health / this.maxHealth), barHeight);
        }
    }

    // Override default getRectData to account for bottom-center anchor
    getRectData() {
        // Calculate the center position of the collision box, adjusted upwards
        const centerX = this.position.x;
        const centerY = this.position.y - this.size.y / 2 - this.hitboxOffsetY; // Adjusted center Y using offset
        return {
            x: centerX,
            y: centerY,
            width: this.size.x,
             height: this.size.y
         };
     }

     // Get the Y coordinate for depth sorting (bottom of the sprite)
     getSortY() {
         // Position already represents the bottom anchor
         // Subtract epsilon for sort stability against player
         return this.position.y - 0.01;
     }
 }
