#!/usr/bin/env python3
"""Import the supplied 2026–2027 Word catalogue (run from the repository root).

Only nonempty numbered product paragraphs are imported. Unnumbered cross-links
are excluded. Word stores the logical list across many numIds, whose level
starts are all 1; catalogue references and the final product confirm the global
sequence 1–212. Asserted anchors guard against accidental renumbering.

Planting unit prices and tiers are transcribed below because their prose uses
several different pricing formats. Output contains botanical descriptions;
medicinal treatment claims are omitted from website copy.
"""
import xml.etree.ElementTree as E, zipfile, re, json
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
r=E.fromstring(zipfile.ZipFile('Каталог 2027.docx').read('word/document.xml'))
rows=[]
for p in r.findall('.//w:body/w:p',ns):
 num=p.find('w:pPr/w:numPr/w:numId',ns)
 if num is None or num.get('{'+ns['w']+'}val') in ['0','69']:continue
 t=re.sub(r'\s+',' ',''.join(x.text or '' for x in p.findall('.//w:t',ns))).strip()
 if t:rows.append(t)
assert len(rows)==212

def head_and_description(t):
 depth=0
 for i,c in enumerate(t):
  if c=='(':depth+=1
  elif c==')':depth-=1
  if c=='.' and depth==0 and re.match(r'\s+(?:[А-ЯЁ]|\(?Описание)',t[i+1:]):
   return t[:i],t[i+1:].strip()
 raise ValueError(t[:150])

out=[]
for n,t in enumerate(rows,1):
 if n==212:
  out.append({'catalogNumber':n,'name':'Печатный каталог 2027–2028','category':'catalog','description':'Новый каталог редких растений в нашем конверте. Рассылка в ноябре 2027 года.','unit':'1 печатный каталог','price':60,'sourceUrl':'./catalog-2027.docx','shippingNote':'В нашем конверте, в ноябре 2027 года. Пересылка включена в цену.','shippingIncluded':True});continue
 h,d=head_and_description(t)
 parts=re.split(r'\s+[-–—]\s+',h,maxsplit=1)
 name=parts[0].strip();latin=parts[1].strip() if len(parts)>1 else None
 if n==1:name,latin='Мак пионовидный','Papaver plena'
 if n==101:name+=' · большой пакет'
 if n==110:name+=' · большой пакет'
 item={'catalogNumber':n,'name':name,'category':'annuals' if n<=5 else 'perennials' if n<=67 else 'useful' if n<=169 else 'planting','description':d,'unit':'','price':None,'sourceUrl':'./catalog-2027.docx'}
 if latin:item['latinName']=latin
 if n==13:item['latinName']='Thalictrum angustifolium'
 out.append(item)

# Prices per physical unit, minimum order and quantity discounts, checked against
# the planting-material section of the supplied catalogue (not the older site).
# tuple: base price, minimum quantity, unit, [(quantity threshold, unit price)]
planting_prices = {
170:(390,1,'саженец',[]),
171:(140,3,'клубнелуковица',[(5,120),(10,100)]),
172:(450,1,'клубнелуковица',[]),
173:(390,1,'саженец',[(3,350)]),
174:(450,1,'саженец',[]),
175:(450,1,'саженец',[]),
176:(130,3,'корневище',[(5,100)]),
177:(240,2,'саженец',[(3,200)]),
178:(450,1,'саженец',[(3,400)]),
179:(390,1,'посадочный корень',[]),
180:(390,1,'саженец',[(5,300)]),
181:(490,1,'саженец',[]),
182:(490,1,'саженец',[]),
183:(160,3,'луковица',[(5,140),(10,120),(20,100),(50,90)]),
184:(390,1,'саженец',[(3,350)]),
185:(390,1,'саженец',[(3,350)]),
186:(150,3,'посадочный корень',[(5,110)]),
187:(240,2,'посадочный корень',[(5,190)]),
188:(390,1,'посадочный корень',[]),
189:(450,1,'саженец',[(3,400),(10,350)]),
190:(390,1,'саженец',[(3,350)]),
191:(240,2,'саженец',[(3,190)]),
192:(490,1,'саженец',[(3,450)]),
193:(650,1,'луковица',[]),
194:(240,2,'луковица',[(3,190)]),
195:(120,5,'луковица',[(10,90)]),
196:(90,5,'луковица',[(10,70),(20,50)]),
197:(490,1,'саженец',[]),
198:(240,2,'посадочный корень',[(3,190)]),
199:(160,3,'посадочный корень',[(5,120)]),
200:(240,2,'посадочный корень',[(5,200)]),
201:(210,2,'посадочный корень',[(3,180)]),
202:(290,2,'саженец',[(5,200)]),
203:(390,1,'посадочный корень',[]),
204:(490,1,'посадочный корень',[]),
205:(280,1,'саженец',[(3,250)]),
206:(390,1,'луковица',[(3,350)]),
207:(240,2,'саженец',[(3,190)]),
208:(290,1,'саженец',[(3,250)]),
209:(160,3,'клубень',[(5,120),(10,100)]),
210:(90,5,'луковица',[(10,80),(20,70),(50,60),(100,50)]),
211:(250,2,'саженец',[(5,200)]),
}

