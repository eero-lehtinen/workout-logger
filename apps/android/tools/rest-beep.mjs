// Generates the end-of-rest sound:
//   node apps/android/tools/rest-beep.mjs apps/android/app/src/main/res/raw/rest_beep.wav
// Two soft beeps: a sine with a little second harmonic, a 12 ms fade-in and
// a smooth decay, so there is no click or buzz.
import { writeFileSync } from "node:fs";

const rate = 44100,
  freq = 784,
  beep = 0.2,
  gap = 0.14,
  tail = 0.05;
const total = Math.round((beep * 2 + gap + tail) * rate);
const pcm = Buffer.alloc(total * 2);
for (const start of [0, beep + gap]) {
  for (let i = 0; i < beep * rate; i++) {
    const t = i / rate;
    const attack = Math.min(1, t / 0.012);
    const env =
      Math.sin((Math.PI / 2) * attack) ** 2 *
      Math.exp(-t * 9) *
      Math.min(1, (beep - t) / 0.02);
    const s =
      0.7 *
      env *
      (Math.sin(2 * Math.PI * freq * t) +
        0.15 * Math.sin(4 * Math.PI * freq * t));
    pcm.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, s)) * 32767),
      (Math.round(start * rate) + i) * 2,
    );
  }
}
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(rate, 24);
header.writeUInt32LE(rate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);
writeFileSync(process.argv[2], Buffer.concat([header, pcm]));
