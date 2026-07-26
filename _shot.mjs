import puppeteer from 'puppeteer'
const USER = {"id":"cmlhsmk530000pogv3711i2q9","name":"Alice Chen","email":"alice@example.com","role":"admin"}
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const b = await puppeteer.launch({ headless: true, args:['--no-sandbox'] })
const p = await b.newPage()
await p.setViewport({ width: 1500, height: 900 })
await p.evaluateOnNewDocument((u)=>{ localStorage.setItem('currentUser', JSON.stringify(u)) }, USER)
await p.goto('http://localhost:12039/notifications', { waitUntil:'domcontentloaded', timeout:60000 })
await sleep(3500)
await p.screenshot({ path:'d:/tmp/nc-block.png', clip:{x:230,y:60,width:1270,height:340} })
await b.close(); console.log('DONE')
