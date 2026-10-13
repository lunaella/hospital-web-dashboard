// Generated alert tones for PendingApprovalAlerts — synthesized with the
// Web Audio API rather than shipped as audio files, so there's nothing to
// load and the pattern can scale with priority: EMERGENCY sounds like a
// ringing phone (the Red Cross's "something urgent is happening" signal),
// URGENT a double chime, NORMAL a single soft chime.
//
// Browsers keep audio suspended until the page has had a click or key
// press. An admin has always clicked something by the time they're past
// login, but unlockAlertSound() is still wired to the first interaction so
// the very first alert after a fresh page load isn't swallowed.

let ctx = null;

function getContext() {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!ctx) ctx = new AudioCtx();
  return ctx;
}

export function unlockAlertSound() {
  const audio = getContext();
  if (audio && audio.state === "suspended") audio.resume().catch(() => {});
}

function tone(audio, { freqs, start, duration, volume }) {
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.02);
  gain.gain.setValueAtTime(volume, start + duration - 0.05);
  gain.gain.linearRampToValueAtTime(0, start + duration);
  gain.connect(audio.destination);
  for (const freq of freqs) {
    const osc = audio.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(start);
    osc.stop(start + duration);
  }
}

export function playAlertSound(priority) {
  const audio = getContext();
  if (!audio) return;
  if (audio.state === "suspended") audio.resume().catch(() => {});
  const t = audio.currentTime + 0.05;

  if (priority === "EMERGENCY") {
    // Two rings of the classic 440 + 480 Hz telephone ring tone.
    for (const offset of [0, 0.5, 1.6, 2.1]) {
      tone(audio, { freqs: [440, 480], start: t + offset, duration: 0.4, volume: 0.25 });
    }
    return;
  }
  const chimes = priority === "URGENT" ? [0, 0.45] : [0];
  for (const offset of chimes) {
    tone(audio, { freqs: [880], start: t + offset, duration: 0.18, volume: 0.18 });
    tone(audio, { freqs: [660], start: t + offset + 0.18, duration: 0.25, volume: 0.18 });
  }
}
