export function createViewmodelRuntime(deps) {
    const {
        state,
        crosshairElement,
        adsScopeElement,
        VIEWMODEL_ADS_POS,
        VIEWMODEL_ADS_ROT,
        VIEWMODEL_BLEND_SPEED,
        ADS_WEAPON_OFFSET_X,
        ADS_WEAPON_OFFSET_Y,
        ADS_WEAPON_OFFSET_Z,
        loadWeaponTemplate,
        createLocalViewModelFallback,
        loadModularCharacterTemplate,
        getWeaponPathForSelf,
        getWeaponScaleByName,
        getLocalWeaponOffsetByName,
        getHipViewModelPosByWeapon,
        normalizeWeaponModel,
        localViewModelPivot,
        localBodyPivot,
        WEAPON_MODEL_ROT_X,
        WEAPON_MODEL_ROT_Y,
        WEAPON_MODEL_ROT_Z
    } = deps;

    let localViewModelPath = null;
    let localViewModelObject = null;
    let localFirstPersonBody = null;
    let localWeaponOffsetX = 0;
    let localWeaponOffsetY = 0;
    let localWeaponOffsetZ = 0;

    function syncLocalViewModel(self, getSelfPlayer) {
        if (!self) {
            if (localViewModelObject) {
                localViewModelPivot.remove(localViewModelObject);
                localViewModelObject = null;
                localViewModelPath = null;
            }
            if (localFirstPersonBody) {
                localBodyPivot.remove(localFirstPersonBody);
                localFirstPersonBody = null;
            }
            if (adsScopeElement) {
                adsScopeElement.classList.add("hidden");
            }
            return;
        }

        const weaponPath = getWeaponPathForSelf(self);
        const weaponScale = getWeaponScaleByName(self.weapon);
        const localWeaponOffset = getLocalWeaponOffsetByName(self.weapon);
        localWeaponOffsetX = localWeaponOffset.x;
        localWeaponOffsetY = localWeaponOffset.y;
        localWeaponOffsetZ = localWeaponOffset.z;
        if (!weaponPath) {
            return;
        }

        if (localViewModelPath === weaponPath && localViewModelObject) {
            return;
        }

        if (!localViewModelObject) {
            localViewModelObject = createLocalViewModelFallback();
            localViewModelPivot.add(localViewModelObject);
        }

        localViewModelPath = weaponPath;
        loadWeaponTemplate(weaponPath)
            .then(template => {
                if (localViewModelPath !== weaponPath) {
                    return;
                }

                const model = template.clone(true);
                model.rotation.set(WEAPON_MODEL_ROT_X, WEAPON_MODEL_ROT_Y, WEAPON_MODEL_ROT_Z);
                normalizeWeaponModel(model, weaponScale);
                model.position.set(localWeaponOffsetX, localWeaponOffsetY, localWeaponOffsetZ);
                model.traverse(node => {
                    if (!node.isMesh || !node.material) {
                        return;
                    }
                    if (Array.isArray(node.material)) {
                        node.material = node.material.map(material => material?.clone?.() ?? material);
                    } else if (node.material.clone) {
                        node.material = node.material.clone();
                    }
                    node.frustumCulled = false;
                    node.renderOrder = 50;
                    if (Array.isArray(node.material)) {
                        for (const material of node.material) {
                            if (!material) {
                                continue;
                            }
                            material.depthTest = false;
                            material.depthWrite = false;
                            material.needsUpdate = true;
                        }
                    } else {
                        node.material.depthTest = false;
                        node.material.depthWrite = false;
                        node.material.needsUpdate = true;
                    }
                });

                if (localViewModelObject) {
                    localViewModelPivot.remove(localViewModelObject);
                }

                localViewModelObject = model;
                localViewModelPivot.add(localViewModelObject);
            })
            .catch(() => {
            });

        if (!localFirstPersonBody) {
            loadModularCharacterTemplate()
                .then(template => {
                    if (!getSelfPlayer()) {
                        return;
                    }

                    const model = template.clone(true);
                    model.traverse(node => {
                        if (!node.isMesh || !node.material) {
                            return;
                        }
                        node.frustumCulled = false;
                        node.renderOrder = 45;
                    });

                    model.scale.setScalar(0.42);
                    model.position.set(0.0, -0.58, -0.15);
                    model.rotation.set(0, Math.PI, 0);

                    localFirstPersonBody = model;
                    localBodyPivot.add(localFirstPersonBody);
                })
                .catch(() => {
                });
        }
    }

    function updateLocalViewModel(self) {
        if (self?.reloading && state.ads) {
            state.ads = false;
        }

        const adsWeight = state.ads ? 1 : 0;
        const targetHipPos = getHipViewModelPosByWeapon(self?.weapon);
        const targetPos = adsWeight > 0.5 ? VIEWMODEL_ADS_POS : targetHipPos;
        const targetRot = adsWeight > 0.5 ? VIEWMODEL_ADS_ROT : deps.VIEWMODEL_HIP_ROT;

        localViewModelPivot.position.lerp(targetPos, VIEWMODEL_BLEND_SPEED);
        localViewModelPivot.rotation.x += (targetRot.x - localViewModelPivot.rotation.x) * VIEWMODEL_BLEND_SPEED;
        localViewModelPivot.rotation.y += (targetRot.y - localViewModelPivot.rotation.y) * VIEWMODEL_BLEND_SPEED;
        localViewModelPivot.rotation.z += (targetRot.z - localViewModelPivot.rotation.z) * VIEWMODEL_BLEND_SPEED;

        if (localViewModelObject) {
            const recoilOffset = Math.min(1, state.recoilKick / 18);
            const adsOffsetWeight = state.ads ? 1 : 0;
            const targetWeaponX = localWeaponOffsetX + ADS_WEAPON_OFFSET_X * adsOffsetWeight;
            const targetWeaponY = localWeaponOffsetY + ADS_WEAPON_OFFSET_Y * adsOffsetWeight;
            const targetWeaponZ = localWeaponOffsetZ + ADS_WEAPON_OFFSET_Z * adsOffsetWeight;

            localViewModelObject.position.x += (targetWeaponX - localViewModelObject.position.x) * VIEWMODEL_BLEND_SPEED;
            localViewModelObject.position.z += ((targetWeaponZ - recoilOffset * 0.22) - localViewModelObject.position.z) * VIEWMODEL_BLEND_SPEED;
            localViewModelObject.position.y += ((targetWeaponY + recoilOffset * 0.06) - localViewModelObject.position.y) * VIEWMODEL_BLEND_SPEED;
        }

        if (crosshairElement) {
            crosshairElement.classList.toggle("hidden", !self);
            const recoilSpread = Math.min(18, state.recoilKick || 0);
            const adsTighten = state.ads ? 3 : 0;
            const dynamicGap = Math.max(5, 8 + recoilSpread - adsTighten);
            crosshairElement.style.setProperty("--crosshair-gap", `${dynamicGap.toFixed(2)}px`);
        }

        if (adsScopeElement) {
            adsScopeElement.classList.add("hidden");
        }
    }

    return {
        syncLocalViewModel,
        updateLocalViewModel
    };
}
