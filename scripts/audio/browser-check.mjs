// Real Web Audio decoding, loop-boundary rendering and mixer lifecycle checks.
// PLAYWRIGHT_MODULE may point to an existing Playwright installation.
import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.AUDIO_QA_URL || 'http://localhost:3117';
const out = process.env.AUDIO_QA_OUTPUT || '/tmp/upnext-audio-qa';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
await page.goto(`${base}/audio/manifest.json`);
await page.setContent('<button id="start">Start audio check</button>');
const catalog = await fs.readFile('src/lib/audioCatalog.ts', 'utf8');
const source = (await fs.readFile('src/lib/audio.ts', 'utf8')).replace(/^import .+;\n/gm, '');
const js = ts.transpileModule(catalog + '\n' + source + '\nglobalThis.qaAudio = new AppAudio();',
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
await page.addScriptTag({ type: 'module', content: js });
await page.evaluate(() => {
  document.querySelector('#start').onclick = () => {
    qaAudio.unlock();
    const ctx = qaAudio.context;
    const files = new WeakMap();
    const load = qaAudio.load.bind(qaAudio);
    qaAudio.load = async file => {
      const buffer = await load(file); files.set(buffer, file); return buffer;
    };
    globalThis.audioStarts = [];
    const makeVoice = qaAudio.makeVoice.bind(qaAudio);
    qaAudio.makeVoice = buffer => {
      const voice = makeVoice(buffer);
      const start = voice.source.start.bind(voice.source);
      voice.source.start = when => {
        audioStarts.push({ file: files.get(buffer), when, duration: buffer.duration, gain: voice.gain.gain.value });
        start(when);
      };
      return voice;
    };
    const sink = ctx.createMediaStreamDestination();
    const original = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function(destination, ...args) {
      const result = original.call(this, destination, ...args);
      if (destination === ctx.destination) original.call(this, sink);
      return result;
    };
    const chunks = [];
    const recorder = new MediaRecorder(sink.stream);
    recorder.ondataavailable = e => chunks.push(e.data);
    globalThis.recordingDone = new Promise(resolve => {
      recorder.onstop = async () => resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())));
    });
    globalThis.recorder = recorder;
    recorder.start();
  };
});
await page.click('#start');
await page.waitForFunction(() => qaAudio.current === 'main');
await page.waitForTimeout(2700);
await page.evaluate(() => qaAudio.setMusic('fitness'));
await page.waitForFunction(() => qaAudio.current === 'fitness');
await page.waitForTimeout(2700);
await page.evaluate(() => { qaAudio.play('heroHit'); qaAudio.play('shieldBlock'); });
await page.waitForTimeout(400);
await page.evaluate(() => qaAudio.setMusic('boss'));
await page.waitForFunction(() => qaAudio.current === 'boss');
await page.waitForTimeout(2500);
await page.evaluate(() => { qaAudio.play('criticalHit'); qaAudio.setMusic('fitness'); });
await page.waitForFunction(() => qaAudio.current === 'fitness');
await page.waitForTimeout(2700);
const transitions = await page.evaluate(() => ({ track: qaAudio.current, musicVoices: qaAudio.music.size, effects: qaAudio.effects.size }));
if (transitions.musicVoices !== 1) throw new Error(`Leaked music voices ${JSON.stringify(transitions)}`);
const starts = await page.evaluate(() => audioStarts);
const intro = starts.find(cue => cue.file === 'sfx-bossTransition.wav');
const boss = starts.find(cue => cue.file === 'bgm-boss.m4a');
if (!intro || !boss || boss.when - intro.when < 0.44 || intro.duration > 0.95 || intro.gain > 0.27) {
  throw new Error(`Boss intro did not lead the music quietly: ${JSON.stringify({ intro, boss })}`);
}
await page.evaluate(() => qaAudio.setEnabled(false));
const muted = await page.evaluate(() => ({ music: qaAudio.music.size, effects: qaAudio.effects.size }));
if (muted.music || muted.effects) throw new Error('Mute left live nodes');
await page.evaluate(() => { qaAudio.setMusic('learning'); qaAudio.setMusic('wellness'); qaAudio.setEnabled(true); });
await page.waitForFunction(() => qaAudio.current === 'wellness');
await page.evaluate(() => qaAudio.setActive(false));
if (await page.evaluate(() => qaAudio.music.size + qaAudio.effects.size)) throw new Error('Background left live nodes');
await page.evaluate(() => qaAudio.setActive(true));
await page.waitForFunction(() => qaAudio.current === 'wellness');
await page.evaluate(() => { qaAudio.setEnabled(false); recorder.stop(); });
await fs.writeFile(path.join(out, 'transitions.webm'), Buffer.from(await page.evaluate(() => recordingDone)));
// Decode every real asset in the browser and render each exact loop boundary offline.
const decoded = await page.evaluate(async () => {
  const manifest = await (await fetch('/audio/manifest.json')).json();
  const ctx = new AudioContext();
  const music = [];
  for (const [name, asset] of Object.entries(manifest.music)) {
    const buffer = await ctx.decodeAudioData(await (await fetch('/audio/' + asset.file)).arrayBuffer());
    const loopEnd = asset.frames / manifest.sampleRate;
    const offline = new OfflineAudioContext(2, 44100, 44100);
    const voice = offline.createBufferSource(); voice.buffer = buffer; voice.loop = true; voice.loopEnd = loopEnd;
    voice.connect(offline.destination); voice.start(0, loopEnd - 0.5);
    const result = await offline.startRendering(); const samples = result.getChannelData(0);
    let energy = 0; for (const value of samples) energy += value * value;
    if (energy < 0.01) throw new Error('Silent loop ' + name);
    music.push({ name, decodedSeconds: buffer.duration, loopEnd, seamRms: Math.sqrt(energy / samples.length) });
  }
  for (const asset of Object.values(manifest.sfx)) {
    const decoded = await ctx.decodeAudioData(await (await fetch('/audio/' + asset.file)).arrayBuffer());
    if (decoded.duration <= 0) throw new Error('Empty ' + asset.file);
  }
  await ctx.close();
  return { music, effects: Object.keys(manifest.sfx).length };
});
await fs.writeFile(path.join(out, 'audio-results.json'), JSON.stringify({ transitions, muted, starts, decoded, errors }, null, 2));
if (errors.length) throw new Error(errors.join('\n'));
console.log(JSON.stringify({ decodedEffects: decoded.effects, decodedMusic: decoded.music.length, transitions,
  bossIntro: { lead: boss.when - intro.when, duration: intro.duration, gain: intro.gain }, muted, errors }));
await browser.close();
