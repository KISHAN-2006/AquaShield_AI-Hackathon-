import {useEffect,useRef,useState} from 'react';
import L from 'leaflet';import 'leaflet/dist/leaflet.css';
import {LineChart,Line,XAxis,YAxis,Tooltip,BarChart,Bar,Cell,ResponsiveContainer} from 'recharts';
const api=(p,o)=>fetch('/api'+p,{headers:{'Content-Type':'application/json'},...o}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error||'Request failed');return j});
const searchCities=async query=>{
 try{return await api(`/cities?q=${encodeURIComponent(query)}`)}catch{
  const url=new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search=new URLSearchParams({name:query,count:'10',language:'en',format:'json',countryCode:'IN'}).toString();
  const response=await fetch(url),data=await response.json();
  if(!response.ok)throw new Error('City search is temporarily unavailable. Please try again.');
  return(data.results||[]).filter(x=>x.country_code==='IN').map(x=>({id:x.id,name:x.name,admin1:x.admin1||'',latitude:x.latitude,longitude:x.longitude,country:x.country}));
 }
};
  const loadCityWeather=async city=>{
   try{return await api(`/weather?lat=${city.latitude}&lng=${city.longitude}`)}catch{
    const url=new URL('https://api.open-meteo.com/v1/forecast');
    url.search=new URLSearchParams({latitude:String(city.latitude),longitude:String(city.longitude),current:'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,weather_code,wind_speed_10m',hourly:'temperature_2m,precipitation_probability,precipitation,uv_index',daily:'temperature_2m_max,precipitation_sum,precipitation_probability_max,uv_index_max',forecast_days:'3',timezone:'auto'}).toString();
    const response=await fetch(url);
    if(!response.ok)throw new Error('Live forecast is temporarily unavailable. Please try again.');
    return response.json();
   }
  };
