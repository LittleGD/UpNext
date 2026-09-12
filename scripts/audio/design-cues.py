#!/usr/bin/env python3
"""Rebuild UpNext's card shuffle and soft level-up cues. No external downloads."""
import json
import pathlib
import shutil
import subprocess
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[2]
SR = 44100
OUT = ROOT / 'public/audio'
IOS = ROOT / 'upnext-ios/UpNext/UpNext/Audio'


def write(name, samples):
    samples *= 0.55 / max(0.001, np.abs(samples).max())
    target = OUT / f'sfx-{name}.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR),
                    '-ac', '1', '-i', '-', '-c:a', 'pcm_s16le', str(target)],
                   input=samples.astype('<f4').tobytes(), check=True)
    shutil.copy2(target, IOS / target.name)
    return {'file': target.name, 'pack': 'UpNext original sound design',
            'source': 'scripts/audio/design-cues.py', 'seconds': len(samples) / SR}


def bell(frequency, duration):
    t = np.arange(round(duration * SR)) / SR
    # Rounded fundamental with a quiet octave, no harsh square-wave fanfare.
    return (np.sin(2*np.pi*frequency*t) + 0.16*np.sin(4*np.pi*frequency*t)) * (1-np.exp(-t/0.008)) * np.exp(-t/0.14)


def build():
    # Layer the licensed physical card sample with a quiet pentatonic shimmer.
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(OUT/'sfx-cardFlip.wav'),
                                   '-af', 'highpass=f=500,lowpass=f=4200', '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'])
    card = np.frombuffer(raw, dtype='<f4').copy()[:round(SR*0.12)]
    card *= np.hanning(len(card))
    card /= max(0.001, np.abs(card).max())
    shuffle = np.zeros(round(SR*0.64))
    for index, freq in enumerate([523.251, 783.991, 659.255, 880]):
        offset = round(index*0.16*SR)
        # Wrap tails into the beginning to make a true seamless period.
        for layer, gain in [(card, 0.30), (bell(freq, 0.48), 0.10)]:
            np.add.at(shuffle, (offset + np.arange(len(layer))) % len(shuffle), layer*gain)
    level = np.zeros(round(SR*0.95))
    for index, freq in enumerate([523.251, 659.255, 783.991, 1046.502]):
        tone = bell(freq, 0.55) * [0.7, 0.75, 0.8, 1.0][index]
        offset = round(index*0.105*SR)
        level[offset:offset+len(tone)] += tone
    level[-4410:] *= np.linspace(1, 0, 4410)
    entries = {'cardShuffle': write('cardShuffle', shuffle), 'levelUp': write('levelUp', level)}
    entries['cardShuffle']['layerSource'] = 'sfx-cardFlip.wav (Kenney Casino Audio, CC0)'
    for directory in [OUT, IOS]:
        path = directory / 'manifest.json'
        manifest = json.loads(path.read_text())
        manifest['sfx'].update(entries)
        path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')


if __name__ == '__main__':
    build()
