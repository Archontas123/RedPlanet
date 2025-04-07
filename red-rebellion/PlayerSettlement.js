import { Vector2 } from './math/Vector2.js';
import { StorageDepot } from './structures/StorageDepot.js';

export class PlayerSettlement {
    constructor(position) {
        this.position = position;
        this.resources = {
            wood: 0,
            rock: 0,
            food: 0,
            hide: 0,
            plasma: 0
        };
        this.structures = [];
        this.maxStackSize = 99; // Define max stack size for settlement storage

        this.createInitialStructures();
    }

    createInitialStructures() {
        const depotSize = new Vector2(50, 50);
        const depotPosition = this.position.clone();
        const depot = new StorageDepot(depotPosition, depotSize);
        this.addStructure(depot);
    }

    addResource(type, amount) {
        if (type in this.resources) {
            const currentAmount = this.resources[type];
            const canAdd = this.maxStackSize - currentAmount;
            const amountToAdd = Math.min(amount, canAdd);

            if (amountToAdd > 0) {
                this.resources[type] += amountToAdd;
                console.log(`Settlement added ${amountToAdd} ${type}. New total: ${this.resources[type]}`);
            }
            if (amountToAdd < amount) {
                console.log(`Settlement ${type} storage full. Could not add ${amount - amountToAdd} ${type}.`);
                // Optionally return the overflow amount: return amount - amountToAdd;
            }
            return amountToAdd; // Return the amount actually added
        } else {
            console.warn(`Attempted to add unknown resource type: ${type}`);
            return 0; // Nothing added
        }
    }

    removeResource(type, amount) {
        if (type in this.resources) {
            if (this.resources[type] >= amount) {
                this.resources[type] -= amount;
                console.log(`Settlement ${type}: ${this.resources[type]}`);
                return true;
            }
        }
        return false;
    }

    canAfford(cost) {
        for (const type in cost) {
            if (!(type in this.resources) || this.resources[type] < cost[type]) {
                return false;
            }
        }
        return true;
    }

    addStructure(structure) {
        this.structures.push(structure);
    }

    removeStructure(structure) {
        const index = this.structures.indexOf(structure);
        if (index > -1) {
            this.structures.splice(index, 1);
        }
    }

    getStorageDepot() {
        return this.structures.find(s => s instanceof StorageDepot);
    }

    update(deltaTime) {
        this.structures.forEach(structure => {
            if (structure.update) {
                structure.update(deltaTime);
            }
        });
    }

    draw(ctx, camera) {
        this.structures.forEach(structure => {
            structure.draw(ctx, camera);
        });
    }
}
