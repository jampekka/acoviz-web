; Use GEN01 without normalization to preserve IR gain as stored in file.
giPirunkirkkoIR ftgen 0, 0, 0, -1, "assets/pirunkirkko_synth.wav", 0, 0, 1

opcode ScenePirunkirkko, a, a
  aMono xin

  ; Mirror the JACK path: input -> convolution IR at gain 10.
  aPiru ftconv aMono, giPirunkirkkoIR, ksmps
  aPiru = aPiru * 10.0

  xout aPiru
endop
