#!/usr/bin/env python3
"""Rebuild licensed SFX and seamless BGM. Requires ffmpeg, numpy and downloaded Kenney packs.
Usage: python3 scripts/audio/prepare.py /path/to/mp3s /path/to/extracted-packs
Original user files are never modified. No network access is used by this script.
"""
import hashlib, json, pathlib, shutil, subprocess, sys, unicodedata
import numpy as np
ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/audio'
IOS = ROOT / 'upnext-ios/UpNext/UpNext/Audio'
SR = 44100
FITNESS_MUSIC = {
    'source': 'mountain_stage_bpm165.ogg',
    'title': 'Mountain Stage', 'author': 'MintoDog',
    'sourceUrl': 'https://opengameart.org/content/mountain-stage',
    'downloadUrl': 'https://opengameart.org/sites/default/files/mountain_stage_bpm165_0.ogg',
    'license': 'CC0-1.0',
    'licenseUrl': 'https://creativecommons.org/publicdomain/zero/1.0/',
    'bpm': 165,
}
FITNESS_SOURCE = ROOT / 'scripts/audio/sources' / FITNESS_MUSIC['source']
BGM = {
    'main': 'main-bg-ambient', 'fitness': '강철산봉우리', 'learning': '메아리도서관',
    'mindfulness': '영혼사원', 'nutrition': '황금들판', 'social': '광장시장',
    'productivity': '시계탑', 'wellness': '온천골짜기', 'trending': '신비차원', 'boss': 'bossfight',
}
# name: pack, source basename. Every cue uses an authored sample, including the old UI cues.
SFX = {
 'select': ('interface-sounds','click_003'), 'confirm': ('digital-audio','twoTone1'),
 'cancel': ('interface-sounds','back_002'), 'cardFlip': ('casino-audio','card-slide-3'),
 'cardSelect': ('interface-sounds','select_002'), 'cardHover': ('interface-sounds','tick_001'),
 'cardPreview': ('casino-audio','card-slide-1'), 'packOpen': ('casino-audio','cards-pack-open-1'),
 'complete': ('digital-audio','threeTone1'), 'fullClear': ('music-jingles','jingles_NES01'),
 'levelUp': ('music-jingles','jingles_NES00'), 'equip': ('rpg-audio','metalLatch'),
 'xpGain': ('digital-audio','highUp'), 'chargeUp': ('digital-audio','powerUp8'),
 'ambientFloat': ('digital-audio','phaseJump4'), 'pulseWave': ('digital-audio','phaserUp6'),
 'collect': ('rpg-audio','handleCoins2'), 'fireIgnite': ('digital-audio','spaceTrash3'),
 'impactShake': ('digital-audio','lowRandom'), 'superIgnite': ('digital-audio','powerUp12'),
 'meteorWhoosh': ('digital-audio','phaserDown3'), 'matchPair': ('digital-audio','pepSound3'),
 'curseTrigger': ('digital-audio','zapThreeToneDown'), 'rewardChoose': ('digital-audio','powerUp3'),
 'cameraShutter': ('interface-sounds','switch_004'), 'polaroidSlide': ('casino-audio','card-slide-8'),
 'treeGrow': ('digital-audio','powerUp5'),
 'enhanceSuccessHigh': ('music-jingles','jingles_NES02'),
 'enhanceSuccessMax': ('music-jingles','jingles_NES03'),
 'enhanceShatter': ('digital-audio','spaceTrash5'),
 'heroHit': ('rpg-audio','knifeSlice'), 'enemyHit': ('rpg-audio','chop'),
 'criticalHit': ('digital-audio','zapThreeToneUp'), 'dodge': ('digital-audio','phaserDown1'),
 'miss': ('rpg-audio','cloth2'), 'shieldBlock': ('rpg-audio','metalPot2'),
 'heal': ('digital-audio','powerUp2'), 'poison': ('digital-audio','zapTwoTone2'),
 'skillMelee': ('digital-audio','laser7'), 'skillMagic': ('digital-audio','phaserUp3'),
 'skillHoly': ('digital-audio','powerUp7'), 'skillTime': ('digital-audio','phaseJump2'),
 'encounter': ('digital-audio','lowThreeTone'), 'floorAdvance': ('interface-sounds','open_002'),
 'treasure': ('digital-audio','powerUp1'), 'lootDrop': ('digital-audio','pepSound5'),
 'rareLoot': ('digital-audio','powerUp11'), 'battleWin': ('digital-audio','pepSound1'),
 'defeat': ('music-jingles','jingles_NES14'), 'retreat': ('digital-audio','highDown'),
 'timeWarning': ('interface-sounds','question_002'), 'enhanceCharge': ('digital-audio','powerUp10'),
 'enhanceSuccess': ('music-jingles','jingles_NES02'), 'enhanceFail': ('digital-audio','phaserDown2'),
 'itemBreak': ('digital-audio','spaceTrash5'), 'skillLearn': ('digital-audio','powerUp9'),
 'choiceOpen': ('interface-sounds','maximize_002'), 'minigameSuccess': ('digital-audio','threeTone1'),
 'minigameFail': ('digital-audio','lowDown'), 'bagPlace': ('casino-audio','card-place-2'),
 'bagRotate': ('interface-sounds','switch_002'), 'bagReject': ('interface-sounds','error_002'),
}

