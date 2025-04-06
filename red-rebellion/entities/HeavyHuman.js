import { Human } from './Human.js';
import { Vector2 } from '../utils.js';

export class HeavyHuman extends Human {
    constructor(patrolPath, settlement, building) {
        super(patrolPath, settlement, building);
        this.size = new Vector2(40, 40);
        this.color = '#cc0000';
        this.health = 300;
        this.maxHealth = 300;
        this.speed = 90;
        this.attackDamage = 12;
        this.gunCooldown = 2.0 + Math.random() * 0.5;
    }
}
