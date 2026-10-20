// Explicit opt-in; no generated financial responses or writes.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
const fixturePath = process.env.SPOT_HISTORY_LIVE_FIXTURE
assert(fixturePath?.startsWith('/tmp/surprising-spot-fused-history-'))
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
assert.equal(fixture.productLine, 'SPOT')
assert(fixture.orderHistory.count > 0)
const root = path.dirname(fixturePath)
const { chromium } = await import(process.env.SPOT_HISTORY_PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({ headless: true, ...(process.env.SPOT_HISTORY_CHROMIUM ? {executablePath:process.env.SPOT_HISTORY_CHROMIUM}: {}) })
const evidence = []
try {
 for (const pagePath of ['/orders', '/assets/ledger?category=order']) {
  for (const [width, theme] of [[1440,'dark'],[320,'dark'],[320,'light']]) {
   const context = await browser.newContext({viewport:{width,height:1000},colorScheme:theme})
   const page = await context.newPage();page.setDefaultTimeout(20000)
   const errors=[],writes=[],rawPages=[]
   page.on('pageerror',error=>errors.push(error.message))
   page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/v1/')&&request.method()!=='GET')writes.push(request.method()+' '+new URL(request.url()).pathname)})
   await page.addInitScript(({session,theme})=>{localStorage.setItem('surprising-ex.session',JSON.stringify(session));localStorage.setItem('surprising-ex.theme',theme);localStorage.setItem('surprising-ex.language','en')},{session:fixture.session,theme})
   await page.route('**/api/v1/gateway/trading/history?**',async route=>{
    const url=new URL(route.request().url());url.searchParams.set('limit','1')
    assert.equal(route.request().headers()['x-product-line'],'SPOT')
    const response=await route.fetch({url:url.toString()});assert.equal(response.status(),200)
    rawPages.push(await response.text());await route.fulfill({response})
   })
   const open=async()=>{await page.goto('http://127.0.0.1:5173'+pagePath);if(pagePath==='/orders')await page.getByRole('button',{name:/^Order history/}).click();await page.waitForFunction(()=>document.querySelectorAll('.order-history tbody tr').length===1)}
   await open()
   for(let n=2;n<=fixture.orderHistory.count;n++){
    await page.getByRole('button',{name:'Load more',exact:true}).click()
    await page.waitForFunction(n=>document.querySelectorAll('.order-history tbody tr').length===n,n)
   }
   const parsed=await page.evaluate(async raw=>{const {quoteUnsafeJsonIntegers}=await import('/src/api/client.ts');return raw.map(text=>JSON.parse(quoteUnsafeJsonIntegers(text)))},rawPages)
   const orders=parsed.flatMap(p=>p.orders)
   assert.deepEqual(new Set(orders.map(r=>String(r.orderId))),new Set(fixture.orderHistory.orderIds))
   assert(orders.every(r=>String(r.userId)===String(fixture.userId)))
   const rows=await page.locator('.order-history tbody tr').allTextContents()
   assert.equal(rows.length,fixture.orderHistory.count)
   for(const id of fixture.orderHistory.orderIds)assert(rows.some(row=>row.includes(id)))
   assert.equal(await page.getByRole('button',{name:'Load more',exact:true}).count(),0)
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false)
   if(width===320){assert.equal(await page.locator('.order-history > .table-wrap').isVisible(),false);assert.equal(await page.locator('.order-history .trade-fill-card').count(),fixture.orderHistory.count);const card=await page.locator('.order-history .trade-fill-card').first().innerText();assert(card.includes('BTC')&&card.includes('USDT')&&card.includes('Remaining'))}
   const screenshot=`history-${pagePath==='/orders'?'orders':'ledger'}-${width}-${theme}.png`;await page.screenshot({path:path.join(root,screenshot),fullPage:true})
   await page.reload();if(pagePath==='/orders')await page.getByRole('button',{name:/^Order history/}).click();await page.waitForFunction(()=>document.querySelectorAll('.order-history tbody tr').length===1)
   await page.getByRole('combobox',{name:pagePath==='/orders'?'Order status':'Status',exact:true}).click()
   await page.getByRole('option',{name:'Filled',exact:true}).click()
   await page.waitForFunction(()=>document.querySelectorAll('.order-history tbody tr').length===1)
   for(let n=2;n<=fixture.orderHistory.filledOrderIds.length;n++){
    await page.getByRole('button',{name:'Load more',exact:true}).click()
    await page.waitForFunction(n=>document.querySelectorAll('.order-history tbody tr').length===n,n)
   }
   const filteredRows=await page.locator('.order-history tbody tr').allTextContents()
   assert.equal(filteredRows.length,fixture.orderHistory.filledOrderIds.length)
   for(const id of fixture.orderHistory.filledOrderIds)assert(filteredRows.some(row=>row.includes(id)))
   assert(filteredRows.every(row=>row.includes('Filled')))
   assert.equal(await page.getByRole('button',{name:'Load more',exact:true}).count(),0)
   assert.deepEqual(errors,[]);assert.deepEqual(writes,[])
   evidence.push({page:pagePath,width,theme,rows:rows.length,realOneRowPages:parsed.length,originalOwnIds:true,serverFilteredFilledRows:filteredRows.length,reloadReadsCommittedHistory:true,overflow,writes:0,errors,screenshot})
   await context.close()
  }
 }
 fs.writeFileSync(path.join(root,'order-history-web-evidence.json'),JSON.stringify(evidence,null,2)+'\n')
 console.log(JSON.stringify({cases:evidence.length,writes:0,realHistoryOrders:fixture.orderHistory.count}))
} finally {await browser.close()}