const COL={Low:'#2e9e6b',Moderate:'#d9a21b',High:'#e8742a',Severe:'#d6342c'};
const NAMES={heat:'HeatGuard',flood:'FloodGuard',drought:'DroughtGuard',leak:'LeakGuard'};
const Badge=({l})=><span className="badge" style={{background:COL[l]||'#667'}}>{l}</span>;
const distanceKm=(a,b)=>{const rad=n=>n*Math.PI/180,lat1=a.latitude??a.lat,lng1=a.longitude??a.lng,lat2=b.latitude??b.lat,lng2=b.longitude??b.lng,h=Math.sin(rad(lat2-lat1)/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(rad(lng2-lng1)/2)**2;return 12742*Math.asin(Math.sqrt(h))};
function CityPicker({city,onSelect,id='shared-city'}){
 const [query,setQuery]=useState(''),[cities,setCities]=useState([]),[searching,setSearching]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  if(query.trim().length<2){setCities([]);setSearching(false);return}
  let dead=false;setSearching(true);const timer=setTimeout(()=>searchCities(query.trim()).then(r=>{if(!dead){setCities(r);setSearching(false)}}).catch(e=>{if(!dead){setError(e.message);setSearching(false)}}),300);
  return()=>{dead=true;clearTimeout(timer)};
 },[query]);
 const choose=c=>{onSelect(c);setQuery('');setCities([]);setError('')};
 return <div className="shared-city-picker"><label htmlFor={id}>City context</label><div className="city-search"><input id={id} autoComplete="off" placeholder="Search any Indian city" value={city&&query===''?`${city.name}${city.admin1?`, ${city.admin1}`:''}`:query} onChange={e=>{setQuery(e.target.value);setError('')}}/>
  {query.trim().length>=2&&<div className="city-results" role="listbox">{cities.map(c=><button type="button" role="option" key={c.id} onClick={()=>choose(c)}>{c.name}{c.admin1?`, ${c.admin1}`:''}<small>{c.country}</small></button>)}{searching&&<div className="city-empty">Searching Indian cities…</div>}{!searching&&cities.length===0&&!error&&<div className="city-empty">No matching Indian cities found</div>}</div>}
 </div>{error&&<small className="city-picker-error">{error}</small>}</div>
}
  const weatherText=code=>code===0?'Clear sky':[1,2,3].includes(code)?'Partly cloudy':[45,48].includes(code)?'Foggy':[51,53,55,56,57].includes(code)?'Drizzle':[61,63,65,66,67].includes(code)?'Rain':[71,73,75,77,85,86].includes(code)?'Snow':[80,81,82].includes(code)?'Rain showers':[95,96,99].includes(code)?'Thunderstorms':'Current conditions';
  const riskLevel=(value,high,veryHigh)=>value>=veryHigh?'High':value>=high?'Watch':'Low';
  function Risk({c,title}){return <section className="card"><h3>{title}<Badge l={c.level}/></h3><b className="n">{c.score??'—'}</b><ul>{c.why.map(w=><li key={w}>{w}</li>)}</ul>{c.missing.length>0&&<p className="warn">Missing: {c.missing.join(', ')}</p>}{c.action&&c.score>=25&&<p><b>Next step:</b> {c.action}</p>}</section>}
  function SampleDashboard({city,sc}){
   const [a,setA]=useState(),[err,setErr]=useState(),[msg,setMsg]=useState(),[ack,setAck]=useState({});
  useEffect(()=>{if(!city){setA(undefined);return}setA();setErr();const samples=[{id:'jaipur',lat:26.9124,lng:75.7873},{id:'delhi',lat:28.6139,lng:77.209},{id:'mumbai',lat:19.076,lng:72.8777}],known=samples.find(l=>distanceKm(city,{lat:l.lat,lng:l.lng})<2)?.id,params=new URLSearchParams({scenario:sc});if(!known){params.set('lat',city.latitude);params.set('lng',city.longitude);params.set('name',city.name)}api(`/assess/${known||'city'}?${params}`).then(setA).catch(e=>setErr(e.message))},[city,sc]);
   if(!city)return <section className="city-empty-state"><span className="section-kicker">CITY-BASED SAMPLE RISKS</span><h3>Choose a city to view the scenario.</h3><p>Select a city above. Risk scores remain simulated examples, not live city measurements.</p></section>;
   if(err)return <p className="err">{err}. Check that the API is running.</p>;if(!a)return <p>Loading sample readings…</p>;
   const C=a.components,bars=Object.keys(C).map(k=>({k:NAMES[k],score:C[k].score??0,level:C[k].level}));
   const flag=async()=>{try{const r=await api('/incidents',{method:'POST',body:JSON.stringify({type:'Water leakage',description:'Suspected leak: '+C.leak.why.join('; '),lat:a.location.lat,lng:a.location.lng,leakLpm:C.leak.leakLpm,source:'LeakGuard'})});setMsg(`Incident #${r.incident.id} ${r.duplicate?'already open, report merged':'created'}. Open the Action center.`)}catch(e){setMsg(e.message)}};
   const alerts=Object.keys(C).filter(k=>C[k].score>=50);
   return <div className="sample-view"><span className="section-kicker">SIMULATED SCENARIO · NOT A LIVE ASSESSMENT</span><h2>{a.location.name}: {a.scenario}</h2><p className="demo">Sample readings are simulated. Rule-based scores are not validated forecasts.</p>
    <section className="card"><h3>AquaScore <Badge l={a.aquaScore==null?'Insufficient data':a.aquaScore>=75?'Severe':a.aquaScore>=50?'High':a.aquaScore>=25?'Moderate':'Low'}/></h3><b className="n">{a.aquaScore??'—'}</b>
     <div style={{height:150}}><ResponsiveContainer><BarChart data={bars} layout="vertical"><XAxis type="number" domain={[0,100]}/><YAxis type="category" dataKey="k" width={90}/><Tooltip/><Bar dataKey="score">{bars.map(b=><Cell key={b.k} fill={COL[b.level]||'#999'}/>)}</Bar></BarChart></ResponsiveContainer></div><p><small>{a.method} {a.limitations}</small></p></section>
    {a.severe.length>0&&<p className="err"><b>Severe hazard: {a.severe.map(k=>NAMES[k]).join(', ')}.</b> Shown even if the combined score looks moderate.</p>}
    <div className="grid">{Object.keys(C).map(k=><Risk key={k} c={C[k]} title={NAMES[k]}/>)}</div>
    {C.leak.suspected&&<section className="card"><h3>Possible leak flagged</h3><p>{C.leak.action}</p><button className="p" onClick={flag}>Create leak incident</button>{msg&&<p>{msg}</p>}</section>}
    <section className="card"><h3>Alerts (prototype, not official warnings)</h3>{alerts.length===0&&<p>No alerts at this level.</p>}{alerts.map(k=><div className="row" key={k}><Badge l={C[k].level}/> {NAMES[k]}: {C[k].why[0]} <button onClick={()=>setAck(p=>({...p,[k]:!p[k]}))}>{ack[k]?'Acknowledged':'Acknowledge'}</button></div>)}</section>
    <section className="card"><h3>Temperature and flow trend (simulated)</h3><div style={{height:220}}><ResponsiveContainer><LineChart data={a.trend}><XAxis dataKey="h" interval={3}/><YAxis/><Tooltip/><Line dataKey="temp" name="Temperature °C" stroke="#dd7445" dot={false}/><Line dataKey="flow" name="Flow L/min" stroke="#428b91" dot={false}/></LineChart></ResponsiveContainer></div></section></div>}
  function Dashboard({city,setCity,onAsk}){
  const [query,setQuery]=useState(''),[cities,setCities]=useState([]),[searching,setSearching]=useState(false),[weather,setWeather]=useState(),[searchError,setSearchError]=useState(''),[forecastError,setForecastError]=useState('');
   useEffect(()=>{
    if(query.trim().length<2){setCities([]);setSearching(false);return}
    let dead=false;setSearching(true);const timer=setTimeout(()=>searchCities(query.trim()).then(r=>{if(!dead){setCities(r);setSearching(false)}}).catch(e=>{if(!dead){setSearchError(e.message);setSearching(false)}}),300);
    return()=>{dead=true;clearTimeout(timer)};
   },[query]);
   useEffect(()=>{
    if(!city){setWeather(undefined);setForecastError('');return}
    let dead=false;setWeather(undefined);setForecastError('');
    loadCityWeather(city).then(r=>{if(!dead)setWeather(r)}).catch(e=>{if(!dead)setForecastError(e.message)});
    return()=>{dead=true};
   },[city]);
  const chooseCity=c=>{setCity(c);setQuery('');setCities([]);setSearchError('');setForecastError('')};
   const c=weather?.current,d=weather?.daily,h=weather?.hourly;
   const heat=riskLevel(c?.apparent_temperature??0,32,38),rainChance=d?.precipitation_probability_max?.[0]??0,rainAmount=d?.precipitation_sum?.[0]??0;
   const rain=rainChance>=70||rainAmount>=50?'High':rainChance>=40||rainAmount>=10?'Watch':'Low';
  const chart=h?.time?.slice(0,24).map((time,i)=>({time:time.slice(11,16),temp:h.temperature_2m[i],rain:h.precipitation_probability[i]}))||[];
  const uv=d?.uv_index_max?.[0]??null,uvLabel=uv==null?'Not available':uv<3?'Low':uv<6?'Moderate':uv<8?'High':uv<11?'Very high':'Extreme';
   const forecast=d?.time?.map((date,i)=>({date,max:d.temperature_2m_max[i],rain:d.precipitation_sum[i],chance:d.precipitation_probability_max[i]}))||[];
   return <div className="dashboard-view">
    <header className="dash-heading"><div><span className="section-kicker">LIVE INDIA FORECAST</span><h2>{city?.name||'Choose a city'}</h2><p>{city?(city.admin1?`${city.admin1} · `:'')+(weather?`${weatherText(c.weather_code)} · Updated ${new Date(c.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`:'Fetching local forecast…'):'Search across India to see local conditions and guidance.'}</p></div>
    <div className="dash-city-picker"><label htmlFor="dashboard-city">Location</label><div className="city-search"><input id="dashboard-city" autoComplete="off" placeholder="Search any Indian city" value={city&&query===''?`${city.name}${city.admin1?`, ${city.admin1}`:''}`:query} onChange={e=>{setQuery(e.target.value);setSearchError('')}}/>
      {query.trim().length>=2&&<div className="city-results" role="listbox">{cities.map(x=><button type="button" role="option" key={x.id} onClick={()=>chooseCity(x)}>{x.name}{x.admin1?`, ${x.admin1}`:''}<small>{x.country}</small></button>)}{searching&&<div className="city-empty">Searching Indian cities…</div>}{!searching&&cities.length===0&&!searchError&&<div className="city-empty">No matching Indian cities found</div>}</div>}
     </div></div>
    </header>
    {searchError&&<p className="dash-inline-error">{searchError}</p>}
    {!city?<section className="city-empty-state"><span className="section-kicker">YOUR LOCAL AQUASHIELD</span><h3>Start with a place.</h3><p>Choose a city to see its heat conditions, rain outlook, and practical water guidance.</p></section>:forecastError&&!weather?<section className="dash-error"><h2>Forecast unavailable</h2><p>{forecastError}</p><button className="p" onClick={()=>{setForecastError('');loadCityWeather(city).then(setWeather).catch(e=>setForecastError(e.message))}}>Try again</button></section>:!weather?<section className="dash-loading"><span className="loading-mark"/><p>Loading live conditions for {city.name}…</p></section>:<>
     <section className="weather-overview">
      <div className="weather-now"><span className="metric-label">RIGHT NOW</span><div className="temperature">{Math.round(c.temperature_2m)}<span>°</span></div><p>{weatherText(c.weather_code)}</p><small>Feels like {Math.round(c.apparent_temperature)}°C</small><small>Humidity {c.relative_humidity_2m}% · Wind {Math.round(c.wind_speed_10m)} km/h</small></div>
      <div className="overview-divider"/>
      <div className="overview-stat"><span>Today's high</span><strong>{Math.round(d.temperature_2m_max[0])}°</strong><small>Next 3 days: up to {Math.round(Math.max(...d.temperature_2m_max))}°</small></div>
      <div className="overview-stat"><span>Rain chance</span><strong>{d.precipitation_probability_max[0]}<i>%</i></strong><small>{d.precipitation_sum[0]} mm expected today</small></div>
      <div className="overview-stat"><span>UV index · {uvLabel}</span><strong>{uv==null?'—':Math.round(uv)}</strong><small>{uv>=6?'Seek shade around midday':'Peak UV forecast today'}</small></div>
     </section>
     <div className="safety-strip"><span className={`safety-dot ${heat.toLowerCase()}`}/><b>Heat {heat}</b><span className="safety-separator"/><span className={`safety-dot ${rain.toLowerCase()}`}/><b>Rain {rain}</b><span className="safety-caption">Guidance indicators, not official warnings</span></div>
     <div className="dash-grid">
      <section className="dash-panel forecast-panel"><div className="panel-title"><div><span className="section-kicker">NEXT 24 HOURS</span><h3>Temperature & rain chance</h3></div><div className="chart-legend"><span><i className="legend-temp"/> °C</span><span><i className="legend-rain"/> Rain</span></div></div>
       <div className="weather-chart"><ResponsiveContainer><LineChart data={chart} margin={{top:8,right:10,left:-20,bottom:0}}><XAxis dataKey="time" interval={3} tickLine={false} axisLine={false}/><YAxis yAxisId="temp" domain={['dataMin - 2','dataMax + 2']} tickLine={false} axisLine={false}/><YAxis yAxisId="rain" orientation="right" domain={[0,100]} hide/><Tooltip/><Line yAxisId="temp" dataKey="temp" name="Temperature °C" stroke="#dd7445" strokeWidth={3} dot={false} activeDot={{r:5}}/><Line yAxisId="rain" dataKey="rain" name="Rain chance %" stroke="#277f86" strokeWidth={2} dot={false} strokeDasharray="5 5"/></LineChart></ResponsiveContainer></div>
      </section>
      <section className="dash-panel outlook-panel"><div className="panel-title"><div><span className="section-kicker">3-DAY OUTLOOK</span><h3>Coming up</h3></div></div><div className="outlook-list">{forecast.map(f=><div className="outlook-day" key={f.date}><span>{new Date(`${f.date}T12:00:00`).toLocaleDateString(undefined,{weekday:'short'})}</span><b>{Math.round(f.max)}°</b><span>{f.rain} mm rain</span><small>{f.chance}% chance</small></div>)}</div></section>
     </div>
     <section className="guidance-section"><div className="guidance-heading"><div><span className="section-kicker">PRACTICAL GUIDANCE</span><h3>What to keep in mind</h3></div><button className="p" onClick={()=>onAsk(city)}>Ask the assistant</button></div>
      <div className="guidance-grid"><article className="guidance-item heat-guidance"><span className="guidance-index">01 / HEAT + UV</span><h4>{c.apparent_temperature>=35||uv>=8?'Take extra care outdoors':'Plan for the warmest part of the day'}</h4><p>{c.apparent_temperature>=35?'Limit strenuous outdoor activity during peak afternoon heat. Use shade or a cool indoor place, drink water regularly, and check on vulnerable people.':'Take shade and water breaks outdoors, and avoid prolonged exertion when temperatures peak.'}{uv>=6?' UV is also high: seek shade and wear sun-protective clothing around midday.':''}</p><small>Feels like {c.apparent_temperature}°C · UV {uv==null?'not available':`${uv} (${uvLabel})`}</small></article>
       <article className="guidance-item rain-guidance"><span className="guidance-index">02 / RAIN</span><h4>{d.precipitation_probability_max[0]>=70?'Rain may affect travel':'Check local rain updates'}</h4><p>{d.precipitation_probability_max[0]>=70?'Avoid waterlogged roads and underpasses. Never walk or drive through floodwater; follow local authority instructions.':'Forecast rain is limited today. Keep local alerts in view, as conditions can change.'}</p><small>{d.precipitation_sum[0]} mm forecast · {d.precipitation_probability_max[0]}% chance</small></article>
      <article className="guidance-item water-guidance"><span className="guidance-index">03 / WATER</span><h4>{rainChance>=40||rainAmount>=10?'Prepare for rainwater safely':'Weather cannot measure your water supply'}</h4><p>{rainChance>=40||rainAmount>=10?'Clear roof drains and keep storage tanks covered before rain. Do not drink untreated rainwater; weather data cannot verify its safety.':'Use treated drinking water and check your local utility for supply or quality notices. Save water by fixing leaks and avoiding unnecessary outdoor washing.'}</p><small>{rainChance>=40||rainAmount>=10?`${rainAmount} mm forecast · ${rainChance}% chance`:'No local water-quality or supply sensor connected'}</small></article>
      </div>
     </section>
     <p className="forecast-note">Source: Open-Meteo forecast · Updated {c.time} · Estimates are not sensor readings or official alerts.</p>
    </>}
   </div>}
