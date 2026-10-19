import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
const root=process.env.INVERSE_MARKET_LIVE_ROOT
assert(root?.startsWith("/tmp/surprising-inverse-delivery-fused-"))
const expected=JSON.parse(fs.readFileSync(path.join(root,"market-expected.json"),"utf8"))
const {chromium}=await import(process.env.DELIVERY_PROTECTION_PLAYWRIGHT_MODULE || "playwright-core")
const browser=await chromium.launch({headless:true,...(process.env.DELIVERY_PROTECTION_CHROMIUM?{executablePath:process.env.DELIVERY_PROTECTION_CHROMIUM}:{})})
const frames=[],errors=[];let page,writes=0
try {
 const context=await browser.newContext({viewport:{width:1440,height:1100}})
 await context.addInitScript(()=>{if(!localStorage.getItem("surprising-ex.theme"))localStorage.setItem("surprising-ex.theme","dark");localStorage.setItem("surprising-ex.language","en")})
 page=await context.newPage();page.setDefaultTimeout(20000);page.on("pageerror",e=>errors.push(String(e)))
 page.on("websocket",socket=>socket.on("framereceived",frame=>{try{const value=JSON.parse(String(frame.payload));if(value.channel==="candles")frames.push(value)}catch{}}))
 await page.route("**/api/**",route=>{if(route.request().method()!=="GET")writes++;assert.equal(route.request().method(),"GET");return route.continue()})
 await page.goto(`http://127.0.0.1:5173/trade/coin-m-delivery?instrumentId=${expected.instrumentId}`)
 const sourceResponse=page.waitForResponse(r=>r.url().includes("/candlestick/candles?")&&r.url().includes("period=4h")&&new URL(r.url()).searchParams.get("instrumentId")===expected.instrumentId)
 await page.getByRole("button",{name:"4h",exact:true}).click()
 const sourceRows=(await (await sourceResponse).json()).candles
 let actualQuoteVolume=sourceRows.reduce((sum,v)=>sum+Number(v.quoteVolume),0)
 if(process.env.INVERSE_MARKET_REPLAY_EVENTS!=="true"){assert.equal(sourceRows.reduce((sum,v)=>sum+v.tradeCount,0),3);assert(Math.abs(actualQuoteVolume-Number(expected.expectedQuoteVolume))<1e-8)}
 const volume=page.locator(".chart-volume-info b"),formatted=new Intl.NumberFormat("en-US",{maximumFractionDigits:8}).format(Number(expected.expectedBaseVolume))
 if(process.env.INVERSE_MARKET_REPLAY_EVENTS!=="true")await page.waitForFunction(value=>document.querySelector(".chart-volume-info b")?.textContent===value,formatted)
 assert((await page.locator(".chart-volume-info").innerText()).includes("BTC"))
 if(process.env.INVERSE_MARKET_REPLAY_EVENTS==="true") {
  fs.writeFileSync(`${root}/market-subscriber-ready.json`,JSON.stringify({productLine:"INVERSE_DELIVERY",instrumentId:expected.instrumentId,period:"4h",nodePid:process.pid}))
  const deadline=Date.now()+90000
  while(!frames.some(f=>f.op==="event"&&f.productLine==="INVERSE_DELIVERY"&&f.instrumentId===expected.instrumentId&&f.period==="4h"&&f.data?.value?.tradeCount===3&&Math.abs(Number(f.data.value.baseVolume)-Number(expected.expectedBaseVolume))<1e-15&&Math.abs(Number(f.data.value.quoteVolume)-Number(expected.expectedQuoteVolume))<1e-8)) {assert(Date.now()<deadline,"bounded committed candle replay event wait");await page.waitForTimeout(100)}
  const latest=await page.request.get((await sourceResponse).url(),{headers:{"X-Product-Line":"INVERSE_DELIVERY"}})
  assert.equal(latest.status(),200);const latestRows=(await latest.json()).candles
  assert.equal(latestRows.reduce((sum,v)=>sum+v.tradeCount,0),3);actualQuoteVolume=latestRows.reduce((sum,v)=>sum+Number(v.quoteVolume),0)
  assert(Math.abs(actualQuoteVolume-Number(expected.expectedQuoteVolume))<1e-8)
  await page.waitForFunction(value=>document.querySelector(".chart-volume-info b")?.textContent===value,formatted)
 }
 const darkBackground=await page.evaluate(()=>getComputedStyle(document.body).backgroundColor)
 const views=[]
 for(const width of [1440,320]) {
  await page.setViewportSize({width,height:1100});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  assert.equal(await volume.innerText(),formatted)
  await page.locator(".price-chart").screenshot({path:`${root}/market-replay-web-${width}-dark-chart.png`})
  await page.screenshot({path:`${root}/market-replay-web-${width}-dark.png`,fullPage:true});views.push({width,theme:"dark",displayedBaseVolume:formatted})
 }
 await page.evaluate(()=>localStorage.setItem("surprising-ex.theme","light"))
 await page.reload();await page.getByRole("button",{name:"4h",exact:true}).click()
 await page.waitForFunction(value=>document.querySelector(".chart-volume-info b")?.textContent===value,formatted)
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
 assert.notEqual(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),darkBackground)
 await page.locator(".price-chart").screenshot({path:`${root}/market-replay-web-320-light-chart.png`});views.push({width:320,theme:"light",displayedBaseVolume:formatted})
 assert.equal(writes,0);assert.deepEqual(errors,[])
 fs.writeFileSync(`${root}/market-replay-web-evidence.json`,JSON.stringify({productLine:"INVERSE_DELIVERY",instrumentId:expected.instrumentId,writes,expectedTradeCount:3,quoteVolume:actualQuoteVolume,baseVolume:Number(expected.expectedBaseVolume),views,pageErrors:errors,candleFrames:frames.length,candleUpdateFrames:frames.filter(f=>f.op==="event").length},null,2))
 fs.writeFileSync(`${root}/market-replay-web-candle-frames.json`,JSON.stringify(frames,null,2))
 console.log(`INVERSE_MARKET_WEB_PASS writes=0 volume=${formatted} BTC views=1440dark,320dark,320light frames=${frames.length}`)
} catch(e){fs.writeFileSync(`${root}/market-replay-web-failure-frames.json`,JSON.stringify(frames,null,2));if(page){await page.screenshot({path:`${root}/market-replay-web-failure.png`,fullPage:true});fs.writeFileSync(`${root}/market-replay-web-failure.txt`,await page.locator("body").innerText())}throw e}
finally{await browser.close()}
