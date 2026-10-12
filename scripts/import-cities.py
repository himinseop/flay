"""Rebuild local city profiles from Natural Earth and GeoNames source snapshots."""
import argparse, collections, hashlib, json, re, unicodedata, zipfile, io
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
NE_URL='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places.geojson'
GN_URL='https://download.geonames.org/export/dump/cities500.zip'
def norm(s): return ''.join(c for c in unicodedata.normalize('NFKD',s).lower() if c.isalnum())
def city_name(row):
    korean=next((x for x in row[3].split(',') if re.search('[가-힣]',x) and not re.search('[A-Za-z]',x)),None)
    return korean or row[1]
def run(ne_path,gn_path):
    ne_bytes=Path(ne_path).read_bytes();gn_bytes=Path(gn_path).read_bytes()
    ne=json.loads(ne_bytes)['features'];gn=collections.defaultdict(list)
    for line in zipfile.ZipFile(io.BytesIO(gn_bytes)).read('cities500.txt').decode().splitlines():
        p=line.split('\t')
        if p[7] in {'PPL','PPLC','PPLA','PPLA2','PPLA3','PPLA4','PPLA5','PPLG'}: gn[p[8]].append(p)
    countries=json.loads((ROOT/'dist/countries.json').read_text());overrides=json.loads((ROOT/'scripts/capital-overrides.json').read_text());profiles={}
    for country in countries:
        cid=country['id'];override=overrides.get(cid,{})
        rows=[x['properties'] for x in ne if x['properties'].get('ISO_A2')==country['isoCode']]
        cities=[];by_alias={};by_gn={}
        def add(city):
            keys={norm(v) for v in [city['name'],city['englishName'],*city['aliases']] if v}
            existing=next((by_alias[k] for k in keys if k in by_alias),None) or by_gn.get(city.get('geonamesId'))
            if existing:
                existing['aliases']=sorted(set(existing['aliases']+city['aliases']+[city['englishName'],city['name']]))
                for key in keys: by_alias[key]=existing
                if city.get('geonamesId'): by_gn[city['geonamesId']]=existing
                return existing
            cities.append(city)
            for key in keys: by_alias[key]=city
            if city.get('geonamesId'):by_gn[city['geonamesId']]=city
            return city
        for p in sorted(rows,key=lambda x:-(x.get('POP_MAX') or 0)):
            add({'id':f'{cid}-ne-{p["NE_ID"]}','countryId':cid,'name':p.get('NAME_KO') or p['NAME'],'englishName':p['NAME'],'aliases':list(filter(None,[p.get('NAME'),p.get('NAMEASCII'),p.get('NAMEALT')])),'population':p.get('POP_MAX') or 0,'geonamesId':p.get('GEONAMESID'),'source':'naturalEarth','sourceId':str(p['NE_ID'])})
        for p in sorted(gn[country['isoCode']],key=lambda x:-int(x[14])):
            add({'id':f'{cid}-gn-{p[0]}','countryId':cid,'name':city_name(p),'englishName':p[2] or p[1],'aliases':[p[1],p[2],*p[3].split(',')],'population':int(p[14]),'geonamesId':int(p[0]),'source':'geoNames','sourceId':p[0]})
        wanted=override.get('capital',country['capital'][0]);aliases=[wanted,*override.get('aliases',[])]
        capital=next((by_alias[norm(x)] for x in aliases if norm(x) in by_alias),None)
        if not capital:
            capitals=[p for p in gn[country['isoCode']] if p[7]=='PPLC']
            if len(capitals)==1 and not override.get('capital'):
                capital=by_gn.get(int(capitals[0][0]))
            else:
                if not override.get('source'): raise ValueError(f'Unresolved capital {cid} {wanted}')
                capital=add({'id':cid+'-capital','countryId':cid,'name':override['name'],'englishName':wanted,'aliases':aliases,'population':0,'source':'reviewed','sourceId':override['source']})
        if override.get('name'):capital['name']=override['name']
        capital['englishName']=wanted;capital['aliases']=sorted(set(capital['aliases']+aliases));capital['capital']=True
        excluded=[x['id'] for x in cities if any(norm(a) in {norm(y) for y in [x['name'],x['englishName'],*x['aliases']]} for a in override.get('otherCapitals',[])) and x is not capital]
        # City states have no separate cities; use external city options rather than districts.
        candidates=[] if cid in {'mc','sg','va'} else [x for x in sorted(cities,key=lambda x:-x['population']) if x is not capital and x['id'] not in excluded]
        selected=[capital,*candidates[:7]]
        # Keep other genuine capitals available to the atlas, but never as wrong answers.
        selected += [x for x in cities if x['id'] in excluded and x not in selected]
        for x in selected:
            x['aliases']=[a for a in x['aliases'] if a][:20]
        profiles[cid]={'capitalId':capital['id'],'questionLabel':override.get('questionLabel','수도'),'note':override.get('note',''),'capitalSource':override.get('source','https://github.com/mledoze/countries'),'excludedIds':excluded,'cities':selected}
    payload={'collectedAt':'2026-10-12','countryCount':len(profiles),'cityCount':sum(len(x['cities']) for x in profiles.values()),'sources':[{'id':'naturalEarth','url':'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/','downloadUrl':NE_URL,'license':'Public domain','sha256':hashlib.sha256(ne_bytes).hexdigest()},{'id':'geoNames','url':'https://download.geonames.org/export/dump/','downloadUrl':GN_URL,'license':'CC BY 4.0','sha256':hashlib.sha256(gn_bytes).hexdigest()}],'countries':profiles}
    (ROOT/'dist/capital-cities.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
    print('Collected',payload['countryCount'],'countries,',payload['cityCount'],'cities')
    print('Foreign-city fallback:',[(cid,len([c for c in p['cities'] if c['id'] not in p['excludedIds']])) for cid,p in profiles.items() if len([c for c in p['cities'] if c['id'] not in p['excludedIds']])<4])
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--naturalearth',required=True);parser.add_argument('--geonames',required=True);args=parser.parse_args();run(args.naturalearth,args.geonames)
