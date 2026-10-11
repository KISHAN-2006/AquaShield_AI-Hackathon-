import express from 'express';import cors from 'cors';
const app=express();app.use(cors({origin:process.env.ORIGIN||true}),express.json({limit:'100kb'}));
const now=()=>new Date().toISOString();
// Sample locations and scenarios. All readings are SIMULATED, never live observations.
const LOCS=[{id:'jaipur',name:'Jaipur',lat:26.9124,lng:75.7873,b:{}},{id:'delhi',name:'Delhi',lat:28.6139,lng:77.209,b:{temp:33,hum:45}},{id:'mumbai',name:'Mumbai',lat:19.076,lng:72.8777,b:{temp:30,hum:75,rain30d:240,normal30d:260}}];
const BASE={temp:31,hum:40,rain1h:0,rain24h:0,rain30d:60,normal30d:70,river:2.1,riverDanger:5,avail:70,nightFlow:.4,flowBaseline:.5,hoursFlow:0};
const SC={A:{temp:42,hum:35},B:{rain1h:45,rain24h:140,river:4.6},C:{rain30d:10,avail:28,temp:38},D:{nightFlow:5,hoursFlow:9}};
const SCN={A:'A: High temperature, adequate water',B:'B: Heavy rainfall, flood signal',C:'C: Rainfall deficit, falling supply',D:'D: Continuous flow, possible leak'};
const reads=(l,sc)=>({...BASE,...l.b,...(SC[sc]||{})});
const clamp=x=>Math.max(0,Math.min(100,Math.round(x)));
const lvl=s=>s==null?'Insufficient data':s>=75?'Severe':s>=50?'High':s>=25?'Moderate':'Low';
function assess(r){
 const e=r.hum/100*6.105*Math.exp(17.27*r.temp/(237.7+r.temp)),fl=r.temp+.33*e-4;
 const heat={score:clamp((fl-28)*5.5),why:[`Apparent temperature ${fl.toFixed(1)}°C from ${r.temp}°C and ${r.hum}% humidity (Steadman formula)`],action:'Move outdoor work out of 12–4 PM, open cooling points, check schools and hospitals first.'};
 const nr=r.river==null;
 const flood={score:clamp(r.rain24h/150*50+r.rain1h/50*30+(nr?0:r.river/r.riverDanger*20)),why:[`${r.rain24h} mm in 24 h, ${r.rain1h} mm/h now`,nr?'River level missing: estimate uses rainfall only':`River ${r.river} m against a ${r.riverDanger} m danger level`],missing:nr?['river level']:[],action:'Clear drains, warn low-lying wards, review waterlogging reports.'};
 const nn=r.normal30d==null,def=nn?0:Math.max(0,(1-r.rain30d/r.normal30d)*100);
 const drought=nn?{score:null,why:['Normal rainfall unknown'],missing:['30-day normal']}:{score:clamp(def*.6+(100-r.avail)*.4),why:[`30-day rain ${r.rain30d} mm vs normal ${r.normal30d} mm (${def.toFixed(0)}% deficit)`,`Water availability ${r.avail}%`],action:'Cut non-essential use, schedule supply, plan tanker support.'};
 const ratio=r.nightFlow/Math.max(r.flowBaseline,.1);
 const leak={score:clamp((ratio-1)*10+r.hoursFlow*4),why:[`Night flow ${r.nightFlow} L/min vs baseline ${r.flowBaseline} L/min`,`Flow sustained for ${r.hoursFlow} h`],action:'Inspect the line and meter. Confirm before dispatching a repair; an anomaly is not proof of a leak.',leakLpm:+Math.max(0,r.nightFlow-r.flowBaseline).toFixed(2)};
 leak.suspected=leak.score>=50;
 const W={heat:.25,flood:.3,drought:.25,leak:.2},C={heat,flood,drought,leak};let tw=0,sum=0;
 for(const k in C){C[k].level=lvl(C[k].score);C[k].missing=C[k].missing||[];if(C[k].score!=null){tw+=W[k];sum+=W[k]*C[k].score}}
 const gaps=Object.values(C).flatMap(c=>c.missing);
 return{components:C,aquaScore:tw?clamp(sum/tw):null,weights:W,severe:Object.keys(C).filter(k=>C[k].score>=75),
  quality:{status:gaps.length?'Partial data (simulated)':'Simulated data',source:'Built-in sample scenarios, not live observations',at:now(),missing:gaps},
  method:'Weighted mean of component scores (provisional weights 25/30/25/20). Missing components are excluded and weights renormalised, never counted as zero.',
  limitations:'Rule-based indicators, not validated forecasts. A severe single hazard is always shown separately from the combined score.'}}
