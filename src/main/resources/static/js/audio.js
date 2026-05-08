export const audioContext = new (window.AudioContext || window.webkitAudioContext)();

const reloadAudio = new Audio("sounds/m4a1_gun.mp3");
reloadAudio.preload = "auto";

const infinityAudio = new Audio("sounds/infinity.mp3");
infinityAudio.preload = "auto";

export function resumeAudio() {
    if (audioContext.state === "suspended") {
        audioContext.resume();
    }
}

export function playShootSound(weapon) {
    switch (weapon) {
        case "Pistol":
            playPistolSound();
            break;
        case "Rifle":
            playRifleSound();
            break;
        case "SMG":
            playSmgSound();
            break;
        case "Shotgun":
            playShotgunSound();
            break;
        case "Sniper":
            playSniperSound();
            break;
        default:
            playRifleSound();
            break;
    }
}

function playPistolSound() {
    playGunLayer("square", 150, 900, 0.075, 0.08, 0);
    playNoiseBurst(0.025, 0.045, 1200, 0);
}

function playRifleSound() {
    playGunLayer("sawtooth", 120, 760, 0.085, 0.075, 0);
    playGunLayer("square", 210, 420, 0.035, 0.055, 0.01);
    playNoiseBurst(0.035, 0.05, 1600, 0);
}

function playSmgSound() {
    playGunLayer("square", 185, 1050, 0.055, 0.045, 0);
    playGunLayer("triangle", 320, 620, 0.025, 0.035, 0.005);
    playNoiseBurst(0.025, 0.035, 1900, 0);
}

function playShotgunSound() {
    playGunLayer("sawtooth", 80, 520, 0.14, 0.16, 0);
    playGunLayer("square", 115, 360, 0.08, 0.12, 0.015);
    playNoiseBurst(0.09, 0.13, 950, 0);
}

function playSniperSound() {
    playGunLayer("square", 65, 420, 0.18, 0.2, 0);
    playGunLayer("sawtooth", 140, 260, 0.07, 0.12, 0.015);
    playNoiseBurst(0.08, 0.12, 700, 0);
    playTone("triangle", 880, 0.025, 0.12, 0.08);
}

export function playHeadshotSound() {
    playTone("sine", 960, 0.08, 0.08, 0);
    playTone("triangle", 1440, 0.055, 0.12, 0.04);
    playNoiseBurst(0.025, 0.05, 2600, 0);
}

export function playDoubleKillSound() {
    playTone("square", 330, 0.075, 0.09, 0);
    playTone("square", 495, 0.075, 0.09, 0.1);
    playTone("triangle", 990, 0.055, 0.18, 0.2);
}

export function playMvpSound() {
    playTone("triangle", 392, 0.07, 0.16, 0);
    playTone("triangle", 523.25, 0.07, 0.16, 0.16);
    playTone("triangle", 659.25, 0.075, 0.18, 0.32);
    playTone("sine", 1046.5, 0.055, 0.35, 0.5);
}

export function playReloadSound() {
    reloadAudio.currentTime = 0;
    reloadAudio.play().catch(() => {
        console.error("Failed to play reload sound");
    });
}

export function playInfinitySound() {
    infinityAudio.currentTime = 0;
    infinityAudio.play().catch(() => {
        console.error("Failed to play infinity sound");
    });
}

function playGunLayer(type, startFrequency, endFrequency, volume, duration, delay) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    const start = audioContext.currentTime + delay;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(endFrequency, start);
    filter.frequency.exponentialRampToValueAtTime(180, start + duration);

    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start(start);
    oscillator.stop(start + duration);
}

function playNoiseBurst(volume, duration, filterFrequency, delay) {
    const bufferSize = audioContext.sampleRate * duration;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const output = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
    }

    const noise = audioContext.createBufferSource();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    const start = audioContext.currentTime + delay;

    noise.buffer = buffer;

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(filterFrequency, start);
    filter.frequency.exponentialRampToValueAtTime(240, start + duration);

    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);

    noise.start(start);
    noise.stop(start + duration);
}

function playTone(type, frequency, volume, duration, delay) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const start = audioContext.currentTime + delay;

    // ... existing code ...
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