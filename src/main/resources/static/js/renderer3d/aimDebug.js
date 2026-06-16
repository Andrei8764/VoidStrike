const RAY_LENGTH = 2000;
const BULLET_EYE_FORWARD_OFFSET = 4;
const CAMERA_EYE_HEIGHT = 54;
const CAMERA_CROUCH_EYE_HEIGHT = 40;

const BODY_HIT_RADIUS = 20;
const HEAD_HIT_RADIUS = 10;
const PLAYER_BODY_MAX_Z = 64;
const PLAYER_HEAD_MIN_Z = 42;
const PLAYER_HEAD_MAX_Z = 64;
const PLAYER_CROUCH_BODY_MAX_Z = 48;
const PLAYER_CROUCH_HEAD_MIN_Z = 30;
const PLAYER_CROUCH_HEAD_MAX_Z = 48;

export function createAimDebugController({
    THREE,
    camera3d,
    getSelfPlayer,
    getRenderableRemotePlayers,
    mouse
}) {
    const group = new THREE.Group();
    group.visible = false;

    let cameraRay = null;
    let serverRay = null;
    const playerHitboxGroups = new Map();
    let wasShooting = false;

    function createRay(color) {
        const geometry = new THREE.BufferGeometry();
        const material = new THREE.LineBasicMaterial({ color });
        return new THREE.Line(geometry, material);
    }

    function setRay(line, origin, direction, length) {
        const end = origin.clone().add(direction.clone().multiplyScalar(length));
        line.geometry.setFromPoints([origin, end]);
    }

    function buildLookDirection(angle, pitch) {
        const cosYaw = Math.cos(angle);
        const sinYaw = Math.sin(angle);
        const horizontalPitchFactor = Math.cos(pitch);
        return new THREE.Vector3(
            cosYaw * horizontalPitchFactor,
            Math.sin(pitch),
            sinYaw * horizontalPitchFactor
        ).normalize();
    }

    function updateRays(self) {
        if (!cameraRay) {
            cameraRay = createRay(0xffff00);
            serverRay = createRay(0xff0000);
            group.add(cameraRay);
            group.add(serverRay);
        }

        const lookDir = buildLookDirection(self.angle, self.pitch || 0);
        const eyeHeight = self.crouching ? CAMERA_CROUCH_EYE_HEIGHT : CAMERA_EYE_HEIGHT;
        const baseZ = self.z || 0;

        const cameraOrigin = new THREE.Vector3(self.x, baseZ + eyeHeight, self.y);
        const serverOrigin = new THREE.Vector3(
            self.x + lookDir.x * BULLET_EYE_FORWARD_OFFSET,
            baseZ + eyeHeight + lookDir.y * BULLET_EYE_FORWARD_OFFSET,
            self.y + lookDir.z * BULLET_EYE_FORWARD_OFFSET
        );

        setRay(cameraRay, cameraOrigin, lookDir, RAY_LENGTH);
        setRay(serverRay, serverOrigin, lookDir, RAY_LENGTH);
    }

    function createWireframeCylinder(radius, height, color) {
        const geometry = new THREE.CylinderGeometry(radius, radius, height, 14, 1, true);
        const edges = new THREE.EdgesGeometry(geometry);
        const material = new THREE.LineBasicMaterial({ color });
        const mesh = new THREE.LineSegments(edges, material);
        geometry.dispose();
        return mesh;
    }

    function getPlayerHitboxDimensions(crouching) {
        if (crouching) {
            return {
                bodyHeight: PLAYER_CROUCH_BODY_MAX_Z,
                headMin: PLAYER_CROUCH_HEAD_MIN_Z,
                headMax: PLAYER_CROUCH_HEAD_MAX_Z
            };
        }
        return {
            bodyHeight: PLAYER_BODY_MAX_Z,
            headMin: PLAYER_HEAD_MIN_Z,
            headMax: PLAYER_HEAD_MAX_Z
        };
    }

    function ensurePlayerHitbox(player) {
        let entry = playerHitboxGroups.get(player.id);
        if (!entry) {
            const bodyMesh = createWireframeCylinder(BODY_HIT_RADIUS, PLAYER_BODY_MAX_Z, 0x00ff88);
            const headMesh = createWireframeCylinder(HEAD_HIT_RADIUS, PLAYER_HEAD_MAX_Z - PLAYER_HEAD_MIN_Z, 0xff8800);
            const playerGroup = new THREE.Group();
            playerGroup.add(bodyMesh);
            playerGroup.add(headMesh);
            group.add(playerGroup);
            entry = { group: playerGroup, bodyMesh, headMesh };
            playerHitboxGroups.set(player.id, entry);
        }
        return entry;
    }

    function updateHitboxes(players) {
        const activeIds = new Set();

        for (const player of players) {
            activeIds.add(player.id);
            const { bodyHeight, headMin, headMax } = getPlayerHitboxDimensions(player.crouching);
            const headHeight = headMax - headMin;
            const baseZ = player.z || 0;
            const entry = ensurePlayerHitbox(player);

            entry.bodyMesh.scale.y = bodyHeight / PLAYER_BODY_MAX_Z;
            entry.bodyMesh.position.set(0, bodyHeight * 0.5, 0);

            entry.headMesh.scale.y = headHeight / (PLAYER_HEAD_MAX_Z - PLAYER_HEAD_MIN_Z);
            entry.headMesh.position.set(0, headMin + headHeight * 0.5, 0);

            entry.group.position.set(player.x, baseZ, player.y);
        }

        for (const [playerId, entry] of playerHitboxGroups.entries()) {
            if (activeIds.has(playerId)) {
                continue;
            }
            group.remove(entry.group);
            entry.bodyMesh.geometry.dispose();
            entry.headMesh.geometry.dispose();
            entry.bodyMesh.material.dispose();
            entry.headMesh.material.dispose();
            playerHitboxGroups.delete(playerId);
        }
    }

    function logShot(self) {
        const lookDir = buildLookDirection(self.angle, self.pitch || 0);
        const eyeHeight = self.crouching ? CAMERA_CROUCH_EYE_HEIGHT : CAMERA_EYE_HEIGHT;
        const baseZ = self.z || 0;
        const spawn = {
            x: self.x + lookDir.x * BULLET_EYE_FORWARD_OFFSET,
            y: self.y + lookDir.z * BULLET_EYE_FORWARD_OFFSET,
            z: baseZ + eyeHeight + lookDir.y * BULLET_EYE_FORWARD_OFFSET
        };

        let closestEnemy = null;
        let closestDistance = Infinity;
        for (const player of getRenderableRemotePlayers()) {
            const distance = Math.hypot(player.x - self.x, player.y - self.y);
            if (distance < closestDistance) {
                closestDistance = distance;
                closestEnemy = player;
            }
        }

        console.log("[AIM_DEBUG] shot", {
            angle: self.angle,
            pitch: self.pitch || 0,
            spawn,
            lookDir: { x: lookDir.x, y: lookDir.y, z: lookDir.z },
            cameraPos: {
                x: camera3d.position.x,
                y: camera3d.position.y,
                z: camera3d.position.z
            },
            closestEnemy: closestEnemy
                ? { name: closestEnemy.name, distance: closestDistance }
                : null
        });
    }

    function update() {
        if (!group.visible) {
            wasShooting = mouse.down;
            return;
        }

        const self = getSelfPlayer();
        if (!self) {
            return;
        }

        updateRays(self);
        updateHitboxes(getRenderableRemotePlayers());

        if (mouse.down && !wasShooting) {
            logShot(self);
        }
        wasShooting = mouse.down;
    }

    function setVisible(visible) {
        group.visible = visible;
        if (!visible) {
            wasShooting = false;
        }
    }

    return {
        group,
        update,
        setVisible
    };
}