# Product descriptions cover growing, appearance and culinary use. The document
# also contains medicinal treatment claims; those are not copied into shop copy.
medical = re.compile(r'болез|заболев|лечени|лечебн.*свойств|целебн|лекарственн.*свойств|настой|отвар|компресс|медицин|врач|гиперт|давлени|диабет|инсулин|сахар.*кров|онкол|опухол|раков|канцер|инфекц|иммун|туберк|артрит|ревмат|подагр|стенокард|гастрит|язв|бронхит|бессон|эпилеп|судорог|инсульт|инфаркт|геморро|запор|гепатит|почек|печени|сердеч|сердца|сердце\b|организм|простуд|кашл|боли|головокруж|бактериц|противовоспал|противомикроб|антимикроб|ранозажив|кровоостан|мочегон|желчегон|спазмолит|регенер|вяжущ|вывод.*токсин|тонизиру|успокаива|зрени|обезбол|раздражен|полов.*функц|антисклер|бактериальн|глист|лимфо|сосуд|кишечн|потенц|жаропониж|гиперфункц|бактер|витаминного голода|малокров|гемоглобин|слабитель|кровообращ|холестерин|лечебных целях|дизентер|стериль|возбудим|цирроз|злокачеств|простат',re.I)

def botanical_copy(description, number):
    # Everything after the first sales condition is represented in structured
    # unit/price/shipping fields instead of being repeated in descriptions.
    description = re.split(r'\b(?:В\s+пакете|Семян\s+в\s+пакете|Пакет\s+\d|Цена\b|Для заказов|При заказе|Саженцы\s+\d|Посадочные корни\s+\d|Корни за\s+\d|Рассылка\b|Пересылка\b|Время рассылки)',description,maxsplit=1,flags=re.I)[0]
    sentences = re.split(r'(?<=[.!?])\s+(?=[А-ЯЁ(])',description)
    keep=[]
    for sentence in sentences:
        sentence=sentence.strip()
        if not sentence or medical.search(sentence): continue
        if re.search(r'№|[0-9]+\s*р\.|маркетп|OZON|Wildberries|пустая трата|Выбирая продавца|Специальная цена|Описание|Корни для посадки',sentence,re.I):continue
        keep.append(sentence)
    return ' '.join(keep).strip(' ,;')

for item in out[:-1]:
    n=item['catalogNumber']; raw=rows[n-1]
    if n<=169:
        price=re.search(r'(?:Цена пакета\s*|Пакет\s+\d+\s+семян\s*[-–]\s*)(\d+)\s*р',raw,re.I)
        count=re.search(r'(?:В\s+пакете\s+(?:семян\s+|косточки\s+)?|Семян\s+в\s+пакете\s+|Пакет\s+)((?:более\s+)?\d+)\s*(?:крупных\s+)?(семян|шт\.?|бульбочек|косточки|косточек)',raw,re.I)
        assert price and count,(n,raw)
        item['price']=int(price.group(1))
        amount=count.group(1)
        forms = ('бульбочка', 'бульбочки', 'бульбочек') if n == 161 else ('косточка', 'косточки', 'косточек') if n in [54, 92, 151] else ('семя', 'семени', 'семян')
        quantity = int(re.search(r'\d+', amount).group())
        form = 2 if amount.startswith('более ') or 11 <= quantity % 100 <= 14 else 0 if quantity % 10 == 1 else 1 if 2 <= quantity % 10 <= 4 else 2
        item['unit'] = f'Пакет, {amount} {forms[form]}'
    else:
        price,minimum,unit,tiers=planting_prices[n]
        item['price']=price;item['unit']='1 '+unit
        if minimum>1:item['minimumQuantity']=minimum
        if tiers:item['priceTiers']=[{'minQuantity':q,'price':p} for q,p in tiers]
        pricing=[]
        if minimum>1:pricing.append(f'Минимальный заказ — {minimum} шт. ({minimum*price} ₽).')
        pricing.extend(f'От {q} шт. — {p} ₽ за штуку.' for q,p in tiers)
        if pricing:item['priceNote']=' '.join(pricing)
        shipping=re.search(r'(?:Пересылка|Рассылка|Время рассылки)\s+[^.]+\.',raw)
        if shipping:item['shippingNote']=shipping.group().replace('сентябре=октябре','сентябре–октябре').replace('окьябре','октябре').replace('по –октябрь','по октябрь')
    if 'ограничен' in raw.lower():item['note']='Количество ограничено. Уточните наличие при заказе.'
    if 'ядовит' in raw.lower():item['note']='Растение ядовито. Не используйте в пищу.'
    item['description']=botanical_copy(item['description'],n)

