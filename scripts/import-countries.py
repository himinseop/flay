"""Collect a reproducible country dataset and locally cached flag images."""
import concurrent.futures, datetime, html, json, pathlib, time, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE='https://raw.githubusercontent.com/mledoze/countries/master/countries.json'
MAP_SOURCE='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson'
POPULATION_SOURCE='https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?date=2020:2026&format=json&per_page=20000'
FAMILIAR='KR JP CN US GB FR DE IT ES RU BR AR CA AU NZ IN VN TH PH ID MX EG CH GR TR UA ZA SG KP NL'.split()
OVERRIDES={'KR':'대한민국','KP':'북한','TR':'튀르키예','SZ':'에스와티니','CZ':'체코','VA':'바티칸','PS':'팔레스타인','CD':'콩고민주공화국','CG':'콩고공화국','DM':'도미니카연방'}
ALIASES={'KR':['한국','남한'],'KP':['조선민주주의인민공화국','북조선'],'TR':['터키'],'SZ':['스와질란드'],'VA':['바티칸시국'],'US':['아메리카합중국','미합중국'],'GB':['그레이트브리튼','영국'],'TL':['동티모르','티모르레스테'],'CV':['카보베르데','케이프베르데'],'MM':['미얀마','버마'],'CZ':['체코','체코공화국'],'DM':['도미니카']}
REGIONS={'Asia':'아시아','Europe':'유럽','Africa':'아프리카','Oceania':'오세아니아'}
SUBREGIONS=dict(zip(['Eastern Asia','South-Eastern Asia','Southern Asia','Central Asia','Western Asia','Northern Europe','Western Europe','Eastern Europe','Southern Europe','Northern Africa','Western Africa','Middle Africa','Eastern Africa','Southern Africa','North America','Central America','Caribbean','South America','Australia and New Zealand','Melanesia','Micronesia','Polynesia'],['동아시아','동남아시아','남아시아','중앙아시아','서아시아','북유럽','서유럽','동유럽','남유럽','북아프리카','서아프리카','중앙아프리카','동아프리카','남아프리카','북아메리카','중앙아메리카','카리브해 지역','남아메리카','오스트레일리아·뉴질랜드','멜라네시아','미크로네시아','폴리네시아']))
SUBREGIONS.update({'Central Europe':'중앙유럽','Southeast Europe':'남동유럽'})
def map_path(geometry):
 polygons=geometry['coordinates'] if geometry['type']=='MultiPolygon' else [geometry['coordinates']]
 return ''.join('M'+'L'.join(f'{(lon+180)*2.5:.2f},{(90-lat)*2.5:.2f}' for lon,lat in ring)+'Z' for polygon in polygons for ring in polygon)
def world_map(features):
 paths={f['properties']['ADM0_A3']:map_path(f['geometry']) for f in features}
 svg=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 450"><rect width="900" height="450" fill="#edf5fc"/>']
 for x in range(75,900,75):svg.append(f'<path d="M{x},0V450" stroke="#dce9f4" stroke-width=".6"/>')
 for y in range(75,450,75):svg.append(f'<path d="M0,{y}H900" stroke="#dce9f4" stroke-width=".6"/>')
 for d in paths.values():svg.append(f'<path d="{d}" fill="#d5e2dc" stroke="#fff" stroke-width=".65"/>')
 svg.append('<path d="M0,225H900" stroke="#adc5d8" stroke-width="1" stroke-dasharray="4 5"/>')
 for x,y,label in [(85,235,'태평양'),(855,235,'태평양'),(365,195,'대서양'),(645,280,'인도양')]:
  svg.append(f'<text x="{x}" y="{y}" fill="#708ca3" font-size="14" font-family="system-ui,sans-serif" text-anchor="middle">{html.escape(label)}</text>')
 svg.append('</svg>')
 (ROOT/'dist/assets/world-map.svg').write_text(''.join(svg)+'\n')
 for feature in features:
  code=feature['properties']['ISO_A3_EH']
  if code!='-99':paths[code]=map_path(feature['geometry'])
 return paths
