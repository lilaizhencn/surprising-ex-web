// Controlled presentation QA: production component, explicit integer fixtures, no API responses.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
const root=process.env.SPOT_DETAILS_QA_ROOT
assert(root?.startsWith('/tmp/surprising-spot-details-'))
assert.equal(JSON.parse(fs.readFileSync(path.join(root,'owner.json'),'utf8')).purpose,'spot order detail presentation QA')
const base=process.env.SPOT_DETAILS_QA_BASE ?? 'http://127.0.0.1:5178'
const url=new URL(base);assert.equal(url.hostname,'127.0.0.1')
const harness=path.resolve('scripts',`.spot-details-harness-${process.pid}.tsx`)
fs.writeFileSync(harness,`import React from 'react';
import {createRoot} from 'react-dom/client';
import {TradingAccountTables} from '../src/features/trading/TradingAccountTables';
import '../src/styles/global.css';
const f=window.__SPOT_DETAILS_QA__;
document.documentElement.dataset.theme=f.theme;
createRoot(document.getElementById('root')).render(<main style={{padding:12,width:'100%',minWidth:0}}><TradingAccountTables market={f.market} markets={[f.market]} productLine="SPOT" assetScales={f.scales} orders={[f.order]} positions={[]} triggers={[]} account={undefined} events={[]} loggedIn userId="1" commandPending onNotice={()=>{throw new Error('readonly QA invoked a command')}} /></main>);
`,{flag:'wx'})
fs.writeFileSync(path.join(root,'harness-owner.json'),JSON.stringify({path:harness,pid:process.pid})+'\n')
let browser
try{
 const {chromium}=await import(process.env.SPOT_DETAILS_PLAYWRIGHT_MODULE ?? 'playwright')
 browser=await chromium.launch({headless:true,...(process.env.SPOT_DETAILS_CHROMIUM?{executablePath:process.env.SPOT_DETAILS_CHROMIUM}:{})})
 const market={instrumentId:'42',symbol:'BTC-USDT',productLine:'SPOT',baseAsset:'BTC',quoteAsset:'USDT',settleAsset:'USDT',priceTickUnits:'5',quantityStepUnits:'200000',notionalMultiplierUnits:'1',pricePrecision:3}
 const normal={orderId:'9007199254740993',instrumentId:'42',status:'OPEN',side:'BUY',orderType:'LIMIT',timeInForce:'GTC',priceTicks:'12345',averagePriceTicks:'12344.5',executedValueTicks:'123445',quantitySteps:'25',executedQuantitySteps:'10',remainingQuantitySteps:'15',cumulativeFeeUnits:'-1'}
 const high={...normal,side:'SELL',priceTicks:'9007199254740993',averagePriceTicks:'9007199254740993.5',executedValueTicks:'90071992547409935'}
 const evidence=[]
 for(const [width,theme] of [[1440,'dark'],[1440,'light'],[320,'dark'],[320,'light']]){
  for(const [scenario,order,values] of [['normal',normal,['61.7225','123.445 USDT','308.625 USDT']],['large',high,['45035996273704.965','45035996273704.9675','90071992547409.935 USDT','225179981368524.825 USDT']]]){
   const context=await browser.newContext({viewport:{width,height:1000},colorScheme:theme})
   const page=await context.newPage();const errors=[],apiRequests=[]
   page.on('pageerror',error=>errors.push(error.message))
   page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/v1/'))apiRequests.push(request.method()+' '+new URL(request.url()).pathname)})
   await page.addInitScript(f=>{window.__SPOT_DETAILS_QA__=f;localStorage.setItem('surprising-ex.language','en')},{market,order,scales:{BTC:'1000000',USDT:'1000'},theme})
   await page.route('**/__spot-order-details-qa',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true; await import('/scripts/${path.basename(harness)}');</script></body></html>`}))
   await page.goto(base+'/__spot-order-details-qa');await page.waitForSelector('.compact-trading-table tbody tr')
   const text=await page.locator('.compact-trading-table tbody').innerText()
   for(const value of values)assert(text.includes(value),value)
   assert((await page.locator('.compact-trading-table thead').textContent()).includes('Quote asset'))
   assert(!(await page.locator('.compact-trading-table thead').textContent()).includes('Margin'))
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false)
   const screenshot=`details-${scenario}-${width}-${theme}.png`;await page.screenshot({path:path.join(root,screenshot),fullPage:true})
   const visibleCells=[]
   for(const [index,label] of [[3,'price'],[6,'value']]) {
    const cell=page.locator('.compact-trading-table tbody tr td').nth(index)
    await cell.scrollIntoViewIfNeeded()
    const box=await cell.boundingBox();assert(box && box.x>=-1 && box.x+box.width<=width+1)
    const unobscured=await cell.evaluate(el=>{const r=el.getBoundingClientRect();return [r.left+6,(r.left+r.right)/2,r.right-6].every(x=>el.contains(document.elementFromPoint(x,(r.top+r.bottom)/2)))})
    assert(unobscured,'order value/price cell must not be covered by sticky actions')

    visibleCells.push({label,visible:true,scrollLeft:await page.locator('.table-wrap').evaluate(el=>el.scrollLeft)})
    if(width===320)await page.screenshot({path:path.join(root,`details-${scenario}-${width}-${theme}-${label}.png`),fullPage:true})
   }

   const more=page.getByRole('tab',{name:'Recent order updates',exact:true});await more.click();await page.getByRole('tab',{name:/^Open orders/}).click()
   await page.waitForSelector('.compact-trading-table tbody tr')
   assert.deepEqual(errors,[]);assert.deepEqual(apiRequests,[])
   evidence.push({width,theme,scenario,exactValues:values,visibleCells,overflow,errors,apiRequests,screenshot,productionComponent:true,controlledFixture:true})
   await context.close()
  }
 }
 fs.writeFileSync(path.join(root,'web-details-evidence.json'),JSON.stringify(evidence,null,2)+'\n')
 console.log(JSON.stringify({cases:evidence.length,apiRequests:0,mode:'controlled production-component presentation QA'}))
} finally {if(browser)await browser.close();fs.unlinkSync(harness)}
