opcode SceneSiliavuori, a, a
  aMono xin

  ; Match current JS scene config:
  ; lag1 = (40 * 2) / 330 = 0.242424 s
  ; lag2 = ((120 - 40) * 2) / 330 = 0.484848 s
  iLag1 = 0.242424
  iLag2 = 0.484848

  iLag1 = 0.3
  iLag2 = 0.6

  ; chain1: gain=0.6, wet=0.1, decay=0.2
  iAmount1 = 0.06
  iDry1 = 0.3
  iDecay1 = 0.2
  ; chain2: gain=0.06, wet=0.5, decay=0.3
  iAmount2 = 0.03
  iDry2 = 0.1
  iDecay2 = 0.3
  ; chain3: gain=0.006, wet=1.0, decay=3.0
  iAmount3 = 0.006
  iDry3 = 0.0
  iDecay3 = 3.0

  aDel1 vdelay3 aMono, iLag1 * 1000, 1500
  aDel2 vdelay3 aMono, iLag2 * 1000, 1500
  aDel3 vdelay3 aMono, iLag2 * 1000, 1500

  ; Per-reflection reverbs.
  aRev1 nreverb aDel1, iDecay1, 0.5
  aRev2 nreverb aDel2, iDecay2, 0.5
  aRev3 nreverb aDel3, iDecay3, 0.7

  aChain1 = aDel1 * iDry1 + aRev1 * iAmount1
  aChain2 = aDel2 * iDry2 + aRev2 * iAmount2
  aChain3 = aDel3 * iDry3 + aRev3 * iAmount3

  aOut = aChain1 + aChain2 + aChain3
  xout aOut
endop
