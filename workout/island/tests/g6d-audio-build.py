# Original layered naval water/air sounds. Dedicated to CC0 1.0 Universal.
import math,random,wave,struct,subprocess
random.seed(624)
for name,duration in [('waves',4),('splash',1.2),('whistle',.85)]:
 rate=22050;data=[];low=0;mid=0;phase=0
 for i in range(int(rate*duration)):
  t=i/rate;u=t/duration;noise=random.uniform(-1,1);low+=.035*(noise-low);mid+=.28*(noise-mid)
  if name=='waves': v=(low*3+mid*.23)*(.55+.32*math.sin(2*math.pi*u)+.1*math.sin(6*math.pi*u));v*=min(1,t/.04,(duration-t)/.04)
  elif name=='splash': v=(mid*.8+low*2.5)*min(1,t/.018)*math.exp(-4*u)+math.sin(2*math.pi*180*t)*(1-u)**7*.12
  else:
   phase+=2*math.pi*(1600-1050*u)/rate;v=(math.sin(phase)*.17+math.sin(phase*1.017)*.1+(noise-mid)*.11)*math.sin(math.pi*u)**.6
  data.append(struct.pack('<h',int(max(-1,min(1,v))*27000)))
 with wave.open('/tmp/g6d-'+name+'.wav','wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate);f.writeframes(b''.join(data))
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i','/tmp/g6d-'+name+'.wav','-c:a','libvorbis','-q:a','1','workout/island/assets/audio/g6d/'+name+'.ogg'],check=True)