def decode(path, channels, filters='anull'):
    data = subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-af',filters,
                                    '-f','f32le','-ar',str(SR),'-ac',str(channels),'-'])
    return np.frombuffer(data, dtype='<f4').copy().reshape(-1,channels)

def encode(samples, path, channels):
    codec = ['-c:a','aac','-b:a','160k','-movflags','+faststart'] if path.suffix == '.m4a' else ['-c:a','pcm_s16le']
    subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(SR),'-ac',str(channels),
                    '-i','-',*codec,str(path)],input=samples.astype('<f4').tobytes(),check=True)

def trim(x, threshold):
    audible = np.where(np.max(np.abs(x),axis=1)>threshold)[0]
    if len(audible): return x[max(0,audible[0]-220):min(len(x),audible[-1]+441)]
    raise ValueError('Silent source')

def prepare_music(key, source):
    filters = 'highpass=f=75,lowpass=f=3600,acompressor=threshold=0.12:ratio=2:attack=20:release=250,' if key=='main' else ''
    x = decode(source,2,filters+'loudnorm=I=-20:TP=-3:LRA=9')
    if key == 'fitness':
        # This authored loop is exactly 40 bars at 165 BPM. Preserve its timing
        # and overlap two whole bars so the rhythm stays aligned at the join.
        n = round(SR * 8 * 60 / FITNESS_MUSIC['bpm'])
    else:
        x = trim(x,0.001)
        n = SR*3
    if len(x) <= 2*n:
        raise ValueError(f'{source.name} is too short for its crossfade')
    # Rotate the period: middle, then tail blended into head. The wrap now joins
    # two adjacent source samples instead of jumping from EOF to intro.
    t=np.linspace(0,1,n,dtype=np.float32)[:,None]
    cross=x[-n:]*np.cos(t*np.pi/2)+x[:n]*np.sin(t*np.pi/2)
    loop=np.concatenate([x[n:-n],cross])
    peak=float(np.max(np.abs(loop)))
    if peak>0.84: loop*=0.84/peak
    dest=OUT/f'bgm-{key}.m4a';encode(loop,dest,2)
    entry={'file':dest.name,'frames':len(loop),'seconds':round(len(loop)/SR,4),
           'source':source.name,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest()}
    if key == 'fitness':
        entry.update(FITNESS_MUSIC, loopCrossfadeSeconds=n/SR, loopCrossfadeBeats=8)
    print('BGM',key,len(loop)/SR,flush=True)
    return entry

def prepare_boss_transition(source):
    # Keep the original pitch, compress the long decay and fade out the tail.
    x=decode(source,2,'loudnorm=I=-18:TP=-3:LRA=9,atempo=2')[:round(SR*0.9)]
    n=round(SR*0.01);x[:n]*=np.linspace(0,1,n)[:,None]
    n=round(SR*0.22);x[-n:]*=np.linspace(1,0,n)[:,None]
    encode(x,OUT/'sfx-bossTransition.wav',2)
    return {'file':'sfx-bossTransition.wav','source':source.name,'pack':'user supplied',
            'seconds':len(x)/SR,'speed':2,'fadeOutSeconds':0.22}

def build(mp3s, packs):
    OUT.mkdir(exist_ok=True,parents=True); IOS.mkdir(exist_ok=True,parents=True)
    files = {unicodedata.normalize('NFC',p.stem):p for p in mp3s.glob('*.mp3')}
    manifest = {'sampleRate':SR,'loopCrossfadeSeconds':3,'music':{},'sfx':{}}
    for key, original in BGM.items():
        source = FITNESS_SOURCE if key == 'fitness' else files[original]
        manifest['music'][key] = prepare_music(key, source)
    for key,(pack,stem) in SFX.items():
        source=next((packs/pack).rglob(stem+'.ogg'))
        x=trim(decode(source,1),0.002)
        # Peak-normalize each authored sample and soften edges to avoid clicks.
        x *= 0.63/max(0.001,float(np.max(np.abs(x))))
        n=min(220,len(x)//3)
        x[:n]*=np.linspace(0,1,n)[:,None];x[-n:]*=np.linspace(1,0,n)[:,None]
        dest=OUT/f'sfx-{key}.wav';encode(x,dest,1)
        manifest['sfx'][key]={'file':dest.name,'pack':pack,'source':str(source.relative_to(packs/pack))}
    manifest['sfx']['bossTransition']=prepare_boss_transition(files['bossfight-transitionsound'])
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    for p in OUT.iterdir():
        if p.is_file(): shutil.copy2(p,IOS/p.name)
    names=list(SFX)+['bossTransition']
    (ROOT/'src/lib/audioCatalog.ts').write_text('// Generated by scripts/audio/prepare.py.\nexport const SOUND_NAMES = '+json.dumps(names,indent=2)+' as const;\nexport type SoundName = (typeof SOUND_NAMES)[number];\nexport const MUSIC_LOOP_SECONDS = '+json.dumps({k:v['frames']/SR for k,v in manifest['music'].items()},indent=2)+' as const;\n')
    (ROOT/'upnext-ios/UpNext/UpNext/SoundName.swift').write_text('// Generated by scripts/audio/prepare.py.\nenum SoundName: String, CaseIterable {\n'+''.join('    case '+k+'\n' for k in names)+'}\n')

if __name__=='__main__': build(pathlib.Path(sys.argv[1]),pathlib.Path(sys.argv[2]))
