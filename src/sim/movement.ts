import type { WorldState } from "./types";

export function moveWorldOneTick(world: WorldState): void {
  const maximumX = world.bounds.width - 1;
  const maximumY = world.bounds.height - 1;

  for (let index = 0; index < world.entityCount; index += 1) {
    let velocityX = world.velocitiesX[index]!;
    let nextX = world.positionsX[index]! + velocityX;

    if (nextX < 0) {
      nextX = -nextX;
      velocityX = -velocityX;
    } else if (nextX > maximumX) {
      nextX = maximumX - (nextX - maximumX);
      velocityX = -velocityX;
    }

    let velocityY = world.velocitiesY[index]!;
    let nextY = world.positionsY[index]! + velocityY;

    if (nextY < 0) {
      nextY = -nextY;
      velocityY = -velocityY;
    } else if (nextY > maximumY) {
      nextY = maximumY - (nextY - maximumY);
      velocityY = -velocityY;
    }

    world.positionsX[index] = nextX;
    world.positionsY[index] = nextY;
    world.velocitiesX[index] = velocityX;
    world.velocitiesY[index] = velocityY;
  }
}
