<CsoundSynthesizer>
<CsOptions>
; Run from the repository root: csound csound/render_responses.csd
-n -f -d -m0
</CsOptions>
<CsInstruments>
; Renders the impulse responses of the exhibition's audio processing, which the page
; applies by convolution: each scene's processing and the instrument input's DC blocker.
sr = 48000
ksmps = 64
nchnls = 1
0dbfs = 1

#include "csound/scenes/siliavuori.orc"
#include "csound/scenes/hiidenkirnukivi.orc"
#include "csound/scenes/pirunkirkko.orc"

#define RESPONSE(number'name'process) #
instr $number
  aIn mpulse 1, 0
  aOut $process aIn
  fout "assets/responses/$name..wav", -1, aOut
endin#

$RESPONSE(1'siliavuori'SceneSiliavuori)
$RESPONSE(2'hiidenkirnukivi'SceneHiidenkirnukivi)
$RESPONSE(3'pirunkirkko'ScenePirunkirkko)
$RESPONSE(4'dcblock'dcblock2)
</CsInstruments>
<CsScore>
; Each lasts until its response has decayed below -150 dBFS.
i 1 0 8
i 2 0 3.1
i 3 0 3
i 4 0 0.02
</CsScore>
</CsoundSynthesizer>