const trend=r=>Array.from({length:24},(_,h)=>({h:`${h}:00`,temp:+(r.temp-4+4*Math.sin((h-9)/24*2*Math.PI)).toFixed(1),flow:+(h<5?r.nightFlow:r.flowBaseline+1.5*Math.max(0,Math.sin((h-5)/19*Math.PI))+(r.hoursFlow>0&&h<5?0:0)).toFixed(2)}));
app.get('/api/locations',(q,s)=>s.json(LOCS.map(({b,...l})=>l)));
app.get('/api/scenarios',(q,s)=>s.json(SCN));
const getOpenMeteo=async url=>{
 const response=await fetch(url);
 if(!response.ok)throw new Error(`Weather provider returned ${response.status}`);
 return response.json();
};
app.get('/api/cities',async(q,s)=>{
 const query=String(q.query.q||'').trim();
 if(query.length<2)return s.status(400).json({error:'Enter at least 2 characters to search for a city'});
 try{
  const url=new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search=new URLSearchParams({name:query,count:'10',language:'en',format:'json',countryCode:'IN'}).toString();
  const data=await getOpenMeteo(url);
  s.json((data.results||[]).filter(x=>x.country_code==='IN').map(x=>({id:x.id,name:x.name,admin1:x.admin1||'',latitude:x.latitude,longitude:x.longitude,country:x.country})));
 }catch(e){s.status(502).json({error:'City search is temporarily unavailable. Please try again.'})}
});
const loadWeather=async(lat,lng)=>{
 const url=new URL('https://api.open-meteo.com/v1/forecast');
 url.search=new URLSearchParams({latitude:String(lat),longitude:String(lng),current:'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,weather_code,wind_speed_10m',hourly:'temperature_2m,precipitation_probability,precipitation,uv_index',daily:'temperature_2m_max,precipitation_sum,precipitation_probability_max,uv_index_max',forecast_days:'3',timezone:'auto'}).toString();
 return getOpenMeteo(url);
};
app.get('/api/weather',async(q,s)=>{
 const lat=Number(q.query.lat),lng=Number(q.query.lng);
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return s.status(400).json({error:'A valid city location is required'});
 try{s.json(await loadWeather(lat,lng))}catch(e){s.status(502).json({error:'Live weather is temporarily unavailable. Please try again.'})}
});
app.post('/api/assistant',async(q,s)=>{
 const b=q.body||{},lat=Number(b.latitude),lng=Number(b.longitude),prompt=String(b.prompt||'').trim().slice(0,500);
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return s.status(400).json({error:'Choose a valid Indian city first'});
 if(prompt.length<2)return s.status(400).json({error:'Enter a question or describe what you need help with'});
 try{
  const weather=await loadWeather(lat,lng),c=weather.current,d=weather.daily;
  const rainToday=d.precipitation_sum[0],rainChance=d.precipitation_probability_max[0];
  const apparent=c.apparent_temperature,temp=c.temperature_2m,humidity=c.relative_humidity_2m;
  const heatLevel=apparent>=40?'very high':apparent>=35?'high':apparent>=30?'elevated':'lower';
  const asksHeat=/heat|hot|sun|temperature|cool|dehydrat/i.test(prompt),asksRain=/flood|rain|waterlog|storm|heavy rain/i.test(prompt),asksWater=/water|drink|shortage|drought|save|supply/i.test(prompt),advice=[];
  if(asksHeat)advice.push(apparent>=35?'Limit strenuous outdoor activity, especially in the afternoon. Stay in shade or a cooled place, drink water regularly, and check on children, older adults, and anyone working outdoors.':'Prefer shade, take water breaks, and avoid prolonged exertion during the hottest part of the day. Move indoors and cool down if you feel unwell.');
  if(asksRain)advice.push(rainToday>=50||rainChance>=70?'Heavy rain is possible in today’s forecast. Avoid waterlogged roads and underpasses, never walk or drive through floodwater, and follow local authority instructions.':'The forecast does not indicate a high chance of heavy rain today. Keep drains clear and check local alerts before travelling; conditions can change quickly.');
  if(asksWater)advice.push('This weather forecast cannot confirm tap-water safety or your neighbourhood’s water supply. Use treated or officially confirmed drinking water, store only what you need in clean covered containers, and check your local water utility for supply notices. For conservation, fix leaks and avoid washing vehicles or pavements with drinking water.');
  if(advice.length===0)advice.push(`For heat: the apparent temperature is ${apparent}°C, so ${apparent>=35?'reduce outdoor exertion and use shade or a cool indoor place.':'take shade and water breaks outdoors.'} For water: use safe, treated drinking water and check local utility updates, since weather data does not measure supply or water quality. ${rainToday>=50||rainChance>=70?'Rain is also elevated today; avoid floodwater and follow local alerts.':'Check local alerts before travel if rain develops.'}`);
  const message=`${advice.join('\n\n')}\n\nCurrent forecast: ${temp}°C (feels like ${apparent}°C), ${humidity}% humidity, wind ${c.wind_speed_10m} km/h. Today: high ${d.temperature_2m_max[0]}°C; ${rainToday} mm rain forecast, ${rainChance}% precipitation chance. Heat indicator: ${heatLevel}.\n\nForecasts are estimates, not sensor readings or official warnings. For emergencies, contact local emergency services.`;
  s.json({message,weather:{current:c,daily:d,timezone:weather.timezone},source:'Open-Meteo forecast',updatedAt:weather.current.time});
 }catch(e){s.status(502).json({error:'Live weather is temporarily unavailable. Please try again.'})}
});
app.get('/api/assess/:id',(q,s)=>{let l=LOCS.find(x=>x.id===q.params.id);
 if(!l&&q.params.id==='city'){
  const lat=Number(q.query.lat),lng=Number(q.query.lng);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return s.status(400).json({error:'A valid city location is required'});
  l={id:'city',name:String(q.query.name||'Selected city').slice(0,80),lat,lng,b:{}};
 }
 if(!l)return s.status(404).json({error:'Unknown location'});
 const r=reads(l,q.query.scenario);s.json({location:{id:l.id,name:l.name,lat:l.lat,lng:l.lng},scenario:SCN[q.query.scenario]||'Baseline sample conditions',readings:r,...assess(r),trend:trend(r)})});