# Resolve catalogue cross-references by the plant name as some printed references
# are stale (e.g. the planting entry for Trollius points to 42 instead of 40).
reference_descriptions={
    26:185,60:205,78:174,80:175,101:100,110:109,177:83,178:12,
    186:109,187:112,189:40,190:41,191:116,192:117,193:44,
    194:46,195:123,196:124,197:127,199:133,200:135,203:58,
    204:143,207:148,211:165,
}
for n,source in reference_descriptions.items():
    out[n-1]['description']=out[source-1]['description']
    if not out[n-1].get('latinName') and out[source-1].get('latinName'):
        out[n-1]['latinName']=out[source-1]['latinName']

# Short copy corrections preserve the botanical facts in the supplied document.
description_overrides={
3:'Сиреневые цветки в разветвлённых колосовидных соцветиях источают аромат всё лето. Медонос и сидерат.',
26:'Сибирское хвойное дерево с густой длинной тёмной хвоей и съедобными кедровыми орехами. Посевные орехи для выращивания саженцев.',
56:'Декоративная форма подорожника с крупными красно-пурпурными листьями. Многолетнее растение для садовых композиций.',
74:'Морозостойкий листопадный колючий кустарник. Подходит для живых изгородей и одиночных посадок, хорошо переносит стрижку. Из семян плодоносит с трёх лет.',
100:'Многолетнее травянистое растение. Семена для выращивания зверобоя продырявленного в саду.',
101:'Большой пакет для закладки плантации зверобоя. 20 000 семян соответствуют 100 обычным пакетам. При норме высева 50 семян на 1 м² пакета хватает на 4 сотки.',
110:'Большой пакет для пчеловодов и закладки плантации иван-чая. 20 000 очищенных семян соответствуют 100 обычным пакетам. При норме высева 20 семян на 1 м² пакета хватает на 10 соток.',
113:'Коровяк скипетровидный. Семена для выращивания в саду.',
115:'Многолетнее травянистое растение. Отличный медонос, исключительно зимостоек. Семена копеечника забытого для выращивания в саду.',
120:'Многолетний полутравянистый кустарник высотой 80 см с длинными соцветиями белых цветков. Отличный медонос.',
125:'Многолетнее травянистое растение высотой 1,5 м. Ароматные листья со вкусом, схожим с сельдерейным, используют как пряность в кулинарии. Зимостоек, неприхотлив.',
143:'Многолетнее травянистое растение высотой около 40 см с корневищем. Семена для выращивания родиолы розовой в саду.',
157:'Многолетний тимьян, известный также как богородская трава. Семена для выращивания в саду.',
172:'Белая махровая форма осеннего безвременника «Албопленум». Посадочный материал — клубнелуковицы.',
173:'Многолетний морозостойкий полукустарник высотой до 1,5 м с пряной зеленью. Листья используют для ароматизации чая, уксуса, соусов и выпечки.',
180:'Мощное морозостойкое многолетнее травянистое растение высотой до 3 м. Молодые листья используют в салатах.',
182:'Кустарник высотой 2–2,5 м с тонкими змеевидно изогнутыми ветвями с коричневатым отливом.',
185:'Сибирское хвойное дерево с густой длинной тёмной хвоей и съедобными кедровыми орехами.',
202:'Морозостойкое хвойное дерево с правильной пирамидальной кроной и густой тёмно-зелёной мягкой хвоей. Трёхлетние саженцы.',
204:'Многолетнее травянистое растение высотой около 40 см с корневищем. Посадочный материал — корни родиолы розовой.',
210:'Многолетний зимостойкий лук с ранней весенней зеленью. В пищу используют мясистый черешок и сочные листья. Луковицы зимуют без укрытия; растение теневыносливо. Посадочный материал — луковицы.',
}
for n,description in description_overrides.items():out[n-1]['description']=description
for item in out:
    # Typography only; botanical names retain the spelling in the source file.
    item['name']=item['name'].replace('“','«').replace('”','»')
    if not item['description']:item['description']=f'{item["name"]}. Семена для выращивания в саду.'
    assert item['price'] is not None and item['price']>0,item
    assert item['unit'],item
    assert len(item['name'])<160,item

assert out[39]['name'].startswith('Купальница')
assert out[108]['name'].startswith('Кипрей')
assert out[116]['name'].startswith('Левзея')
assert out[160]['name'].startswith('Чеснок')
assert out[209]['name'].startswith('Черемша')
from pathlib import Path
Path('src/data/catalog-2027.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
import shutil
shutil.copyfile('Каталог 2027.docx','public/catalog-2027.docx')
print('Imported',len(out),'priced products; minimum order rules:',sum('minimumQuantity' in p for p in out))
