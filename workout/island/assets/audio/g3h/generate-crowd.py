# Original nonverbal crowd texture, dedicated CC0-1.0. No speech or recordings.
import math,random,wave,struct
random.seed(31020);rate=22050;duration=6;n=rate*duration;mix=[0.0]*n
# Many detuned vocal harmonics, moving vowel formants and independently timed swells.
for voice in range(28):
 f=random.uniform(95,240);phase=random.random()*6.28;offset=random.random()*6.28;tempo=random.randint(1,3)
 for i in range(n):
  t=i/rate;envelope=(.5+.5*math.sin(2*math.pi*tempo*t/duration+offset))**3
  vibrato=.03*math.sin(2*math.pi*5*t+offset);v=sum(math.sin(2*math.pi*f*k*t+phase+vibrato*k)*(.14 if k<3 else .35 if k in [4,5,6] else .07)/k for k in range(1,10))
  mix[i]+=v*envelope/8
# Filtered clapping/rustle layer with periodic, seamless modulation.
low=0
for i in range(n):
 low=low*.78+random.uniform(-1,1)*.22
 mix[i]+=low*.22*(.6+.4*math.sin(2*math.pi*9*i/n))
# Blend the loop seam.
fade=1102
for j in range(fade):
 a=j/fade;v=mix[j]*a+mix[n-fade+j]*(1-a);mix[j]=v;mix[n-fade+j]=v
with wave.open('/tmp/g3h-crowd.wav','wb') as w:
 w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate);w.writeframes(b''.join(struct.pack('<h',int(max(-1,min(1,x))*28000)) for x in mix))
