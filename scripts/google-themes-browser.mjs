// Synthetic Google SDK/API responses exercise real browser interactions, not Google account authorization.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const { chromium } = await import(process.env.GOOGLE_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.GOOGLE_PLAYWRIGHT_MODULE).href : 'playwright')
const base = process.env.GOOGLE_QA_URL || 'http://127.0.0.1:15474'
assert.equal(new URL(base).hostname, '127.0.0.1')
const dir = process.env.GOOGLE_QA_DIR || '/tmp/surprising-google-themes-qa'
await mkdir(dir, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const evidence = { provider: 'synthetic', scenarios: [], errors: [] }
const palettes = { dark: ['经典石墨','rgb(17, 19, 24)'], light: ['明亮晨光','rgb(247, 248, 250)'], ocean: ['深海蓝','rgb(8, 27, 41)'], forest: ['森林绿','rgb(12, 28, 24)'], dusk: ['暮光紫','rgb(28, 20, 39)'], sand: ['暖沙色','rgb(246, 239, 227)'] }
const session = { user: { userId: '7', username: null, email: null, displayName: 'Google 测试用户 🚀', status: 'NORMAL', roles: ['USER'] }, accessToken: 'synthetic-access', refreshToken: null, browserSession: true, accessTokenExpiresAt: '2099-01-01T00:00:00Z', refreshTokenExpiresAt: '2099-01-01T00:00:00Z' }
const sdk = `(() => {
  window.__googleRenders = 0;
  let options;
  const cancel = () => document.getElementById('synthetic-one-tap')?.remove();
  window.google = { accounts: { id: {
    initialize: (next) => { options = next; window.__googleOptions = next; },
    renderButton: (container) => { window.__googleRenders++; const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Continue with Google'; button.onclick = () => options.callback({ credential: 'synthetic-google-token' }); container.append(button); },
    prompt: () => { cancel(); const panel = document.createElement('div'); panel.id = 'synthetic-one-tap'; panel.style = 'position:fixed;right:10px;top:90px;z-index:200;background:white;color:black;padding:16px'; const accept = document.createElement('button'); accept.textContent = 'Google One Tap'; accept.onclick = () => options.callback({credential:'synthetic-google-token'}); const dismiss = document.createElement('button'); dismiss.textContent = 'Not now'; dismiss.onclick = cancel; panel.append(accept,dismiss); document.body.append(panel); },
    cancel, disableAutoSelect: () => {},
  } } };
})()`
async function fixture({ width = 1440, enabled = true, mode = 'success', scriptFailure = false, expires = 300000 } = {}) {
  const context = await browser.newContext({viewport: { width, height: 1000 }})
  const state = { logins: [], challenges: 0, scripts: 0, active: false }
  await context.addInitScript(() => { localStorage.setItem('surprising-ex.language','zh'); if (!localStorage.getItem('surprising-ex.theme')) localStorage.setItem('surprising-ex.theme','dark') })
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({contentType:'text/css',body:''}))
  await context.route('https://accounts.google.com/gsi/client', route => {
    state.scripts++
    if (scriptFailure && state.scripts === 1) return route.abort('failed')
    return route.fulfill({contentType:'application/javascript',body:sdk})
  })
  await context.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    const reply = (body,status=200) => route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)})
    if (path.endsWith('/auth/csrf')) return reply({token:'synthetic-csrf'})
    if (path.endsWith('/browser/refresh')) return state.active ? reply(session) : reply({message:'No browser session'},401)
    if (path.endsWith('/google/config')) return reply({enabled,webClientId:'synthetic.apps.googleusercontent.com'})
    if (path.endsWith('/telegram/config')) return reply({enabled:false})
    if (path.endsWith('/google/challenge')) return reply({nonce:(++state.challenges).toString().padStart(43,'n'),expiresAt:new Date(Date.now()+expires).toISOString()})
    if (path.endsWith('/google/login')) {
      state.logins.push({body:route.request().postDataJSON(),headers:route.request().headers()})
      if (mode==='error' && state.logins.length===1) return reply({message:'Google authorization is invalid or expired'},400)
      if (mode==='mfa') return reply({requiresVerification:true,challengeToken:'synthetic-mfa',expiresAt:new Date(Date.now()+300000).toISOString(),methods:[{type:'TOTP',destination:null}]})
      state.active=true
      return reply(session)
    }
    if (path.endsWith('/auth/login/verify')) {
      assert.equal(route.request().postDataJSON().totpCode,'123456')
      state.active=true
      return reply(session)
    }
    return reply({message:'Synthetic market data unavailable'},503)
  })
  const page=await context.newPage()
  page.on('pageerror', error=>evidence.errors.push(error.message))
  return {context,page,state}
}
async function signedIn(page,state) {
  await page.waitForURL('**/assets')
  await page.getByText('Google 测试用户 🚀',{exact:true}).first().waitFor({state:'attached'})
  assert.equal(state.logins.length,1)
  assert.equal(state.logins[0].body.platform,'WEB')
  assert.equal(state.logins[0].headers['x-auth-transport'],'cookie')
  assert.equal(state.logins[0].headers['x-xsrf-token'],'synthetic-csrf')
  assert.equal(await page.evaluate(()=>localStorage.getItem('surprising-ex.session')),null)
}
try {
  for (const width of [320,390,1440]) {
    const {context,page}=await fixture({width,enabled:false})
    await page.goto(base,{waitUntil:'domcontentloaded'})
    for (const [theme,[label,canvas]] of Object.entries(palettes)) {
      await page.getByRole('button',{name:'外观主题',exact:true}).click()
      if (theme==='ocean') await page.screenshot({path:`${dir}/picker-${width}.png`,fullPage:true})
      await page.getByRole('button',{name:new RegExp(label)}).click()
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),theme)
      assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),canvas)
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
      await page.reload({waitUntil:'domcontentloaded'})
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),theme)
      await page.screenshot({path:`${dir}/${theme}-${width}.png`,fullPage:true})
    }
    const other=await context.newPage();await other.goto(base,{waitUntil:'domcontentloaded'})
    await page.getByRole('button',{name:'外观主题',exact:true}).click()
    await page.getByRole('button',{name:/深海蓝/}).click()
    await other.waitForFunction(()=>document.documentElement.dataset.theme==='ocean')
    evidence.scenarios.push({name:'six palettes, preview, persistence, cross-tab sync',width,passed:true})
    await context.close()
  }
  for (const mode of ['success','mfa']) {
    const {context,page,state}=await fixture({width:390,mode})
    await page.goto(`${base}/auth/register?redirect=%2Fassets&invite=QA-INVITE`)
    await page.getByRole('button',{name:'Not now'}).click()
    await page.getByRole('button',{name:'Continue with Google',exact:true}).click()
    if (mode==='mfa') {
      await page.getByRole('dialog').waitFor()
      await page.screenshot({path:`${dir}/mfa-390.png`,fullPage:true})
      await page.getByRole('textbox',{name:'谷歌验证码'}).fill('123456')
      await page.getByRole('button',{name:'确认',exact:true}).click()
    }
    await signedIn(page,state)
    assert.equal(state.logins[0].body.inviteCode,'QA-INVITE')
    evidence.scenarios.push({name:`Google button ${mode}, invitation and cookie session`,passed:true})
    await context.close()
  }
  {
    const {context,page,state}=await fixture()
    await page.goto(base,{waitUntil:'domcontentloaded'})
    await page.getByRole('button',{name:'Google One Tap',exact:true}).click()
    await signedIn(page,state)
    evidence.scenarios.push({name:'landing One Tap',passed:true});await context.close()
  }
  {
    const {context,page,state}=await fixture({mode:'error'})
    await page.goto(`${base}/auth/login`)
    await page.getByRole('button',{name:'Not now'}).click()
    await page.getByRole('button',{name:'Continue with Google',exact:true}).click()
    await page.getByRole('button',{name:'重试 Google 登录'}).click()
    await page.getByRole('button',{name:'Not now'}).click()
    await page.getByRole('button',{name:'Continue with Google',exact:true}).click()
    await page.waitForURL('**/assets')
    assert.equal(state.logins.length,2);assert.notEqual(state.logins[0].body.nonce,state.logins[1].body.nonce)
    evidence.scenarios.push({name:'failed authorization retry obtains fresh nonce',passed:true});await context.close()
  }
  {
    const {context,page,state}=await fixture({scriptFailure:true})
    await page.goto(`${base}/auth/login`)
    await page.getByRole('button',{name:'重试 Google 登录'}).click()
    await page.getByRole('button',{name:'Continue with Google',exact:true}).waitFor()
    assert.equal(state.scripts,2)
    await page.getByRole('textbox',{name:'邮箱或手机号'}).fill('test@example.com')
    assert.equal(await page.locator('#synthetic-one-tap').count(),0)
    assert.equal(state.logins.length,0)
    evidence.scenarios.push({name:'SDK failure retry and cancel One Tap on typing',passed:true});await context.close()
  }
  {
    const {context,page,state}=await fixture({width:390,mode:'mfa'})
    await page.goto(`${base}/auth/login`)
    await page.getByRole('button',{name:'Not now'}).click()
    await page.getByRole('button',{name:'Continue with Google',exact:true}).click()
    await page.getByRole('dialog').waitFor()
    await page.evaluate(()=>window.__googleOptions.callback({credential:'late-duplicate'}))
    assert.equal(state.logins.length,1)
    await page.getByRole('dialog').getByRole('button',{name:'收',exact:true}).click()
    await page.getByRole('button',{name:'Continue with Google',exact:true}).waitFor()
    assert.equal(state.challenges,2)
    await page.getByRole('button',{name:'Not now'}).click()
    await page.getByRole('button',{name:'Continue with Google',exact:true}).click()
    await page.getByRole('dialog').waitFor()
    assert.equal(state.logins.length,2)
    assert.notEqual(state.logins[0].body.nonce,state.logins[1].body.nonce)
    evidence.scenarios.push({name:'MFA cancel starts a fresh login and ignores duplicate credentials',passed:true});await context.close()
  }
  {
    const {context,page,state}=await fixture({width:390,mode:'mfa'})
    await page.goto(base)
    await page.getByRole('button',{name:'Google One Tap',exact:true}).click()
    await page.getByRole('dialog').waitFor()
    await page.evaluate(()=>window.__googleOptions.callback({credential:'late-duplicate'}))
    await page.waitForTimeout(100)
    assert.equal(state.logins.length,1)
    await page.getByRole('dialog').getByRole('button',{name:'收',exact:true}).click()
    assert.equal(await page.getByRole('dialog').count(),0)
    assert.equal(state.challenges,1)
    evidence.scenarios.push({name:'landing MFA cancel closes without repeated One Tap',passed:true});await context.close()
  }
  {
    const {context,page,state}=await fixture({enabled:false})
    await page.goto(`${base}/auth/login`)
    const button=page.getByRole('button',{name:'通过 Google 继续',exact:true})
    await button.waitFor();assert.equal(await button.isDisabled(),true)
    assert.equal(state.scripts,0);assert.equal(state.challenges,0)
    evidence.scenarios.push({name:'unconfigured provider makes no SDK or challenge request',passed:true});await context.close()
  }
  if (Number(process.env.GOOGLE_QA_STABILITY_MS || 0) > 0) {
    const {context,page,state}=await fixture({width:390})
    await page.goto(`${base}/auth/login`,{waitUntil:'domcontentloaded'})
    await page.getByRole('button',{name:'Not now'}).click()
    await page.getByRole('button',{name:'Continue with Google',exact:true}).waitFor()
    const challenges=state.challenges
    for (let i=0;i<24;i++) {
      await page.getByRole('button',{name:'外观主题',exact:true}).click()
      await page.getByRole('button',{name:new RegExp(Object.values(palettes)[i%6][0])}).click()
    }
    const nodes=await page.locator('*').count()
    const cdp=await context.newCDPSession(page)
    await cdp.send('Performance.enable')
    const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.filter(({name})=>['JSHeapUsedSize','Nodes','Documents','JSEventListeners','TaskDuration'].includes(name)).map(({name,value})=>[name,value]))
    const resourceStart=await metrics()
    const durationMs=Number(process.env.GOOGLE_QA_STABILITY_MS)
    await page.waitForTimeout(durationMs)
    assert.equal(state.challenges,challenges)
    assert.equal(state.scripts,1)
    assert.equal(state.logins.length,0)
    assert.ok(await page.evaluate(()=>window.__googleRenders)<100)
    assert.ok(Math.abs(await page.locator('*').count()-nodes)<10)
    evidence.scenarios.push({name:'24 palette switches and idle SDK lifecycle',durationMs,resourceStart,resourceEnd:await metrics(),passed:true})
    await context.close()
  }
  assert.deepEqual(evidence.errors,[])
  await writeFile(`${dir}/evidence.json`,JSON.stringify(evidence,null,2))
  console.log(JSON.stringify(evidence))
} finally { await browser.close() }
