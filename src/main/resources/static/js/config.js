export const WORLD_WIDTH = 1600;
export const WORLD_HEIGHT = 900;

export const PLAYER_RADIUS = 20;
export const FOV = 100 * Math.PI / 180;
export const WALL_HEIGHT = 170;
export const NEAR_PLANE = 8;
export const MOUSE_SENSITIVITY = 0.0024;

export const MIN_NAME_LENGTH = 3;
export const MAX_NAME_LENGTH = 16;
export const NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

export const CLIENT_TICK_RATE = 60;
export const CLIENT_DELTA_SECONDS = 1 / CLIENT_TICK_RATE;

export const PREDICTION_ERROR_THRESHOLD = 2.5;

export const REMOTE_INTERPOLATION_DELAY_MS = 100;
export const REMOTE_SNAP_DISTANCE = 220;

export const BULLET_INTERPOLATION_DELAY_MS = 55;
export const BULLET_MAX_EXTRAPOLATION_MS = 80;
export const BULLET_FADE_MS = 120;

export const PLAYER_MAX_SPEED = 410;
export const PLAYER_ACCELERATION = 2200;
export const PLAYER_SPRINT_SPEED_MULTIPLIER = 1.45;
export const PLAYER_SPRINT_ACCELERATION_MULTIPLIER = 1.2;
export const PLAYER_AIR_ACCELERATION_MULTIPLIER = 0.45;
export const PLAYER_JUMP_VELOCITY = 520;
export const PLAYER_GRAVITY = 1350;
export const PLAYER_BUNNYHOP_SPEED_BOOST = 1.09;
export const PLAYER_FRICTION = 9.5;
export const PLAYER_STOP_SPEED = 90;
