export const audioContext = new (window.AudioContext || window.webkitAudioContext)();

export function resumeAudio() {
    if (audioContext.state === "suspended") {
        audioContext.resume();
    }
}

export function playShootSound(weapon) {
    const now = audioContext.currentTime;
    const punch = audioContext.createOscillator();
    const snap = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();

    punch.type = "square";
    snap.type = "sawtooth";
    punch.frequency.value = weapon === "Sniper" ? 78 : weapon === "SMG" ? 160 : 118;
    snap.frequency.value = weapon === "Sniper" ? 240 : 340;

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(220, now + 0.12);

    gain.gain.setValueAtTime(weapon === "Sniper" ? 0.12 : 0.075, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (weapon === "Sniper" ? 0.16 : 0.09));

    punch.connect(filter);
    snap.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);

    punch.start(now);
    snap.start(now);
    punch.stop(now + 0.14);
    snap.stop(now + 0.08);
}

export function playReloadSound() {
    playTone("triangle", 260, 0.035, 0.08, 0);
    playTone("square", 190, 0.025, 0.07, 0.1);
    playTone("triangle", 360, 0.025, 0.08, 0.22);
}

function playTone(type, frequency, volume, duration, delay) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const start = audioContext.currentTime + delay;

    oscillator.type = type;
    oscillator.frequency.value = frequency;

    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start(start);
    oscillator.stop(start + duration);
}

export function getRecoilKick(weapon) {
    switch (weapon) {
        case "Pistol":
            return 4;
        case "Rifle":
            return 6;
        case "SMG":
            return 5;
        case "Shotgun":
            return 12;
        case "Sniper":
            return 15;
        default:
            return 5;
    }
}