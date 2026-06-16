export const state = {
    ads: false,
    socket: null,
    playerId: null,
    playerName: null,
    selectedCharacterModel: "a_character_body.glb",
    joined: false,

    players: [],
    bullets: [],
    obstacles: [],
    killFeed: [],
    damageFeed: [],
    chatMessages: [],
    round: null,

    selectedWeaponSlot: 2,
    buyWeaponSlot: null,
    reloadRequested: false,
    climbRequested: false,
    scoreboardVisible: false,
    shopVisible: false,
    consoleVisible: false,
    wallhackEnabled: false,
    performanceMode: true,
    settingsVisible: false,
    showFps: false,
    perfHudVisible: false,
    collisionDebugVisible: false,
    aimDebugVisible: false,
    healthDebugVisible: false,
    damageDebugVisible: false,
    renderScale: 1,
    toneMappingEnabled: true,
    textureFilter: "smooth",
    anisotropyLevel: "max",
    editorMode: false,

    lastSelfAmmo: null,
    lastUnlockedWeapons: [],
    purchaseNotificationTimeoutId: null,
    recoilKick: 0,
    lastReloading: false,
    lastKillFeedEventIds: new Set(),
    lastDamageEventIds: new Set(),
    lastLocalKillAt: 0,
    lastRoundNumber: null,
    lastRoundStatus: null,
    roundEndSoundPlayedForRound: null,
    remotePlayerAmmo: new Map(),
    viewAngle: 0,
    viewPitch: 0,
    bobTime: 0,

    inputSequence: 0,
    pendingInputs: [],
    predictedSelf: null,
    predictionRemainder: 0,

    remotePlayerStates: new Map(),
    remoteWeaponAimStates: new Map(),

    interpolatedRemotePlayers: new Map(),

    bulletStates: new Map(),
    interpolatedBullets: new Map(),
    fadingBulletTrails: [],

    inputIntervalId: null,

    lastServerTime: null,
    lastSnapshotReceivedAt: 0,
    clockOffsetMs: 0,
    networkLatencyMs: 0,
    serverTickIntervalMs: 1000 / 30,

    movementDebug: false
};

export const keys = {
    up: false,
    down: false,
    left: false,
    right: false,
    sprint: false,
    crouch: false,
    descend: false
};

export const mouse = {
    x: 0,
    y: 0,
    worldX: 0,
    worldY: 0,
    down: false,
    angle: 0,
    pitch: 0
};

export const camera = {
    x: 0,
    y: 0
};

export function getSelfPlayer() {
    if (state.predictedSelf) {
        const remainder = state.predictionRemainder || 0;

        if (remainder > 1e-4) {
            return {
                ...state.predictedSelf,
                x: state.predictedSelf.x + (state.predictedSelf.velocityX || 0) * remainder,
                y: state.predictedSelf.y + (state.predictedSelf.velocityY || 0) * remainder,
                z: (state.predictedSelf.z || 0) + (state.predictedSelf.velocityZ || 0) * remainder
            };
        }

        return state.predictedSelf;
    }

    return state.players.find(player => player.id === state.playerId);
}

export function getRenderableRemotePlayers() {
    return state.players
        .filter(player => player.id !== state.playerId)
        .map(player => state.interpolatedRemotePlayers.get(player.id) || player);
}

export function getRenderablePlayers() {
    const self = getSelfPlayer();

    return [
        ...(self ? [self] : []),
        ...getRenderableRemotePlayers()
    ];
}

export function getRenderableBullets() {
    if (state.interpolatedBullets.size === 0) {
        return state.bullets;
    }

    return [...state.interpolatedBullets.values()];
}