const RNG={temp:[0,55],hum:[0,100],rain24h:[0,500],rain1h:[0,150],avail:[0,100],nightFlow:[0,50],hoursFlow:[0,24],rain30d:[0,1000]};
app.post('/api/simulate',(q,s)=>{const l=LOCS.find(x=>x.id===q.body?.loc)||LOCS[0],v={};
 for(const k in RNG){const n=Number(q.body?.values?.[k]);if(q.body?.values?.[k]!=null&&Number.isFinite(n))v[k]=Math.max(RNG[k][0],Math.min(RNG[k][1],n))}
 s.json({label:'Scenario simulator, not a forecast',baseline:assess(reads(l)),simulated:assess({...reads(l),...v})})});
// Incidents: community reports and leak flags share one Action Engine workflow.
const ST=['New','Under Review','Verified','Assigned','In Progress','Resolved','Closed'];
const TYPES=['Extreme heat concern','Water leakage','Flooding','Waterlogging','Water shortage','Damaged water infrastructure'];
const km=(a,b)=>{const t=x=>x*Math.PI/180,h=Math.sin(t(b.lat-a.lat)/2)**2+Math.cos(t(a.lat))*Math.cos(t(b.lat))*Math.sin(t(b.lng-a.lng)/2)**2;return 12742*Math.asin(Math.sqrt(h))};
const inc=[];
const reportEmailTo=()=>process.env.REPORT_EMAIL_TO||'is-kuldeepkumar1623@gmail.com';
let sesClient;
const sendReportEmail=async(incident,description=incident.description,duplicate=false)=>{
 const from=process.env.SES_FROM_EMAIL;
 if(!from)return{sent:false,to:reportEmailTo(),reason:'Email not configured: set SES_FROM_EMAIL to a verified SES sender.'};
 try{
  const{SESv2Client,SendEmailCommand}=await import('@aws-sdk/client-sesv2');
  sesClient=sesClient||new SESv2Client({region:process.env.AWS_REGION||'ap-south-1'});
  const status=duplicate?'Additional report merged':'New report received',location=incident.locationName||`${incident.lat}, ${incident.lng}`;
  const body=[
   `AquaShield ${status.toLowerCase()}.`,
   '',
   `Report: #${incident.id}`,
   `Category: ${incident.type}`,
   `Location: ${location}`,
   `Coordinates: ${incident.lat}, ${incident.lng}`,
   `Status: ${incident.status}`,
   `Priority: ${incident.priority}`,
   `Reports merged: ${incident.reports}`,
   `Source: ${incident.source}`,
   '',
   'Description:',
   description,
   '',
   `Submitted: ${now()}`,
   process.env.APP_URL?`Open AquaShield: ${process.env.APP_URL}`:''
  ].filter(Boolean).join('\n');
  await sesClient.send(new SendEmailCommand({
   FromEmailAddress:from,
   Destination:{ToAddresses:[reportEmailTo()]},
   Content:{Simple:{
    Subject:{Data:`AquaShield: ${status} #${incident.id} · ${incident.type}`,Charset:'UTF-8'},
    Body:{Text:{Data:body,Charset:'UTF-8'}}
   }}
  }));
  return{sent:true,to:reportEmailTo()};
 }catch(e){
  console.error('Report email delivery failed:',e.name||'Error');
  return{sent:false,to:reportEmailTo(),reason:'Report was saved, but email delivery failed. Install server dependencies and check SES sender verification, AWS credentials, and permissions.'};
 }
};
app.get('/api/incidents',(q,s)=>s.json(inc));
app.post('/api/incidents',async(q,s)=>{const b=q.body||{};
 if(!TYPES.includes(b.type))return s.status(400).json({error:'Choose a valid category'});
 if(typeof b.description!=='string'||b.description.trim().length<5||b.description.length>500)return s.status(400).json({error:'Description must be 5–500 characters'});
 const lat=Number(b.lat),lng=Number(b.lng);if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return s.status(400).json({error:'A valid location is required'});
 const d=inc.find(i=>i.type===b.type&&!['Resolved','Closed'].includes(i.status)&&km(i,{lat,lng})<.3);
 if(d){d.reports++;d.audit.push({at:now(),status:d.status,note:'Nearby duplicate report merged'});const notification=await sendReportEmail(d,b.description.trim(),true);return s.json({incident:d,duplicate:true,notification})}
 const i={id:inc.length+1,type:b.type,description:b.description.trim(),lat,lng,locationName:String(b.locationName||'').trim().slice(0,100),source:String(b.source||'Community').slice(0,30),status:'New',verified:false,reports:1,priority:['Flooding','Water leakage'].includes(b.type)?'High':'Moderate',leakLpm:b.leakLpm!=null&&Number.isFinite(Number(b.leakLpm))?Number(b.leakLpm):null,assignedTo:null,impact:null,audit:[{at:now(),status:'New',note:'Created'}]};
 inc.push(i);const notification=await sendReportEmail(i);s.status(201).json({incident:i,notification})});
