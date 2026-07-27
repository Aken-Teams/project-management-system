import puppeteer from 'puppeteer'
const USER = {"id":"cmmx34gjw006la6sdwv7lxya1","name":"sam 沈順吉","email":"sam@panjit.com.tw","role":"member"}
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const b = await puppeteer.launch({ headless: true, args:['--no-sandbox'] })
const p = await b.newPage()
await p.setViewport({ width: 1500, height: 950 })
await p.evaluateOnNewDocument((u)=>{ localStorage.setItem('currentUser', JSON.stringify(u)); localStorage.setItem('phaseOverviewCollapsed:cmob9nn8p007mrusdpamcjd8e','0') }, USER)
await p.goto('http://localhost:12039/projects/cmob9nn8p007mrusdpamcjd8e', { waitUntil:'domcontentloaded', timeout:60000 })
await sleep(3500)
async function clickText(txt){ const bx=await p.evaluate(t=>{const e=[...document.querySelectorAll('button,[role=tab],a')].find(b=>b.textContent.trim().includes(t));if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}},txt); if(bx){await p.mouse.click(bx.x,bx.y);return true}return false }
await clickText('工作項目'); await sleep(1500)
const el = await p.evaluateHandle(()=>{ const s=[...document.querySelectorAll('span')].find(x=>x.textContent==='里程碑階段總覽'); return s?.closest('.rounded-xl')||document.body })
// hover P3 actual bar
const box = await p.evaluate(()=>{ const els=[...document.querySelectorAll('span')].filter(s=>s.textContent.trim()==='P3 Engineer Run'); const last=els[els.length-1]; if(!last)return null; const r=last.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })
if(box){ await p.mouse.move(box.x,box.y); await sleep(700) }
await el.screenshot({ path:'d:/tmp/consist.png' })
await b.close(); console.log('DONE')
