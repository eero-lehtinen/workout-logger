// Generates the end-of-rest sound:
//   node apps/android/tools/rest-beep.mjs apps/android/app/src/main/res/raw/rest_beep.wav
// Two beeps: a sine with some second and third harmonic, a 12 ms fade-in and
// a 25 ms fade-out, so there is no click. The sound plays at the media volume,
// so it is made as loud as the format allows: the beeps hold their level
// instead of decaying, are long enough to be heard at full loudness (short
// beeps sound quieter), and are saturated with tanh towards a square wave,
// which raises loudness by about 2.3 LU at the same -0.5 dBFS peak. More
// drive is louder still but harsh, from the harmonics above 4 kHz. The
// harmonics (~2.4 and ~3.9 kHz) are where small speakers and hearing are
// most sensitive.
import { writeFileSync } from "node:fs";

const rate = 44100,
  freq = 784,
  beep = 0.4,
  gap = 0.14,
  tail = 0.05,
  drive = 2.5,
  peak = 10 ** (-0.5 / 20);
const total = Math.round((beep * 2 + gap + tail) * rate);
const samples = new Float64Array(total);
for (const start of [0, beep + gap]) {
  for (let i = 0; i < beep * rate; i++) {
    const t = i / rate;
    const attack = Math.min(1, t / 0.012);
    const env =
      Math.sin((Math.PI / 2) * attack) ** 2 * Math.min(1, (beep - t) / 0.025);
    const w = 2 * Math.PI * freq * t;
    samples[Math.round(start * rate) + i] =
      env * (Math.sin(w) + 0.2 * Math.sin(2 * w) + 0.2 * Math.sin(3 * w));
  }
}
const max = samples.reduce((m, s) => Math.max(m, Math.abs(s)), 0);
const pcm = Buffer.alloc(total * 2);
samples.forEach((s, i) => {
  const shaped = Math.tanh((drive * s) / max) / Math.tanh(drive);
  pcm.writeInt16LE(Math.round(shaped * peak * 32767), i * 2);
});
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
