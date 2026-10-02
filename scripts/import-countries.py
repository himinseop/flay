"""Collect a reproducible country dataset and locally cached flag images."""
import concurrent.futures, datetime, json, pathlib, time, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE='https://raw.githubusercontent.com/mledoze/countries/master/countries.json'
FAMILIAR='KR JP CN US GB FR DE IT ES RU BR AR CA AU NZ IN VN TH PH ID MX EG CH GR TR UA ZA SG KP NL'.split()
OVERRIDES={'KR':'대한민국','KP':'북한','TR':'튀르키예','SZ':'에스와티니','CZ':'체코','VA':'바티칸','PS':'팔레스타인','CD':'콩고민주공화국','CG':'콩고공화국'}
ALIASES={'KR':['한국','남한'],'KP':['조선민주주의인민공화국','북조선'],'TR':['터키'],'SZ':['스와질란드'],'VA':['바티칸시국'],'US':['아메리카합중국','미합중국'],'GB':['그레이트브리튼','영국'],'TL':['동티모르','티모르레스테'],'CV':['카보베르데','케이프베르데'],'MM':['미얀마','버마'],'CZ':['체코','체코공화국']}
REGIONS={'Asia':'아시아','Europe':'유럽','Africa':'아프리카','Oceania':'오세아니아'}
def fetch(url):
 for attempt in range(3):
  try:
   request=urllib.request.Request(url,headers={'User-Agent':'FlagPlay/1.0 (educational country quiz)'})
   return urllib.request.urlopen(request,timeout=30).read()
  except Exception:
   if attempt==2:raise
   time.sleep(attempt+1)
def image(country):
 path=ROOT/'dist'/country['image'];path.parent.mkdir(parents=True,exist_ok=True)
 if not path.exists():
  content=fetch(country['imageSource']);assert content.startswith(b'\x89PNG\r\n\x1a\n'),country['id'];path.write_bytes(content)
 return path.stat().st_size
if __name__=='__main__':
 raw=json.loads(fetch(SOURCE));selected=[p for p in raw if p.get('unMember') or p['cca2'] in ['VA','PS']]
 assert len(selected)==195 and sum(p['unMember'] and p['cca2'] not in ['VA','PS'] for p in selected)==193
 countries=[]
 for p in selected:
  code=p['cca2'];korean=p['translations']['kor'];name=OVERRIDES.get(code,korean['common'])
  region=REGIONS.get(p['region']) or ('남아메리카' if p['subregion']=='South America' else '북아메리카')
  countries.append({'id':code.lower(),'name':name,'englishName':p['name']['common'],'officialName':korean['official'],
   'aliases':list(dict.fromkeys([name,korean['common'],korean['official'],p['name']['common'],p['name']['official'],*ALIASES.get(code,[])])),
   'continent':region,'capital':p['capital'],'languages':list(p['languages'].values()),'isoCode':code,
   'familiar':code in FAMILIAR,'image':f'assets/flags/{code.lower()}.png','imageSource':f'https://flagcdn.com/w640/{code.lower()}.png'})
 countries.sort(key=lambda p:p['id']);assert len({p['id'] for p in countries})==195 and sum(p['familiar'] for p in countries)==30
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  sizes=list(pool.map(image,countries))
 (ROOT/'dist/countries.json').write_text(json.dumps(countries,ensure_ascii=False,indent=2)+'\n')
 (ROOT/'dist/countries-manifest.json').write_text(json.dumps({'collectedAt':datetime.date.today().isoformat(),'countryCount':195,'unMemberCount':193,'observerCount':2,'familiarCount':30,'imageBytes':sum(sizes),'sources':{'countries':SOURCE,'flags':'https://flagcdn.com/','coverage':'https://www.un.org/en/about-us/member-states'},'dataLicense':'ODbL-1.0'},ensure_ascii=False,indent=2)+'\n')
 (ROOT/'dist/COUNTRIES-LICENSE.txt').write_bytes(fetch('https://raw.githubusercontent.com/mledoze/countries/master/LICENSE'))
 print(f'Collected {len(countries)} countries, {sum(sizes):,} image bytes, all flags stored locally.',flush=True)
