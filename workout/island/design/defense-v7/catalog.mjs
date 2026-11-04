export const catalog=[
  {id:'alien-scout',name:'סייר זרע',family:'הצי',color:'#A3D9BD',description:'גוף עגול, כיפה ירוקה וטבעת אור.'},
  {id:'alien-manta',name:'מיירט מנטה',family:'הצי',color:'#9D96BF',description:'כנפיים רחבות ושני מנועים אחוריים.'},
  {id:'alien-beetle',name:'מפציץ חיפושית',family:'הצי',color:'#E98E76',description:'מעטפת כפולה ופתח מטען תחתון.'},
  {id:'alien-carrier',name:'נושאת שושן',family:'הצי',color:'#9D96BF',description:'טבעת חלולה עם ליבה תלויה.'},
  {id:'alien-harvester',name:'קוצר תלתן',family:'הצי',color:'#318E88',description:'שלוש זרועות סביב ליבת איסוף.'},
  {id:'alien-boss',name:'בוס הכתר',family:'הצי',color:'#655786',description:'שישה קוצים, שש ליבות ומחולל מרכזי.'},
  {id:'defender-plane',name:'מטוס המגן',family:'המשמר',color:'#318E88',description:'גוף קרם, כנפי טורקיז ושני עוגני ירי.'},
  {id:'boar-amber',name:'חזיר ענבר',family:'החווה',color:'#8F6549',description:'בוגר חום, ניבים מעוקלים ומבט סקרן.'},
  {id:'boar-ash',name:'חזיר אפר',family:'החווה',color:'#697176',description:'גוף רחב ורעמה גבוהה.'},
  {id:'boar-striped',name:'גור מפוספס',family:'החווה',color:'#AE835B',description:'שלושה פסי קרם, אוזניים רכות ואף קורל.'},
  {id:'guard-ranger',name:'שומר השביל',family:'המשמר',color:'#658A61',description:'מדי שדה, כובע, אפוד ומכשיר קשר.'},
  {id:'guard-lookout',name:'שומרת התצפית',family:'המשמר',color:'#318E88',description:'מדי טורקיז ושיער מתולתל.'},
  {id:'guard-keeper',name:'שומרת השער',family:'המשמר',color:'#658A61',description:'מדי שדה ותסרוקת אסופה.'},
  {id:'farm-shelter',name:'סככת החווה',family:'אביזרים',color:'#E98E76',description:'גג קורל, קירות עץ ושוקת קדמית.'},
  {id:'guard-station',name:'עמדת שמירה',family:'אביזרים',color:'#318E88',description:'תחנת קשר מקורה עם נורת התרעה.'},
  {id:'farm-fence',name:'גדר מודולרית',family:'אביזרים',color:'#F1E6CE',description:'מקטע של שני מטרים עם עוגני קצה.'},
  {id:'farm-gate',name:'שער החווה',family:'אביזרים',color:'#D9BE8D',description:'בריח זהב וחיזוק אלכסוני.'},
  {id:'alarm-bell',name:'פעמון התרעה',family:'אביזרים',color:'#E6BF68',description:'פעמון חלול, ענבל וחבל הפעלה.'},
  {id:'island-palm',name:'דקל האי',family:'סביבה',color:'#83AC72',description:'גזע מתעקל, עלים רחבים ואגוזי קוקוס.'},
  {id:'island-cloud',name:'ענן רך',family:'סביבה',color:'#FFF8E9',description:'ארבע אונות צבועות בגווני קרם.'},
  {id:'planet-ring',name:'כוכב קורל',family:'חלל',color:'#E98E76',description:'כוכב לכת עם שתי טבעות נטויות.'},
  {id:'planet-moon',name:'ירח לבנדר',family:'חלל',color:'#9D96BF',description:'משטח לבנדר ומכתשים סגולים.'}
];
export const ids=catalog.map(x=>x.id);
export const lodIds=new Set(ids);
