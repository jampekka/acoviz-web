; Use GEN01 without normalization to preserve IR gain as stored in file,
; matching pconvolve behavior.
giHiidenkirnukiviIR ftgen 0, 0, 0, -1, "assets/hiidenkirnukivi.wav", 0, 0, 1

opcode SceneHiidenkirnukivi, a, a
  aMono xin

  ; Mirror the JACK path: input -> convolution IR.
  ; Keep ftconv partition at ksmps to minimize convolution algorithm latency.
  iPartLen = ksmps
  aHiid ftconv aMono, giHiidenkirnukiviIR, iPartLen
  aHiid = aHiid * 2.0
  aHiid dcblock2 aHiid

  xout aHiid
endop
