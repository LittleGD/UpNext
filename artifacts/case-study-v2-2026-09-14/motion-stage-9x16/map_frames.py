#!/usr/bin/env python3
"""Map timestamps in the gap-compressed clip back to the full-res original and extract frames."""
import subprocess, re, sys, os, json
R='/private/tmp/claude-501/-Users-jmlee-Documents-UpNext/158a504d-78a9-4eb8-beaa-30b9a4678efd/scratchpad/rec'
OUT=sys.argv[1]; os.makedirs(OUT, exist_ok=True)
hold, pad, thresh = 0.9, 0.3, 0.002
def segments(src):
    dur=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',src]).decode().strip())
    out=subprocess.run(['ffmpeg','-v','info','-i',src,'-vf',f"select='gt(scene,{thresh})',showinfo",'-fps_mode','passthrough','-f','null','-'],stderr=subprocess.PIPE,stdout=subprocess.DEVNULL).stderr.decode(errors='replace')
    ts=[float(m) for m in re.findall(r'pts_time:\s*([0-9.]+)',out)] or [0.0]
    iv=[]; s=e=ts[0]
    for t in ts[1:]:
        if t-e<=hold: e=t
        else: iv.append((s,e)); s=e=t
    iv.append((s,e)); segs=[]
    for s,e in iv:
        s2=max(0.0,s-pad); e2=min(dur,e+pad+hold)
        if segs and s2<=segs[-1][1]: segs[-1]=(segs[-1][0],max(segs[-1][1],e2))
        else: segs.append((s2,e2))
    return segs
picks={
 's1_showcase_draft':[(0.5,'deck_hold'),(2.0,'fan'),(4.5,'card_preview'),(6.5,'confirm'),(8.5,'board_news'),(9.6,'complete_overlay'),(14.0,'camera'),(21.5,'decorate_a'),(22.5,'complete_board'),(24.5,'flame_lit1')],
 's5_fortune':[(0.5,'flame_aura_cta'),(11.5,'aura_intro'),(12.5,'aura_throw'),(14.0,'aura_reveal')],
 's7_rune_chest':[(0.0,'dungeon_choice'),(1.0,'chest_marker'),(3.0,'chest_result'),(8.0,'combat')],
 's6_retention_widget':[(3.0,'widget_step1'),(4.5,'widget_step2'),(8.0,'widget_done'),(10.5,'widget_handoff'),(12.5,'widget_error')],
 's6_retention_notification':[(5.5,'reminder'),(7.0,'permission'),(8.5,'reminder_set')],
}
for name,items in picks.items():
    src=f'{R}/{name}.mp4'; segs=segments(src)
    cum=[]; acc=0.0
    for s,e in segs: cum.append((acc,acc+(e-s),s)); acc+=(e-s)
    for ct,label in items:
        ot=None
        for a,b,s in cum:
            if a<=ct<b: ot=s+(ct-a); break
        if ot is None: ot=cum[-1][2]+(ct-cum[-1][0])
        subprocess.run(['ffmpeg','-loglevel','error','-y','-ss',f'{ot:.3f}','-i',src,'-frames:v','1',f'{OUT}/{label}.png'],check=True)
        print(f'{name} {ct:5.1f}s -> {ot:7.3f}s  {label}')
