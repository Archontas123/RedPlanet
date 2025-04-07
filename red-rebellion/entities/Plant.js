import { Entity } from './Entity.js';
import { Vector2 } from '../math/Vector2.js';

export class Plant extends Entity {
    constructor(position) {
        // Plants don't need collision size initially, pass a small default or null
        super(position, new Vector2(10, 10), null); // No specific color needed
        this.visualSize = new Vector2(40, 40); // Adjust based on sprite size
        this.type = 'Plant';
        this.isDecoration = true;

        // Load the image
        this.image = new Image();
        this.image.src = 'assets/items/plant_1.png'; // Assuming path is correct
        this.image.onerror = () => {
            console.error(`Failed to load plant image: ${this.image.src}`);
            this.image = null;
        };
    }

    draw(ctx, camera) {
        // Use world coordinates directly
        const worldX = this.position.x;
        const worldY = this.position.y;

        if (this.image && this.image.complete && this.image.naturalWidth > 0) {
            // Anchor drawing at bottom-center like the tree
            // Round coordinates to prevent subpixel rendering blur
            const drawX = Math.round(worldX - this.visualSize.x / 2); // Use worldX
            const drawY = Math.round(worldY - this.visualSize.y); // Use worldY
            ctx.drawImage(this.image, drawX, drawY, this.visualSize.x, this.visualSize.y);
        }
         // No fallback drawing needed for purely decorative items if image fails
     }

     // Get the Y coordinate for depth sorting (bottom of the sprite)
     getSortY() {
         // Position already represents the bottom anchor
         // Subtract epsilon for sort stability against player
         return this.position.y - 0.01;
     }

     // Plants don't need update, interact, takeDamage, or getRectData for now
 }
