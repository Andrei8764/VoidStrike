import { weaponPreviewImage } from "./dom.js";

export function initWeaponShopPreview() {
    // No-op: image preview does not require 3D setup.
}

export function previewWeaponModel(_modelFileName, previewFileName) {
    if (!weaponPreviewImage || !previewFileName) {
        return;
    }

    weaponPreviewImage.src = `/models/Previews/${previewFileName}`;
}
