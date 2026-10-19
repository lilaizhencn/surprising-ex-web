import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"

const fixturePath = process.env.LINEAR_PROTECTION_LIVE_FIXTURE, phase = process.env.LINEAR_PROTECTION_PHASE
assert(fixturePath?.startsWith("/tmp/surprising-linear-delivery-fused-"))
assert(["TRADING", "SETTLING"].includes(phase))
const root = path.dirname(fixturePath), deadline = Date.now() + 180000
let fixture
while (true) {
  try { const value = JSON.parse(fs.readFileSync(fixturePath,"utf8")); if (value.deliveryProtectionPhase === phase) { fixture=value; break } }
  catch (e) { if (e.code !== "ENOENT" && !(e instanceof SyntaxError)) throw e }
  assert(Date.now()<deadline,"bounded delivery protection fixture wait");await new Promise(resolve=>setTimeout(resolve,100))
}
assert.equal(fixture.productLine,"LINEAR_DELIVERY")
const pid = Number(fs.readFileSync(`${root}/runtime/${fixture.runId}/pids/realtime.pid`,"utf8").trim())
assert(execFileSync("ps",["-p",String(pid),"-o","args="],{encoding:"utf8"}).includes(`-Dsurprising.launcher.identity=${fixture.runId}/realtime`))
const {chromium} = await import(process.env.LINEAR_PROTECTION_PLAYWRIGHT_MODULE || "playwright-core")
const browser = await chromium.launch({headless:true,...(process.env.LINEAR_PROTECTION_CHROMIUM?{executablePath:process.env.LINEAR_PROTECTION_CHROMIUM}:{})})
const resumeSingleId = process.env.LINEAR_PROTECTION_RESUME_SINGLE_ID
const requests=resumeSingleId?JSON.parse(fs.readFileSync(`${root}/delivery-protection-web-requests.json`,"utf8")):[], errors=[];let page,paused=false,triggerIds=[]
if(resumeSingleId){
  assert.equal(phase,"TRADING");assert.equal(requests.length,1);assert.equal(requests[0].kind,"single")
  const response=await fetch(`http://127.0.0.1:9094/api/v1/gateway/trading-trigger/${resumeSingleId}?userId=${fixture.userId}`,{headers:{Authorization:`Bearer ${fixture.accessToken}`,"X-User-Id":String(fixture.userId),"X-Product-Line":"LINEAR_DELIVERY"}})
  assert.equal(response.status,200);const original=JSON.parse(await response.text())
  assert.equal(original.clientTriggerOrderId,requests[0].body.clientTriggerOrderId);assert.equal(String(original.userId),String(fixture.userId));assert.equal(String(original.instrumentId),String(fixture.instrumentId))
  triggerIds.push(resumeSingleId)
}
const parse = text=>JSON.parse(text,(_k,value,context)=>typeof value==="number"&&Number.isInteger(value)&&!Number.isSafeInteger(value)?context.source:value)
const saveRequests = ()=>fs.writeFileSync(`${root}/delivery-protection-web-requests.json`,JSON.stringify(requests,null,2),{mode:0o600})
const pendingRows = ()=>page.evaluate(()=>Object.entries(localStorage).filter(([k])=>k.startsWith("surprising-ex.pending-command:")).map(([,v])=>JSON.parse(v)))
const pause = ()=>{process.kill(pid,"SIGSTOP");paused=true}
const resume = ()=>{if(paused)process.kill(pid,"SIGCONT");paused=false}
async function resolve(label,reload=false) {
  if(reload)await page.reload()
  const button=page.getByRole("button",{name:label,exact:true}), end=Date.now()+25000
  while((await pendingRows()).length) {assert(Date.now()<end,"bounded original receipt confirmation");await button.waitFor();await button.click();await page.waitForTimeout(100)}
  assert.equal((await pendingRows()).length,0)
}
async function ticket(oco=false) {
  await page.getByRole("button",{name:"TP / SL",exact:true}).click()
  await page.getByRole("button",{name:oco?"Two-way (OCO)":"One-way trigger",exact:true}).click()
  await page.getByLabel("TP/SL trigger price",{exact:true}).fill("40000")
  if(oco)await page.getByLabel("Take-profit trigger price",{exact:true}).fill("60000")
  await page.getByLabel("TP/SL close quantity",{exact:true}).fill("1")
  await page.getByLabel("Trigger source",{exact:true}).click()
  await page.getByRole("option",{name:"Last traded price",exact:true}).click()
  const text=await page.locator(".trade-ticket").textContent()
  assert(text.includes("Triggers when last traded price ≤ trigger price"));assert(!text.includes("Est. max long"))
  assert((await page.locator(".ticket-summary").innerText()).includes("At execution"))
  assert((await page.locator(".ticket-summary").innerText()).includes("Available to close long"))
}
async function row(id) {await page.getByRole("tab",{name:"TP & SL",exact:true}).click();const value=page.getByRole("row").filter({has:page.getByText(`#${id}`,{exact:true})});await value.waitFor();return value}
try {
  const prior=phase==="SETTLING"?JSON.parse(fs.readFileSync(`${root}/delivery-protection-web-requests.json`,"utf8")):null
  const restored=resumeSingleId?requests[0].pending:prior?.find(v=>v.kind==="cancel")?.pending
  const context=await browser.newContext({viewport:{width:1440,height:1100}})
  await context.addInitScript(({session,restored})=>{
    localStorage.setItem("surprising-ex.session",JSON.stringify(session));localStorage.setItem("surprising-ex.language","en");localStorage.setItem("surprising-ex.theme","dark")
    if(restored&&!sessionStorage.getItem("linear-protection-restored")){
      const suffix=restored.clientTriggerOrderId?`trigger-${restored.clientTriggerOrderId}`:`trigger-cancel-${restored.cancelTriggerOrderId}`
      localStorage.setItem(`surprising-ex.pending-command:${restored.userId}:${suffix}`,JSON.stringify(restored));sessionStorage.setItem("linear-protection-restored","true")
    }
  },{session:fixture.session,restored})
  page=await context.newPage();page.on("pageerror",e=>errors.push(String(e)));page.setDefaultTimeout(20000)
  await page.goto(`http://127.0.0.1:5173/trade/delivery-futures?instrumentId=${fixture.instrumentId}`)
  if(phase==="SETTLING") {
    let writes=0;await page.route("**/api/**",route=>{if(route.request().method()!=="GET")writes++;assert.equal(route.request().method(),"GET");return route.continue()})
    await page.getByRole("button",{name:"Check cancellation result",exact:true}).waitFor();await resolve("Check cancellation result")
    await ticket();assert(await page.getByRole("button",{name:/^Set stop loss/}).isDisabled())
    await ticket(true);assert(await page.getByRole("button",{name:/^Set TP\/SL pair/}).isDisabled())
    await page.setViewportSize({width:320,height:1100});await page.locator(".trade-ticket").screenshot({path:`${root}/delivery-protection-web-settling.png`})
    await page.getByRole("button",{name:"Close position",exact:true}).click();await page.getByRole("button",{name:"MARKET",exact:true}).click()
    await page.getByLabel("Order quantity",{exact:true}).fill("1")
    assert(await page.getByRole("button",{name:"Close long",exact:true}).isEnabled())
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal(writes,0);assert.deepEqual(errors,[])
    fs.writeFileSync(`${root}/delivery-protection-web-settling-evidence.json`,JSON.stringify({productLine:"LINEAR_DELIVERY",phase,writes:0,priorCancellationRestored:true,newSingleDisabled:true,newOcoDisabled:true,directCloseEnabled:true,width:320,pageErrors:errors},null,2))
    console.log("LINEAR_DELIVERY_PROTECTION_WEB_SETTLING_PASS triggerDisabled=singleAndOco priorCancelRestored=true directCloseEnabled=true writes=0 width320")
  } else {
    let singleId=resumeSingleId, cancelDrop=true
    await page.route("**/api/v1/gateway/trading-trigger",async route=>{
      assert.equal(route.request().method(),"POST");const body=route.request().postDataJSON(),stored=await pendingRows();assert.equal(stored.length,1)
      assert.equal(stored[0].productLine,"LINEAR_DELIVERY");assert.equal(stored[0].clientTriggerOrderId,body.clientTriggerOrderId)
      requests.push({kind:"single",body,pending:stored[0]});saveRequests();pause()
      const response=await route.fetch();assert.equal(response.status(),200);singleId=String(parse(await response.text()).triggerOrderId);triggerIds.push(singleId);await route.abort("failed")
    })
    await page.route("**/api/v1/gateway/trading-trigger/cancel",async route=>{
      const body=route.request().postDataJSON(),id=String(body.triggerOrderId),stored=await pendingRows();assert.equal(stored[0].cancelTriggerOrderId,id)
      requests.push({kind:"cancel",body,pending:stored[0]});saveRequests();if(cancelDrop)pause()
      const response=await route.fetch();assert.equal(response.status(),200);assert.equal(parse(await response.text()).status,"CANCELED")
      if(cancelDrop){cancelDrop=false;await route.abort("failed")}else await route.fulfill({response})
    })
    if(!resumeSingleId){
      await ticket();await page.getByRole("button",{name:/^Set stop loss/}).click();await page.getByRole("button",{name:"Check order result",exact:true}).waitFor()
      await page.getByRole("button",{name:"Check order result",exact:true}).click();assert.equal((await pendingRows()).length,1)
      assert(await page.getByRole("button",{name:/^Set stop loss/}).isDisabled());resume();await resolve("Check order result",true)
    } else await resolve("Check order result")
    const first=await row(singleId);page.on("dialog",dialog=>dialog.accept());await first.getByRole("button",{name:"Revoke",exact:true}).click()
    await page.getByRole("button",{name:"Check cancellation result",exact:true}).waitFor();await page.getByRole("button",{name:"Check cancellation result",exact:true}).click();assert.equal((await pendingRows()).length,1)
    resume();await resolve("Check cancellation result",true)
    await page.route("**/api/v1/gateway/trading-trigger/batch",async route=>{
      const body=route.request().postDataJSON(),stored=await pendingRows();assert.equal(body.atomic,true);assert.equal(body.orders.length,2);assert.equal(stored[0].ocoTakeProfitClientId,body.orders[0].clientTriggerOrderId)
      assert.equal(stored[0].productLine,"LINEAR_DELIVERY");requests.push({kind:"oco",body,pending:stored[0]});saveRequests()
      const response=await route.fetch();assert.equal(response.status(),200);const value=parse(await response.text());assert.equal(value.completed,2)
      triggerIds.push(...value.results.map(v=>String(v.order.triggerOrderId)));await route.abort("failed")
    })
    await ticket(true);await page.getByRole("button",{name:"Trigger rules",exact:true}).hover()
    await page.locator(".trade-ticket").screenshot({path:`${root}/delivery-protection-web-desktop.png`})
    await page.setViewportSize({width:320,height:1300});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
    await page.locator(".trade-ticket").screenshot({path:`${root}/delivery-protection-web-mobile.png`})
    await page.getByRole("button",{name:/^Set TP\/SL pair/}).click();await page.getByRole("button",{name:"Check order result",exact:true}).waitFor();await resolve("Check order result",true)
    for(const id of triggerIds.slice(1)){const value=await row(id);await value.getByRole("button",{name:"Revoke",exact:true}).click();await page.waitForFunction(()=>!Object.keys(localStorage).some(k=>k.startsWith("surprising-ex.pending-command:")))}
    assert.equal(requests.length,5);assert.deepEqual(errors,[])
    fs.writeFileSync(`${root}/delivery-protection-web-evidence.json`,JSON.stringify({productLine:"LINEAR_DELIVERY",phase,triggerIds,posts:5,singlePosts:1,cancelPosts:3,ocoPosts:1,pausedUnknown:2,reloadRecovered:3,noMixedOpeningEstimate:true,feesAtExecution:true,source:"LAST",widths:[1440,320],pageErrors:errors},null,2))
    console.log("LINEAR_DELIVERY_PROTECTION_WEB_PASS single=1 oco=1 cancel=3 pausedUnknown=2 reloadRecovered=3 source=LAST feesAtExecution=true widths=1440,320")
  }
} catch(error){if(page){await page.screenshot({path:`${root}/delivery-protection-web-${phase}-failure.png`,fullPage:true});fs.writeFileSync(`${root}/delivery-protection-web-${phase}-failure.txt`,await page.locator("body").innerText())}throw error}
finally {resume();await browser.close()}
