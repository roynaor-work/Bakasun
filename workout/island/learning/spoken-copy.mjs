// The generators and round rewards use whole numbers from 0 to 100.
const feminineUnits=['אֶפֶס','אַחַת','שְׁתַּיִם','שָׁלֹשׁ','אַרְבַּע','חָמֵשׁ','שֵׁשׁ','שֶׁבַע','שְׁמוֹנֶה','תֵּשַׁע','עֶשֶׂר'];
const masculineUnits=['אֶפֶס','אֶחָד','שְׁנַיִם','שְׁלֹשָׁה','אַרְבָּעָה','חֲמִשָּׁה','שִׁשָּׁה','שִׁבְעָה','שְׁמוֹנָה','תִּשְׁעָה','עֲשָׂרָה'];
const tens=['','','עֶשְׂרִים','שְׁלֹשִׁים','אַרְבָּעִים','חֲמִשִּׁים','שִׁשִּׁים','שִׁבְעִים','שְׁמוֹנִים','תִּשְׁעִים'];

function and(text) {
  return (/^[בומפ]|^[א-ת]ְ/u.test(text.normalize('NFD'))?'וּ':'וְ')+text;
}

export function numberVoice(value,masculine=false) {
  const units=masculine?masculineUnits:feminineUnits;
  if(value<=10)return units[value];
  if(value<20){
    const unit=value%10;
    const first=unit===2?(masculine?'שְׁנֵים':'שְׁתֵּים'):units[unit];
    return first+(masculine?' עָשָׂר':' עֶשְׂרֵה');
  }
  if(value===100)return 'מֵאָה';
  const unit=value%10,ten=tens[Math.floor(value/10)];
  return unit?ten+' '+and(units[unit]):ten;
}

export function quantityVoice(count,singular,plural,masculine=false) {
  if(count===1)return singular+' '+numberVoice(1,masculine);
  if(count===2)return (masculine?'שְׁנֵי':'שְׁתֵּי')+' '+plural;
  return numberVoice(count,masculine)+' '+plural;
}

export const correctVoice='כָּל הַכָּבוֹד. מַמְשִׁיכִים לִלְמֹד.';
export const retryVoice='נְנַסֶּה שׁוּב.';
export const pictureRevealVoice='הִנֵּה הַתְּמוּנָה הַשְּׁלֵמָה.';

export function feedbackVoice(question,{correct,resolved}) {
  if(correct)return correctVoice;
  if(!resolved)return `${retryVoice} ${question.hintVoice}`;
  if(question.kind==='memory'||question.kind==='jigsaw')return pictureRevealVoice;
  return `הַתְּשׁוּבָה הִיא: ${question.answerVoice}.`;
}

export function roundVoice({money,stars}) {
  const coins=quantityVoice(money,'מַטְבֵּעַ','מַטְבְּעוֹת',true);
  const points=quantityVoice(stars,'כוֹכָב','כּוֹכָבִים',true);
  return `כָּל הַכָּבוֹד. סִיַּמְתֶּם סֶבֶב. קִבַּלְתֶּם ${coins} ${and(points)}.`;
}