function Assistant({initialCity}){
 const [query,setQuery]=useState(''),[cities,setCities]=useState([]),[city,setCity]=useState(initialCity),[prompt,setPrompt]=useState(''),[messages,setMessages]=useState([]),[busy,setBusy]=useState(false),[searching,setSearching]=useState(false),[err,setErr]=useState('');
 useEffect(()=>{
  if(query.trim().length<2){setCities([]);setSearching(false);return}
  let dead=false;setSearching(true);const timer=setTimeout(()=>searchCities(query.trim()).then(r=>{if(!dead){setCities(r);setSearching(false)}}).catch(e=>{if(!dead){setErr(e.message);setSearching(false)}}),300);
  return()=>{dead=true;clearTimeout(timer)};
 },[query]);
 const ask=async e=>{
  e.preventDefault();if(!city||!prompt.trim()||busy)return;
  const question=prompt.trim();setPrompt('');setErr('');setMessages(m=>[...m,{role:'user',text:question}]);setBusy(true);
  try{const result=await api('/assistant',{method:'POST',body:JSON.stringify({latitude:city.latitude,longitude:city.longitude,prompt:question})});setMessages(m=>[...m,{role:'assistant',text:result.message,source:result.source,updatedAt:result.updatedAt}])}
  catch(e){setErr(e.message);setMessages(m=>m.slice(0,-1))}finally{setBusy(false)}
 };
 return <section className="assistant">
  <div className="assistant-head"><p className="eyebrow">AQUASHIELD FIELD ASSISTANT</p><h2>Local conditions, practical next steps.</h2><p>Ask about heat, heavy rain, drinking water, or conserving water. Guidance uses the latest available forecast for the selected city.</p></div>
  <div className="assistant-controls"><label htmlFor="city-search">Indian city</label><div className="city-search"><input id="city-search" autoComplete="off" placeholder="Search any Indian city" value={city?`${city.name}${city.admin1?`, ${city.admin1}`:''}`:query} onChange={e=>{setCity(undefined);setQuery(e.target.value);setErr('')}}/>
   {!city&&cities.length>0&&<div className="city-results" role="listbox">{cities.map(c=><button type="button" role="option" key={c.id} onClick={()=>{setCity(c);setQuery('');setCities([])}}>{c.name}{c.admin1?`, ${c.admin1}`:''}<small>{c.country}</small></button>)}</div>}
  {!city&&query.trim().length>=2&&cities.length===0&&!err&&<div className="city-empty">{searching?'Searching Indian cities…':'No matching Indian cities found'}</div>}
  </div>
  {city&&<div className="city-selected"><span>{city.name}{city.admin1?`, ${city.admin1}`:''}</span><button type="button" onClick={()=>{setCity(undefined);setQuery('');setMessages([])}} aria-label="Change city">Change</button></div>}
  </div>
  <div className="assistant-chat" aria-live="polite">
   {messages.length===0?<div className="assistant-empty"><span className="assistant-mark">A</span><h3>What’s happening where you are?</h3><p>Select a city, then ask for advice based on its current forecast.</p><div className="prompt-examples">“How should I stay safe in today’s heat?”<br/>“Is heavy rain expected?”<br/>“How can I use water carefully?”</div></div>:messages.map((m,i)=><article className={`chat-message ${m.role}`} key={`${i}-${m.role}`}><b>{m.role==='user'?'You':'AquaShield'}</b><p>{m.text}</p>{m.source&&<small>{m.source} · Updated {m.updatedAt}</small>}</article>)}
   {busy&&<p className="assistant-loading">Checking the latest forecast…</p>}
  </div>
  {err&&<p className="err assistant-error">{err}</p>}
  <form className="assistant-compose" onSubmit={ask}><textarea aria-label="Ask the assistant" placeholder={city?'Ask about heat, rain, or water…':'Choose a city to start'} value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={500} rows={2} disabled={!city||busy}/><button className="p" disabled={!city||!prompt.trim()||busy}>{busy?'Checking…':'Ask'}</button></form>
  <p className="assistant-disclaimer">Forecast-based guidance only. Not an official warning, medical advice, water-quality test, or confirmation of local water supply. Follow local authorities during emergencies.</p>
 </section>}