app.patch('/api/incidents/:id',(q,s)=>{const i=inc.find(x=>x.id===Number(q.params.id));if(!i)return s.status(404).json({error:'Incident not found'});
 const{status,assignedTo,leakLpm,hours}=q.body||{};
 if(status!==undefined&&!ST.includes(status))return s.status(400).json({error:'Invalid status'});
 if(assignedTo)i.assignedTo=String(assignedTo).slice(0,60);
 if(status&&status!==i.status){i.status=status;i.verified=ST.indexOf(status)>=2;i.audit.push({at:now(),status,note:assignedTo?`Team: ${i.assignedTo}`:''})}
 if(i.status==='Resolved'&&i.type==='Water leakage'&&Number(leakLpm)>0&&Number(hours)>0){const r=Number(leakLpm),h=Math.min(Number(hours),720);
  i.impact={litres:Math.round(r*60*h),method:`${r} L/min × 60 × ${h} h, assuming the leak would have run continuously`,verification:'Estimated, not measured'}}
 s.json({incident:i})});
app.get('/api/impact',(q,s)=>s.json({estimatedLitres:inc.reduce((a,i)=>a+(i.impact?.litres||0),0),resolved:inc.filter(i=>['Resolved','Closed'].includes(i.status)).length,open:inc.filter(i=>!['Resolved','Closed'].includes(i.status)).length,note:'Estimates only; not verified by measurement.'}));
app.use((e,q,s,n)=>{console.error(e.message);s.status(500).json({error:'Something went wrong on the server'})});
app.listen(process.env.PORT||5050,()=>console.log('AquaShield API on http://localhost:'+(process.env.PORT||5050)));
