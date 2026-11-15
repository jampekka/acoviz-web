<CsoundSynthesizer>
<CsOptions>
; Run from the repository root: csound csound/render_drums.csd
; Needs Csound's FluidSynth opcodes and the FluidR3 GM soundfont.
-n -f -d -m0
</CsOptions>
<CsInstruments>
; Renders the drum notes of the virtual instrument with the same FluidSynth setup as the
; exhibition, one file per velocity layer of the kit, at the layer's top velocity.
sr = 48000
ksmps = 64
nchnls = 2
0dbfs = 1

giDrumFluid fluidEngine
giDrumSfId fluidLoad "/usr/share/sounds/sf2/FluidR3_GM.sf2", giDrumFluid, 1
fluidProgramSelect giDrumFluid, 9, giDrumSfId, 128, 0

instr 1
  fluidNote giDrumFluid, 9, p4, p5
endin

instr 2
  aDrumL, aDrumR fluidOut giDrumFluid
  SFile sprintf "assets/drums/%d_%d.wav", p4, p5
  fout SFile, -1, (aDrumL + aDrumR) * 0.5
endin
</CsInstruments>
<CsScore>
; Start, note, top velocity of a layer, and the time the note takes to decay below
; -120 dBFS. Notes are 10 s apart so that earlier notes have decayed below -150 dBFS.
#define NOTE(t'note'vel'dur) #
i 1 $t 0.02 $note $vel
i 2 $t $dur $note $vel#
$NOTE(0'36'80'3.0)
$NOTE(10'36'88'3.0)
$NOTE(20'36'96'3.0)
$NOTE(30'36'104'3.0)
$NOTE(40'36'112'3.0)
$NOTE(50'36'120'3.0)
$NOTE(60'36'127'3.0)
$NOTE(70'48'127'3.5)
</CsScore>
</CsoundSynthesizer>
