export function createRemotePlayersRuntime(deps) {
    const {
        THREE,
        performanceNow,
        getRenderableRemotePlayers,
        remotePlayerGroup,
        nameLabelsElement,
        camera3d,
        canvas,
        TEAM_COLORS,
        CHARACTER_HEIGHT,
        CHARACTER_YAW_OFFSET,
        PLAYER_MAX_SPEED,
        REMOTE_RUN_SPEED_THRESHOLD,
        MOVE_FACTOR_SMOOTHING,
        MOVE_START_THRESHOLD,
        MOVE_STOP_THRESHOLD,
        GAIT_WEIGHT_SMOOTHING,
        WALK_RUN_THRESHOLD,
        IDLE_PHASE_SPEED,
        WALK_CYCLE_HZ,
        RUN_CYCLE_HZ,
        STABLE_BLOCK_WALK,
        BODY_YAW_SMOOTHING,
        DEBUG_REMOTE_MARKERS,
        loadModularCharacterTemplate,
        tintCharacter,
        getCharacterModelPathForPlayer,
        loadWeaponTemplate,
        normalizeWeaponModel,
        createWeaponPlaceholder,
        getWeaponModelPathByName,
        getWeaponScaleByName,
        getRemoteWeaponAnchorOffsetByName,
        getRemoteWeaponMuzzleLiftByName,
        lerpAngle,
        clamp,
        WEAPON_MODEL_LOCAL_X,
        WEAPON_MODEL_LOCAL_Y,
        WEAPON_MODEL_LOCAL_Z,
        WEAPON_MODEL_ROT_X,
        WEAPON_MODEL_ROT_Y,
        WEAPON_MODEL_ROT_Z,
        WEAPON_AIM_SMOOTHING,
        WEAPON_IDLE_PITCH,
        WEAPON_RAISED_PITCH,
        REMOTE_WEAPON_IDLE_TO_BACK_DELAY_MS,
        REMOTE_WEAPON_COMBAT_BLEND_IN,
        REMOTE_WEAPON_COMBAT_BLEND_OUT,
        REMOTE_WEAPON_LOWERED_PITCH,
        REMOTE_BACK_POS_X,
        REMOTE_BACK_POS_Y,
        REMOTE_BACK_POS_Z,
        REMOTE_BACK_ROT_X,
        REMOTE_BACK_ROT_Y,
        REMOTE_BACK_ROT_Z,
        WEAPON_RECOIL_PITCH,
        WEAPON_SHOT_RAISE_DECAY,
        WEAPON_RECOIL_DECAY,
        WALK_SWING_SPEED,
        IDLE_SWAY,
        WALK_ARM_SWING,
        WALK_LEG_SWING,
        ARM_ROTATION_SMOOTHING,
        ARM_ROTATION_MAX_DELTA,
        LEG_ROTATION_SMOOTHING,
        LEG_ROTATION_MAX_DELTA
    } = deps;

    const remotePlayerRoots = new Map();
    const remotePlayerModelPaths = new Map();
    const remotePlayerAnimPhase = new Map();
    const remotePlayerLabels = new Map();
    const remotePlayerMoveFactor = new Map();
    const remotePlayerGaitWeight = new Map();
    const remotePlayerBodyYaw = new Map();
    const remotePlayerLocomotionState = new Map();
    const remotePlayerMoving = new Map();
    const remotePlayerWeaponModelPaths = new Map();
    const remotePlayerWeaponAnchors = new Map();
    const remotePlayerWeaponAim = new Map();
    const remotePlayerLastAmmo = new Map();
    const remotePlayerShotRaise = new Map();
    const remotePlayerWeaponRecoil = new Map();
    const remotePlayerRightArm = new Map();
    const remotePlayerArmRotX = new Map();
    const remotePlayerLegRotX = new Map();
    const remotePlayerWeaponRot = new Map();
    const remotePlayerWeaponCombatBlend = new Map();
    const remotePlayerWeaponInBackMount = new Map();
    const remotePlayerLastShotAt = new Map();

    let lastAnimationTimeMs = performanceNow();

    function createRemoteFallbackCapsule(player) {
        const color = TEAM_COLORS[player.team] || 0xffffff;
        return new THREE.Mesh(
            new THREE.CapsuleGeometry(10, 30, 4, 8),
            new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1 })
        );
    }

    function createRemoteRoot(player) {
        const root = new THREE.Group();
        const placeholder = createRemoteFallbackCapsule(player);
        placeholder.name = "placeholder";
        root.add(placeholder);

        loadModularCharacterTemplate()
            .then(template => {
                const model = template.clone(true);
                tintCharacter(model, TEAM_COLORS[player.team] || 0xffffff);
                const debugHead = root.getObjectByName("remoteDebugHead") || null;
                root.clear();
                root.add(model);
                remotePlayerRightArm.delete(player.id);
                if (debugHead) {
                    root.add(debugHead);
                }
            })
            .catch(() => {
            });
        return root;
    }

    function ensureNameLabel(player) {
        if (!nameLabelsElement) {
            return null;
        }
        if (remotePlayerLabels.has(player.id)) {
            return remotePlayerLabels.get(player.id);
        }
        const label = document.createElement("div");
        label.className = "nameLabel";
        label.textContent = player.name;
        label.style.display = "none";
        nameLabelsElement.appendChild(label);
        remotePlayerLabels.set(player.id, label);
        return label;
    }

    function updateNameLabel(player, root) {
        const label = ensureNameLabel(player);
        if (!label) {
            return;
        }
        const worldPoint = new THREE.Vector3(root.position.x, root.position.y + CHARACTER_HEIGHT + 14, root.position.z);
        const projected = worldPoint.project(camera3d);
        const visible = projected.z > -1 && projected.z < 1;
        if (!visible) {
            label.style.display = "none";
            return;
        }
        const screenX = (projected.x * 0.5 + 0.5) * canvas.clientWidth;
        const screenY = (-projected.y * 0.5 + 0.5) * canvas.clientHeight;
        label.style.display = "block";
        label.textContent = player.name;
        label.style.left = `${screenX}px`;
        label.style.top = `${screenY}px`;
    }

    function ensureWeaponAnchor(root, player) {
        if (remotePlayerWeaponAnchors.has(player.id)) {
            return remotePlayerWeaponAnchors.get(player.id);
        }
        const weaponAnchor = new THREE.Group();
        weaponAnchor.position.set(12.2, CHARACTER_HEIGHT * 0.69, 5.8);
        const baseWeapon = createWeaponPlaceholder();
        baseWeapon.name = "baseWeapon";
        baseWeapon.position.set(WEAPON_MODEL_LOCAL_X, WEAPON_MODEL_LOCAL_Y, WEAPON_MODEL_LOCAL_Z);
        baseWeapon.rotation.set(WEAPON_MODEL_ROT_X, WEAPON_MODEL_ROT_Y, WEAPON_MODEL_ROT_Z);
        weaponAnchor.add(baseWeapon);
        root.add(weaponAnchor);
        remotePlayerWeaponAnchors.set(player.id, weaponAnchor);
        return weaponAnchor;
    }

    function ensureLimbRig(root, player) {
        const cached = remotePlayerRightArm.get(player.id);
        if (cached) {
            return cached;
        }
        const model = root.children.find(child => child.type === "Group" || child.type === "Scene");
        if (!model || model.children.length < 6) {
            return null;
        }
        const rig = {
            armLeft: model.children[3] || null,
            armRight: model.children[2] || null,
            legLeft: model.children[4] || null,
            legRight: model.children[5] || null
        };
        remotePlayerRightArm.set(player.id, rig);
        return rig;
    }

    function syncPlayerWeapon(player, root) {
        const weaponPath = getWeaponModelPathByName(player.weapon);
        const weaponScale = getWeaponScaleByName(player.weapon);
        const previousPath = remotePlayerWeaponModelPaths.get(player.id);
        const weaponAnchor = ensureWeaponAnchor(root, player);
        if (previousPath === weaponPath && weaponAnchor.children.length > 0) {
            return;
        }
        remotePlayerWeaponModelPaths.set(player.id, weaponPath);
        loadWeaponTemplate(weaponPath)
            .then(template => {
                const weaponModel = template.clone(true);
                weaponModel.rotation.set(WEAPON_MODEL_ROT_X, WEAPON_MODEL_ROT_Y, WEAPON_MODEL_ROT_Z);
                normalizeWeaponModel(weaponModel, weaponScale);
                weaponModel.position.set(WEAPON_MODEL_LOCAL_X, WEAPON_MODEL_LOCAL_Y, WEAPON_MODEL_LOCAL_Z);
                weaponModel.traverse(node => {
                    if (!node.isMesh) {
                        return;
                    }
                    if (Array.isArray(node.material)) {
                        node.material = node.material.map(material => material?.clone?.() ?? material);
                    } else if (node.material?.clone) {
                        node.material = node.material.clone();
                    }
                    node.frustumCulled = false;
                    node.renderOrder = 32;
                    if (Array.isArray(node.material)) {
                        for (const material of node.material) {
                            if (!material) {
                                continue;
                            }
                            material.depthTest = true;
                            material.depthWrite = true;
                            material.transparent = false;
                            material.needsUpdate = true;
                        }
                    } else if (node.material) {
                        node.material.depthTest = true;
                        node.material.depthWrite = true;
                        node.material.transparent = false;
                        node.material.needsUpdate = true;
                    }
                    if (node.geometry) {
                        node.geometry.computeBoundingSphere();
                        node.geometry.computeBoundingBox();
                    }
                });
                weaponAnchor.clear();
                const baseWeapon = createWeaponPlaceholder();
                baseWeapon.name = "baseWeapon";
                baseWeapon.position.set(WEAPON_MODEL_LOCAL_X, WEAPON_MODEL_LOCAL_Y, WEAPON_MODEL_LOCAL_Z);
                baseWeapon.rotation.set(WEAPON_MODEL_ROT_X, WEAPON_MODEL_ROT_Y, WEAPON_MODEL_ROT_Z);
                baseWeapon.material.opacity = 0.0;
                baseWeapon.material.transparent = true;
                weaponAnchor.add(baseWeapon);
                weaponAnchor.add(weaponModel);
            })
            .catch(() => {
                if (weaponAnchor.children.length === 0) {
                    const fallback = createWeaponPlaceholder();
                    fallback.name = "baseWeapon";
                    fallback.position.set(WEAPON_MODEL_LOCAL_X, WEAPON_MODEL_LOCAL_Y, WEAPON_MODEL_LOCAL_Z);
                    fallback.rotation.set(WEAPON_MODEL_ROT_X, WEAPON_MODEL_ROT_Y, WEAPON_MODEL_ROT_Z);
                    weaponAnchor.add(fallback);
                }
            });
    }

    function updateWeaponAim(player, root, runLean, pitchLean, gaitWeight, phase) {
        const rig = ensureLimbRig(root, player);
        const weaponAnchor = ensureWeaponAnchor(root, player);
        const current = remotePlayerWeaponAim.get(player.id) || { yaw: 0, pitch: 0 };
        const previousAmmo = remotePlayerLastAmmo.get(player.id);
        const currentAmmo = player.ammo ?? 0;
        const shotDetected = previousAmmo !== undefined && currentAmmo < previousAmmo;
        remotePlayerLastAmmo.set(player.id, currentAmmo);
        let raise = remotePlayerShotRaise.get(player.id) || 0;
        let recoil = remotePlayerWeaponRecoil.get(player.id) || 0;
        if (shotDetected) {
            raise = Math.min(1, raise + 0.9);
            recoil = Math.min(1, recoil + 0.95);
            remotePlayerLastShotAt.set(player.id, performanceNow());
        }
        const nowMs = performanceNow();
        const lastShotAt = remotePlayerLastShotAt.get(player.id) ?? -1e12;
        const adsActive = Boolean(player.ads);
        const shootingActive = Boolean(player.shooting);
        const shootingRecently = adsActive || (nowMs - lastShotAt <= REMOTE_WEAPON_IDLE_TO_BACK_DELAY_MS);
        const prevCombatBlend = remotePlayerWeaponCombatBlend.get(player.id) ?? 0;
        const targetCombatBlend = shootingRecently ? 1 : 0;
        const blendRate = targetCombatBlend > prevCombatBlend ? REMOTE_WEAPON_COMBAT_BLEND_IN : REMOTE_WEAPON_COMBAT_BLEND_OUT;
        let combatBlend = prevCombatBlend + (targetCombatBlend - prevCombatBlend) * blendRate;
        if (adsActive || shotDetected) {
            combatBlend = 1;
        }
        remotePlayerWeaponCombatBlend.set(player.id, combatBlend);
        const shouldBackMount = combatBlend < 0.45 || !rig?.armRight;
        const bodyMountParent = rig?.armRight?.parent || root;
        const inBackMount = remotePlayerWeaponInBackMount.get(player.id) ?? false;
        if (shouldBackMount !== inBackMount) {
            if (shouldBackMount) {
                bodyMountParent.add(weaponAnchor);
                weaponAnchor.position.set(REMOTE_BACK_POS_X, REMOTE_BACK_POS_Y, REMOTE_BACK_POS_Z);
                weaponAnchor.rotation.set(REMOTE_BACK_ROT_X, REMOTE_BACK_ROT_Y, REMOTE_BACK_ROT_Z);
            } else if (rig?.armRight) {
                rig.armRight.add(weaponAnchor);
                const remoteAnchorOffset = getRemoteWeaponAnchorOffsetByName(player.weapon);
                weaponAnchor.position.set(remoteAnchorOffset.x, remoteAnchorOffset.y, remoteAnchorOffset.z);
                weaponAnchor.rotation.set(0, 0, 0);
            }
            remotePlayerWeaponInBackMount.set(player.id, shouldBackMount);
        } else if (shouldBackMount && weaponAnchor.parent !== bodyMountParent) {
            bodyMountParent.add(weaponAnchor);
            weaponAnchor.position.set(REMOTE_BACK_POS_X, REMOTE_BACK_POS_Y, REMOTE_BACK_POS_Z);
            weaponAnchor.rotation.set(REMOTE_BACK_ROT_X, REMOTE_BACK_ROT_Y, REMOTE_BACK_ROT_Z);
        } else if (!shouldBackMount && rig?.armRight && weaponAnchor.parent !== rig.armRight) {
            rig.armRight.add(weaponAnchor);
            const remoteAnchorOffset = getRemoteWeaponAnchorOffsetByName(player.weapon);
            weaponAnchor.position.set(remoteAnchorOffset.x, remoteAnchorOffset.y, remoteAnchorOffset.z);
            weaponAnchor.rotation.set(0, 0, 0);
        }

        const runSwayRot = STABLE_BLOCK_WALK ? 0 : (gaitWeight > 0.02 ? Math.sin(phase * 3.6) * deps.WEAPON_RUN_SWAY_ROT * gaitWeight : 0);
        const targetYaw = 0;
        const pitchFromShot = WEAPON_IDLE_PITCH * (1 - raise) + WEAPON_RAISED_PITCH * raise;
        const shotWeight = Math.min(1, Math.max(0, raise * 1.35 + recoil * 0.45));
        let combatWeight = Math.min(1, Math.max(0, combatBlend * (0.25 + shotWeight * 0.75)));
        const adsWeight = player.ads ? 1 : 0;
        const aimingNow = adsActive || shootingActive || shotDetected;
        if (aimingNow) {
            combatWeight = 1;
        }
        const weaponMuzzleLift = getRemoteWeaponMuzzleLiftByName(player.weapon);
        const aimStabilized = aimingNow ? 1 : 0;
        const swayFactor = 1 - aimStabilized;
        const liftFactor = 1 - aimStabilized;
        const combatPitch = pitchFromShot
            - (player.pitch || 0) * 0.95
            + (STABLE_BLOCK_WALK ? 0 : runLean * 0.2 * swayFactor)
            + (STABLE_BLOCK_WALK ? 0 : pitchLean * 0.12 * swayFactor)
            + recoil * WEAPON_RECOIL_PITCH
            + runSwayRot * swayFactor
            - weaponMuzzleLift * (0.6 + 0.4 * adsWeight) * liftFactor;
        const targetPitch = REMOTE_WEAPON_LOWERED_PITCH * (1 - combatWeight) + combatPitch * combatWeight;
        const nextYaw = lerpAngle(current.yaw, targetYaw, WEAPON_AIM_SMOOTHING);
        const nextPitch = lerpAngle(current.pitch, targetPitch, WEAPON_AIM_SMOOTHING);
        const currentWeaponRot = remotePlayerWeaponRot.get(player.id) || { yaw: 0, pitch: 0 };
        const smoothWeaponYaw = lerpAngle(currentWeaponRot.yaw, nextYaw, 0.24);
        const smoothWeaponPitch = lerpAngle(currentWeaponRot.pitch, nextPitch, 0.24);
        remotePlayerWeaponAim.set(player.id, { yaw: nextYaw, pitch: nextPitch });
        remotePlayerWeaponRot.set(player.id, { yaw: smoothWeaponYaw, pitch: smoothWeaponPitch });
        if (shouldBackMount) {
            weaponAnchor.rotation.x += (REMOTE_BACK_ROT_X - weaponAnchor.rotation.x) * 0.16;
            weaponAnchor.rotation.y += (REMOTE_BACK_ROT_Y - weaponAnchor.rotation.y) * 0.16;
            weaponAnchor.rotation.z += (REMOTE_BACK_ROT_Z - weaponAnchor.rotation.z) * 0.16;
        } else {
            weaponAnchor.rotation.z = 0;
            weaponAnchor.rotation.y = smoothWeaponYaw;
            weaponAnchor.rotation.x = smoothWeaponPitch;
        }
        const remoteAnchorOffset = getRemoteWeaponAnchorOffsetByName(player.weapon);
        const basePosX = rig?.armRight ? remoteAnchorOffset.x : 12.2;
        const basePosY = rig?.armRight ? remoteAnchorOffset.y : CHARACTER_HEIGHT * 0.69;
        const basePosZ = rig?.armRight ? remoteAnchorOffset.z : 5.8;
        if (shouldBackMount) {
            weaponAnchor.position.x += (REMOTE_BACK_POS_X - weaponAnchor.position.x) * 0.16;
            weaponAnchor.position.y += (REMOTE_BACK_POS_Y - weaponAnchor.position.y) * 0.16;
            weaponAnchor.position.z += (REMOTE_BACK_POS_Z - weaponAnchor.position.z) * 0.16;
        } else {
            weaponAnchor.position.x = basePosX;
            weaponAnchor.position.y = basePosY;
            weaponAnchor.position.z = basePosZ;
        }
        const nextRaise = raise * WEAPON_SHOT_RAISE_DECAY;
        const nextRecoil = recoil * WEAPON_RECOIL_DECAY;
        remotePlayerShotRaise.set(player.id, nextRaise < 0.01 ? 0 : nextRaise);
        remotePlayerWeaponRecoil.set(player.id, nextRecoil < 0.01 ? 0 : nextRecoil);

        if (!rig) {
            return;
        }
        const walkIntensity = gaitWeight > 0.02 ? (0.25 + Math.min(gaitWeight, 1) * 0.55) : 0;
        const walk = gaitWeight > 0.02 ? Math.sin(phase * WALK_SWING_SPEED) * walkIntensity : Math.sin(phase * 2.2) * IDLE_SWAY * 0.4;
        const easedWalk = Math.sin((Math.PI / 2) * walk);
        const armSwing = easedWalk * deps.WALK_ARM_SWING;
        const legSwing = easedWalk * deps.WALK_LEG_SWING;
        const prevArm = remotePlayerArmRotX.get(player.id) || { left: 0, right: 0 };
        const targetLeftArm = -armSwing * 0.8;
        const targetRightArm = armSwing * 0.55;
        const nextLeftArm = prevArm.left + (targetLeftArm - prevArm.left) * ARM_ROTATION_SMOOTHING;
        const nextRightArm = prevArm.right + (targetRightArm - prevArm.right) * ARM_ROTATION_SMOOTHING;
        const smoothLeftArm = prevArm.left + clamp(nextLeftArm - prevArm.left, -ARM_ROTATION_MAX_DELTA, ARM_ROTATION_MAX_DELTA);
        const smoothRightArm = prevArm.right + clamp(nextRightArm - prevArm.right, -ARM_ROTATION_MAX_DELTA, ARM_ROTATION_MAX_DELTA);
        remotePlayerArmRotX.set(player.id, { left: smoothLeftArm, right: smoothRightArm });
        const prevLeg = remotePlayerLegRotX.get(player.id) || { left: 0, right: 0 };
        const targetLeftLeg = legSwing;
        const targetRightLeg = -legSwing;
        const nextLeftLeg = prevLeg.left + (targetLeftLeg - prevLeg.left) * LEG_ROTATION_SMOOTHING;
        const nextRightLeg = prevLeg.right + (targetRightLeg - prevLeg.right) * LEG_ROTATION_SMOOTHING;
        const smoothLeftLeg = prevLeg.left + clamp(nextLeftLeg - prevLeg.left, -LEG_ROTATION_MAX_DELTA, LEG_ROTATION_MAX_DELTA);
        const smoothRightLeg = prevLeg.right + clamp(nextRightLeg - prevLeg.right, -LEG_ROTATION_MAX_DELTA, LEG_ROTATION_MAX_DELTA);
        remotePlayerLegRotX.set(player.id, { left: smoothLeftLeg, right: smoothRightLeg });
        if (rig.armLeft) rig.armLeft.rotation.x = smoothLeftArm;
        if (rig.armRight) rig.armRight.rotation.x = smoothRightArm;
        if (rig.legLeft) rig.legLeft.rotation.x = smoothLeftLeg;
        if (rig.legRight) rig.legRight.rotation.x = smoothRightLeg;
    }

    function syncRemotePlayers() {
        const nowMs = performanceNow();
        const deltaTime = Math.min(0.05, Math.max(0.001, (nowMs - lastAnimationTimeMs) / 1000));
        lastAnimationTimeMs = nowMs;
        const activePlayerIds = new Set();

        for (const player of getRenderableRemotePlayers()) {
            activePlayerIds.add(player.id);
            let root = remotePlayerRoots.get(player.id);
            if (!root) {
                root = createRemoteRoot(player);
                remotePlayerRoots.set(player.id, root);
                remotePlayerModelPaths.set(player.id, getCharacterModelPathForPlayer(player));
                remotePlayerGroup.add(root);
                if (DEBUG_REMOTE_MARKERS) {
                    const debugHead = new THREE.Mesh(
                        new THREE.SphereGeometry(4, 12, 12),
                        new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.8 })
                    );
                    debugHead.name = "remoteDebugHead";
                    debugHead.position.set(0, CHARACTER_HEIGHT + 10, 0);
                    root.add(debugHead);
                }
            } else {
                const currentPath = getCharacterModelPathForPlayer(player);
                const previousPath = remotePlayerModelPaths.get(player.id);
                if (currentPath !== previousPath) {
                    remotePlayerGroup.remove(root);
                    root = createRemoteRoot(player);
                    remotePlayerRoots.set(player.id, root);
                    remotePlayerModelPaths.set(player.id, currentPath);
                    remotePlayerGroup.add(root);
                }
            }

            const velocityX = player.velocityX || 0;
            const velocityY = player.velocityY || 0;
            const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);
            const targetMoveFactor = Math.min(speed / PLAYER_MAX_SPEED, 1.8);
            const previousMoveFactor = remotePlayerMoveFactor.get(player.id) || 0;
            const moveFactor = previousMoveFactor + (targetMoveFactor - previousMoveFactor) * MOVE_FACTOR_SMOOTHING;
            remotePlayerMoveFactor.set(player.id, moveFactor);
            const wasMoving = remotePlayerMoving.get(player.id) || false;
            const isMoving = wasMoving ? moveFactor > MOVE_STOP_THRESHOLD : moveFactor > MOVE_START_THRESHOLD;
            remotePlayerMoving.set(player.id, isMoving);
            const previousGaitWeight = remotePlayerGaitWeight.get(player.id) || 0;
            const targetGaitWeight = isMoving ? 1 : 0;
            const gaitWeight = previousGaitWeight + (targetGaitWeight - previousGaitWeight) * GAIT_WEIGHT_SMOOTHING;
            remotePlayerGaitWeight.set(player.id, gaitWeight);
            const locomotionState = !isMoving ? "idle" : (moveFactor < WALK_RUN_THRESHOLD ? "walk" : "run");
            remotePlayerLocomotionState.set(player.id, locomotionState);
            let phase = remotePlayerAnimPhase.get(player.id) || 0;
            if (!isMoving) {
                phase += IDLE_PHASE_SPEED;
            } else {
                const cycleHz = locomotionState === "run" ? RUN_CYCLE_HZ : WALK_CYCLE_HZ;
                phase += deltaTime * Math.PI * 2 * cycleHz;
            }
            remotePlayerAnimPhase.set(player.id, phase);
            const bobAmount = STABLE_BLOCK_WALK ? 0 : (gaitWeight > 0.02 ? Math.sin(phase * 8) * 1.2 * gaitWeight : 0);
            const pitchLean = STABLE_BLOCK_WALK ? 0 : (gaitWeight > 0.02 ? Math.cos(phase * 8) * 0.022 * gaitWeight : 0);
            const runLean = STABLE_BLOCK_WALK ? 0 : (speed > REMOTE_RUN_SPEED_THRESHOLD ? -0.08 : 0);

            syncPlayerWeapon(player, root);
            updateWeaponAim(player, root, runLean, pitchLean, gaitWeight, phase);
            const crouchVisualOffset = player.crouching ? -14 : 0;
            root.position.set(player.x, (player.z || 0) + bobAmount + crouchVisualOffset, player.y);
            const targetYaw = player.angle + CHARACTER_YAW_OFFSET;
            const previousYaw = remotePlayerBodyYaw.get(player.id) ?? targetYaw;
            const smoothYaw = lerpAngle(previousYaw, targetYaw, BODY_YAW_SMOOTHING);
            remotePlayerBodyYaw.set(player.id, smoothYaw);
            root.rotation.y = smoothYaw;
            root.rotation.z = 0;
            root.rotation.x = 0;
            updateNameLabel(player, root);
        }

        for (const [playerId, root] of remotePlayerRoots.entries()) {
            if (activePlayerIds.has(playerId)) {
                continue;
            }
            remotePlayerGroup.remove(root);
            remotePlayerRoots.delete(playerId);
            remotePlayerModelPaths.delete(playerId);
            remotePlayerAnimPhase.delete(playerId);
            remotePlayerMoveFactor.delete(playerId);
            remotePlayerGaitWeight.delete(playerId);
            remotePlayerBodyYaw.delete(playerId);
            remotePlayerLocomotionState.delete(playerId);
            remotePlayerMoving.delete(playerId);
            remotePlayerWeaponModelPaths.delete(playerId);
            remotePlayerWeaponAnchors.delete(playerId);
            remotePlayerWeaponAim.delete(playerId);
            remotePlayerLastAmmo.delete(playerId);
            remotePlayerShotRaise.delete(playerId);
            remotePlayerWeaponRecoil.delete(playerId);
            remotePlayerRightArm.delete(playerId);
            remotePlayerArmRotX.delete(playerId);
            remotePlayerLegRotX.delete(playerId);
            remotePlayerWeaponRot.delete(playerId);
            remotePlayerWeaponCombatBlend.delete(playerId);
            remotePlayerWeaponInBackMount.delete(playerId);
            remotePlayerLastShotAt.delete(playerId);
            const label = remotePlayerLabels.get(playerId);
            if (label) {
                label.remove();
                remotePlayerLabels.delete(playerId);
            }
        }
    }

    return { syncRemotePlayers };
}