def population_records(response):
 metadata,rows=response
 assert metadata['pages']==1,'Population response is incomplete'
 populations={}
 for row in rows:
  if row['value'] is None:continue
  code=row['countryiso3code'];year=int(row['date'])
  if code not in populations or year>populations[code]['year']:
   populations[code]={'value':row['value'],'year':year}
 return populations
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
 paths=world_map(json.loads(fetch(MAP_SOURCE))['features'])
 population_response=json.loads(fetch(POPULATION_SOURCE));populations=population_records(population_response)
 assert len(selected)==195 and sum(p['unMember'] and p['cca2'] not in ['VA','PS'] for p in selected)==193
 countries=[]
 for p in selected:
  code=p['cca2'];korean=p['translations']['kor'];name=OVERRIDES.get(code,korean['common'])
  official='도미니카연방' if code=='DM' else korean['official']
  korean_aliases=[] if code=='DM' else [korean['common'],korean['official']]
  region=REGIONS.get(p['region']) or ('남아메리카' if p['subregion']=='South America' else '북아메리카')
  countries.append({'id':code.lower(),'name':name,'englishName':p['name']['common'],'officialName':official,
   'aliases':list(dict.fromkeys([name,official,*korean_aliases,p['name']['common'],p['name']['official'],*ALIASES.get(code,[])])),
   'continent':region,'subregion':SUBREGIONS.get(p['subregion'],p['subregion']),'capital':p['capital'],'languages':list(p['languages'].values()),'languageCodes':list(p['languages']),'isoCode':code,'iso3':p['cca3'],
   'nativeNames':list(dict.fromkeys(n['common'] for n in p['name']['native'].values())),
   'area':p['area'],'coordinates':p['latlng'],'landlocked':p['landlocked'],'borders':p['borders'],
   'currencies':[{'code':key,**value} for key,value in p['currencies'].items()],
   'callingCodes':([p['idd']['root']] if p['idd']['root']=='+1' and len(p['idd']['suffixes'])>1 else [p['idd']['root']+suffix for suffix in p['idd']['suffixes']]),'domains':p['tld'],'population':populations.get(p['cca3']),
   'mapPath':paths.get(p['cca3'],''),
   'familiar':code in FAMILIAR,'image':f'assets/flags/{code.lower()}.png','imageSource':f'https://flagcdn.com/w640/{code.lower()}.png'})
 countries.sort(key=lambda p:p['id']);assert len({p['id'] for p in countries})==195 and sum(p['familiar'] for p in countries)==30
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  sizes=list(pool.map(image,countries))
 (ROOT/'dist/countries.json').write_text(json.dumps(countries,ensure_ascii=False,indent=2)+'\n')
 (ROOT/'dist/countries-manifest.json').write_text(json.dumps({'collectedAt':datetime.date.today().isoformat(),'countryCount':195,'unMemberCount':193,'observerCount':2,'familiarCount':30,'imageBytes':sum(sizes),'populationCount':sum(c['population'] is not None for c in countries),'populationUpdatedAt':population_response[0]['lastupdated'],'sources':{'countries':SOURCE,'flags':'https://flagcdn.com/','coverage':'https://www.un.org/en/about-us/member-states','population':POPULATION_SOURCE,'map':MAP_SOURCE},'dataLicense':'ODbL-1.0','populationLicense':'CC BY-4.0','mapLicense':'Public domain'},ensure_ascii=False,indent=2)+'\n')
 (ROOT/'dist/COUNTRIES-LICENSE.txt').write_bytes(fetch('https://raw.githubusercontent.com/mledoze/countries/master/LICENSE'))
 print(f'Collected {len(countries)} countries, {sum(sizes):,} image bytes, all flags stored locally.',flush=True)