function MapView({city}){
 const ref=useRef(),[rows,setRows]=useState([]),[err,setErr]=useState();
 useEffect(()=>{if(!city)return;let m,dead=false;(async()=>{try{const incidents=await api('/incidents'),nearby=incidents.filter(i=>distanceKm(i,city)<=50);if(dead)return;setRows(nearby);
  m=L.map(ref.current).setView([city.latitude,city.longitude],10);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(m);
  L.circleMarker([city.latitude,city.longitude],{radius:10,color:'#173e34',fillColor:'#d7e88d',fillOpacity:.9}).bindPopup(`${city.name}: selected city`).addTo(m);
  nearby.forEach(i=>L.circleMarker([i.lat,i.lng],{radius:7,color:'#d25c43',fillOpacity:.8}).bindPopup(`#${i.id} ${i.type}: ${i.status}`).addTo(m))}catch(e){setErr(e.message)}})();return()=>{dead=true;m&&m.remove()}},[city]);
 if(!city)return <section className="city-empty-state"><span className="section-kicker">CITY INCIDENT MAP</span><h3>Choose a city to see nearby reports.</h3><p>The map shows the selected city and reported incidents within 50 km.</p></section>;
 return <><h2>Risk map · {city.name}</h2><p className="demo">Selected city and community incidents within 50 km. Weather risks are shown on the Dashboard; map pins are reports, not official alerts.</p>{err&&<p className="err">{err}</p>}<div id="map" ref={ref} role="img" aria-label={`Map centered on ${city.name} and nearby reports`}/>
  <section className="card"><h3>Nearby reports · {rows.length}</h3>{rows.length===0?<p>No reported incidents within 50 km of {city.name}.</p>:rows.map(i=><p key={i.id}>#{i.id} · {i.type} · {i.status} · {i.reports} report(s)</p>)}</section></>}
function Actions({city}){
 const [list,setList]=useState([]),[imp,setImp]=useState(),[f,setF]=useState({}),[err,setErr]=useState(),[showAll,setShowAll]=useState(false);
 const load=()=>Promise.all([api('/incidents'),api('/impact')]).then(([l,i])=>{setList(l);setImp(i)}).catch(e=>setErr(e.message));useEffect(()=>{load()},[]);
 useEffect(()=>setShowAll(false),[city]);
 const s=(id,k,v)=>setF(p=>({...p,[id]:{...p[id],[k]:v}}));
 const save=async i=>{setErr();try{await api('/incidents/'+i.id,{method:'PATCH',body:JSON.stringify(f[i.id]||{})});setF(p=>({...p,[i.id]:{}}));load()}catch(e){setErr(e.message)}};
 const ST=['New','Under Review','Verified','Assigned','In Progress','Resolved','Closed'];
 const nearby=city?list.filter(i=>distanceKm(i,city)<=50):[],visible=showAll?list:nearby;
 const scopeImpact=showAll?imp:city?{estimatedLitres:nearby.reduce((sum,i)=>sum+(i.impact?.litres||0),0),resolved:nearby.filter(i=>['Resolved','Closed'].includes(i.status)).length,open:nearby.filter(i=>!['Resolved','Closed'].includes(i.status)).length}:undefined;
 return <><h2>Action center{city?` · ${city.name}`:''}</h2>{err&&<p className="err">{err}</p>}
  {scopeImpact&&<section className="card"><h3>Water saved tracker</h3><b className="n">{scopeImpact.estimatedLitres.toLocaleString()} L</b><p>Estimated, not measured. {scopeImpact.open} open, {scopeImpact.resolved} resolved in this view.</p></section>}
  {!city&&<p className="demo">Choose a city above to see nearby incidents, or view all reports.</p>}
  {city&&<p className="demo">{showAll?'Showing reports from all cities.':`Showing reports within 50 km of ${city.name}.`}</p>}
  {list.length>0&&(!city||list.length>nearby.length)&&<button type="button" onClick={()=>setShowAll(v=>!v)}>{showAll?'Show nearby only':`Show all ${list.length} reports`}</button>}
  {visible.length===0&&<p>{!city?'Select a city, or show all reports, to see cases.':list.length===0?'No incidents have been reported yet.':`No incidents within 50 km of ${city.name}.`}</p>}
  {visible.map(i=><article className="card" key={i.id}><h3>#{i.id} {i.type}<span className="pill">{i.status}{i.verified?' (verified)':''}</span></h3><p>{i.description}</p><small>{i.reports} report(s), priority {i.priority}, source {i.source}{i.assignedTo&&`, team ${i.assignedTo}`}</small>
   <div className="row"><select aria-label="Status" value={f[i.id]?.status??i.status} onChange={e=>s(i.id,'status',e.target.value)}>{ST.map(x=><option key={x}>{x}</option>)}</select>
   <input placeholder="Assign team" value={f[i.id]?.assignedTo??''} onChange={e=>s(i.id,'assignedTo',e.target.value)}/>
   {i.type==='Water leakage'&&<><input type="number" min="0" step="0.1" placeholder="Leak L/min" defaultValue={i.leakLpm??''} onChange={e=>s(i.id,'leakLpm',e.target.value)}/><input type="number" min="1" placeholder="Hours avoided" onChange={e=>s(i.id,'hours',e.target.value)}/></>}
   <button className="p" onClick={()=>save(i)}>Update</button></div>
   {i.impact&&<p className="ok">Estimated {i.impact.litres.toLocaleString()} L saved. {i.impact.method}. {i.impact.verification}.</p>}
   <details><summary>Audit trail</summary>{i.audit.map((a,n)=><p key={n}>{new Date(a.at).toLocaleString()}: {a.status} {a.note}</p>)}</details></article>)}</>}
function Report({city}){
 const T=['Extreme heat concern','Water leakage','Flooding','Waterlogging','Water shortage','Damaged water infrastructure'];
 const [v,setV]=useState({type:T[0],description:''}),[msg,setMsg]=useState();
 const go=async e=>{e.preventDefault();if(!city)return;try{const r=await api('/incidents',{method:'POST',body:JSON.stringify({type:v.type,description:v.description,lat:city.latitude,lng:city.longitude,locationName:`${city.name}${city.admin1?`, ${city.admin1}`:''}`})}),received=r.duplicate?`A nearby report is already open. Yours was merged into #${r.incident.id}.`:`Report #${r.incident.id} received for review.`,delivery=r.notification?.sent?` Email sent to ${r.notification.to}.`:` Email not sent: ${r.notification?.reason||'Email delivery is not configured.'}`;setMsg({ok:1,emailSent:Boolean(r.notification?.sent),t:received+delivery});setV({...v,description:''})}catch(x){setMsg({t:x.message})}};
 if(!city)return <section className="city-empty-state"><span className="section-kicker">COMMUNITY REPORT</span><h3>Choose a city to file a report.</h3><p>Your report will be attached to the selected city. Exact street details can be included in the description.</p></section>;
 return <><h2>Report an environmental issue · {city.name}</h2><form className="card" onSubmit={go}><p className="demo">Report location: {city.name}{city.admin1?`, ${city.admin1}`:''}. Reports are unverified until reviewed.</p><div className="row"><select value={v.type} onChange={e=>setV({...v,type:e.target.value})}>{T.map(t=><option key={t}>{t}</option>)}</select></div>
  <div className="row"><textarea required minLength={5} maxLength={500} rows={4} style={{width:'100%'}} placeholder="What did you see, and where exactly?" value={v.description} onChange={e=>setV({...v,description:e.target.value})}/></div>
  <div className="row"><button className="p">Send report</button></div>{msg&&<p className={msg.ok?(msg.emailSent?'ok':'warn'):'err'}>{msg.t}</p>}<small>Reports are unverified until reviewed. Your personal details are not collected.</small></form></>}
function WhatIf({loc}){
 const [v,setV]=useState({temp:31,rain24h:0,avail:70,nightFlow:.4}),[r,setR]=useState(),[err,setErr]=useState();
 useEffect(()=>{const t=setTimeout(()=>api('/simulate',{method:'POST',body:JSON.stringify({loc,values:v})}).then(setR).catch(e=>setErr(e.message)),200);return()=>clearTimeout(t)},[v,loc]);
 const S=[['temp','Temperature °C',20,50,1],['rain24h','Rain in 24 h (mm)',0,300,5],['avail','Water availability %',0,100,5],['nightFlow','Night flow L/min',0,10,.1]];
 return <><h2>What-if simulator</h2><p className="demo">Scenario simulator, not a forecast. Rule-based and not scientifically validated.</p>{err&&<p className="err">{err}</p>}
  <section className="card">{S.map(([k,n,a,b,st])=><div className="row" key={k}><label style={{width:190}} htmlFor={k}>{n}: {v[k]}</label><input id={k} type="range" min={a} max={b} step={st} value={v[k]} onChange={e=>setV({...v,[k]:Number(e.target.value)})}/></div>)}</section>
  {r&&<section className="card"><h3>AquaScore {r.baseline.aquaScore} to {r.simulated.aquaScore}</h3>{Object.keys(NAMES).map(k=>{const b=r.baseline.components[k],s=r.simulated.components[k];return <p key={k}>{NAMES[k]}: {b.score} to {s.score} <Badge l={s.level}/> {s.score>=25&&s.action&&<small>Action: {s.action}</small>}</p>})}</section>}</>}
export default function App(){
 const [tab,setTab]=useState('Dashboard'),[locs,setLocs]=useState([]),[loc,setLoc]=useState('jaipur'),[sc,setSc]=useState(''),[scs,setScs]=useState({}),[city,setCity]=useState(),[assistantCity,setAssistantCity]=useState();
 useEffect(()=>{api('/locations').then(setLocs).catch(()=>{});api('/scenarios').then(setScs).catch(()=>{})},[]);
    return <div className="app"><nav><h1>AquaShield AI</h1><p>Protect People. Preserve Water. Predict Risk.</p>{['Dashboard','Sample risks','Assistant','Risk map','Action center','Report','What-if'].map(t=><button key={t} className={t===tab?'on':''} onClick={()=>setTab(t)}>{t}</button>)}</nav>
      <main>{['Sample risks','Risk map','Action center','Report'].includes(tab)&&<div className="bar city-context-toolbar"><CityPicker city={city} onSelect={setCity} id="view-city-picker"/>{tab==='Sample risks'&&<><span className="demo">Simulated scenario</span><select aria-label="Scenario" value={sc} onChange={e=>setSc(e.target.value)}><option value="">Baseline conditions</option>{Object.entries(scs).map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></>}</div>}
        {tab==='What-if'&&<div className="bar"><span className="demo">Sample scenarios · simulated readings</span><select aria-label="Sample location" value={loc} onChange={e=>setLoc(e.target.value)}>{locs.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></div>}
        {tab==='Dashboard'&&<Dashboard city={city} setCity={setCity} onAsk={c=>{setAssistantCity(c);setTab('Assistant')}}/>}{tab==='Sample risks'&&<SampleDashboard city={city} sc={sc}/ >}{tab==='Assistant'&&<Assistant initialCity={assistantCity||city}/>}{tab==='Risk map'&&<MapView city={city}/ >}{tab==='Action center'&&<Actions city={city}/ >}{tab==='Report'&&<Report city={city}/ >}{tab==='What-if'&&<WhatIf loc={loc}/>}</main></div>}
