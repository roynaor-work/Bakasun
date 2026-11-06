// Check the delivered copy, including encoded HTML and compatibility characters.
export function normalizeCopy(input) {
  return input.replace(/&#(x[0-9a-f]+|[0-9]+);?/gi, (match, digits) => {
    const value = digits[0].toLowerCase() === 'x' ? parseInt(digits.slice(1), 16) : Number(digits);
    return value <= 0x10ffff ? String.fromCodePoint(value) : match;
  }).replace(/&(excl|amp|nbsp|lrm|rlm);/gi, (_, name) => ({ excl: '!', amp: '&', nbsp: ' ', lrm: '', rlm: '' })[name.toLowerCase()])
    .normalize('NFKC').replace(/[\p{M}\p{Cf}]/gu, '');
}

const promotion = /(?<!\p{L})(?:[ובכלמשה]{0,3})?(?:מבצע(?:ים|י)?|הנח(?:ה|ות|ת)|הטב(?:ה|ות|ת)|מוזל(?:ת|ים|ות)?|קופון(?:ים)?|קוד\s+קופון|סייל(?:ים)?|sale|discount(?:s|ed)?|promo(?:tion)?|coupon|חינם|מתנה\s+בקנייה|מחיר\s+מיוחד|רק\s+היום|אחד\s+פלוס\s+אחד|\d+\s*\+\s*\d+)(?!\p{L})/iu;
const exclamation = /[!\u203c\u2048\u2049]/u;
// Local landlines, mobiles and international numbers, with optional separators.
const phone = /(?<!\d)(?:\+\s*\d(?:[\s().\-–־]*\d){7,14}|(?:00[\s().\-–־]*972|972)[\s().\-–־]*[1-9](?:[\s().\-–־]*\d){7,8}|0[\s().\-–־]*[2-9](?:[\s().\-–־]*\d){7,8})(?!\d)|(?:tel:|wa\.me\/)/iu;

export function copyViolations(input) {
  const raw = normalizeCopy(input);
  const text = raw + '\n' + raw.replace(/<[^>]*>/g, '');
  return [
    ...(exclamation.test(text) ? ['exclamation'] : []),
    ...(promotion.test(text) ? ['promotion'] : []),
    ...(phone.test(text) ? ['phone'] : []),
  ];
}
