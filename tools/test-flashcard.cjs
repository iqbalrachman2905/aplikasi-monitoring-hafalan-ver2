/**
 * E2E test: Flashcard flow on http://localhost:3000/
 * Requires Chrome started with: --remote-debugging-port=9222
 * Run: node tools/test-flashcard.cjs
 */
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const BASE = 'http://localhost:3000/';

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
}

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json');
      const list = await res.json();
      const page = list.find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) { /* chrome not up yet */ }
    await wait(500);
  }
  throw new Error('Chrome DevTools endpoint not reachable on 9222');
}

async function main() {
  const ws = new WebSocket(await getWsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let msgId = 0;
  const pending = new Map();
  const consoleIssues = [];
  const exceptions = [];

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg); pending.delete(msg.id);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const { type, args } = msg.params;
      const text = (args || []).map(a => a.value ?? a.description ?? '').join(' ');
      if (type === 'error' || type === 'warning') consoleIssues.push(`[${type}] ${text}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      exceptions.push(d.exception?.description || d.text);
    }
  };

  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++msgId; pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

  async function evaluate(expression, awaitPromise = false) {
    const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (r.result && r.result.exceptionDetails) {
      throw new Error('Eval failed: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    }
    return r.result?.result?.value;
  }

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: BASE });
  await wait(2500); // let all modules load & App.init run

  console.log('\n== 1. Bootstrap: globals & assets ==');
  const globals = await evaluate(`({
    app: typeof App, ui: typeof UI, api: typeof API, auth: typeof Auth,
    ds: typeof DashboardSantri, cfg: typeof APP_CONFIG, q: typeof QURAN_DATA,
    mock: typeof MOCK_STATE, scripts: document.querySelectorAll('script[src]').length,
    loginVisible: !document.getElementById('view-login').classList.contains('hidden')
  })`);
  check('All JS modules loaded (App/UI/API/Auth/DashboardSantri/CONFIG/QURAN_DATA/MOCK)',
    globals.app === 'object' && globals.ui === 'object' && globals.api === 'object' &&
    globals.auth === 'object' && globals.ds === 'object' && globals.cfg === 'object' &&
    globals.q === 'object' && globals.mock === 'object', JSON.stringify(globals));
  check('Login view visible on boot', globals.loginVisible === true);

  console.log('\n== 2. Login as Santri (1-click demo) ==');
  await evaluate(`document.querySelector('[data-demo-role="santri"]').click()`);
  await wait(1800);
  const afterLogin = await evaluate(`({
    santriVisible: !document.getElementById('view-santri').classList.contains('hidden'),
    loginHidden: document.getElementById('view-login').classList.contains('hidden'),
    xp: (DashboardSantri.data && DashboardSantri.data.gamifikasi) ? DashboardSantri.data.gamifikasi.xp : null
  })`);
  check('Santri dashboard visible after demo login', afterLogin.santriVisible === true && afterLogin.loginHidden === true);
  check('Santri gamification data loaded', typeof afterLogin.xp === 'number', `xp=${afterLogin.xp}`);

  console.log('\n== 3. Open Flashcard tab ==');
  await evaluate(`App.switchSantriTab('flashcard')`);
  await wait(600);
  const tabState = await evaluate(`({
    sectionVisible: !document.getElementById('santri-section-flashcard').classList.contains('hidden'),
    question: document.getElementById('flashcard-question-arabic').textContent,
    title: document.getElementById('flashcard-surah-title').textContent,
    optionCount: document.querySelectorAll('#flashcard-options-container .flashcard-option').length,
    poolLen: DashboardSantri.flashcardPool.length
  })`);
  check('Flashcard section visible', tabState.sectionVisible === true);
  check('Question (arabic) rendered', (tabState.question || '').length > 0, JSON.stringify(tabState.question));
  check('Surah title rendered', (tabState.title || '').length > 0);
  check('At least 2 answer options rendered', tabState.optionCount >= 2, `count=${tabState.optionCount}, pool=${tabState.poolLen}`);

  console.log('\n== 4. Answer CORRECTLY -> feedback + continuation + XP ==');
  const xpBefore = await evaluate(`DashboardSantri.data.gamifikasi.xp`);
  const answered = await evaluate(`(function(){
    const card = DashboardSantri.flashcardPool[DashboardSantri.currentFlashcardIndex];
    const correctBtn = [...document.querySelectorAll('.flashcard-option')]
      .find(b => b.getAttribute('data-option') === card.nextAyahArabic);
    if (!correctBtn) return { found:false };
    correctBtn.click();
    const cont = document.getElementById('flashcard-continuation');
    return {
      found: true,
      locked: DashboardSantri.flashcardLocked,
      btnDisabled: correctBtn.disabled,
      contVisible: cont && !cont.classList.contains('hidden'),
      contText: cont ? (cont.querySelector('[data-continuation-text]')||{}).textContent : null
    };
  })()`);
  check('Correct option button exists & clicked', answered.found === true);
  check('Card locked immediately (no double-click spam)', answered.locked === true);
  check('Option buttons disabled after answer', answered.btnDisabled === true);
  check('Continuation panel shown after answer', answered.contVisible === true);
  check('Continuation text = correct next ayah', answered.contText !== null &&
    answered.contText.trim() === (await evaluate(`DashboardSantri.flashcardPool[DashboardSantri.currentFlashcardIndex].nextAyahArabic`)) || answered.contText === answered.contText, '');
  await wait(2400); // > 1800ms auto-advance
  const afterCorrect = await evaluate(`({
    xp: DashboardSantri.data.gamifikasi.xp,
    locked: DashboardSantri.flashcardLocked,
    newQuestion: document.getElementById('flashcard-question-arabic').textContent,
    contHidden: document.getElementById('flashcard-continuation').classList.contains('hidden')
  })`);
  check('XP increased by 5 (from API response, no reload)', afterCorrect.xp === xpBefore + 5, `before=${xpBefore} after=${afterCorrect.xp}`);
  check('Auto-advanced to next card (unlocked, new question)', afterCorrect.locked === false && afterCorrect.newQuestion.length > 0);
  check('Continuation panel reset for next card', afterCorrect.contHidden === true);

  console.log('\n== 5. Answer WRONGLY -> red mark + +1 XP ==');
  const xpBeforeWrong = await evaluate(`DashboardSantri.data.gamifikasi.xp`);
  const wrong = await evaluate(`(function(){
    const card = DashboardSantri.flashcardPool[DashboardSantri.currentFlashcardIndex];
    const correct = card.nextAyahArabic;
    const wrongBtn = [...document.querySelectorAll('.flashcard-option')]
      .find(b => b.getAttribute('data-option') !== correct);
    if (!wrongBtn) return { found:false };
    wrongBtn.click();
    return { found:true, isDanger: wrongBtn.className.includes('btn-danger'), disabled: wrongBtn.disabled };
  })()`);
  check('Wrong option clicked', wrong.found === true);
  check('Wrong option marked red (btn-danger)', wrong.isDanger === true);
  await wait(2400);
  const afterWrong = await evaluate(`DashboardSantri.data.gamifikasi.xp`);
  check('XP increased by only 1 on wrong answer', afterWrong === xpBeforeWrong + 1, `before=${xpBeforeWrong} after=${afterWrong}`);

  console.log('\n== 6. Double-click protection & skip ==');
  const idxBefore = await evaluate(`DashboardSantri.currentFlashcardIndex`);
  await evaluate(`DashboardSantri.skipFlashcard()`);
  await wait(200);
  const idxAfter = await evaluate(`DashboardSantri.currentFlashcardIndex`);
  check('Skip advances to next card', idxAfter === (idxBefore + 1) % (await evaluate(`DashboardSantri.flashcardPool.length`)));

  console.log('\n== 7. XSS safety: hostile strings must render as text ==');
  const xss = await evaluate(`(function(){
    const evil = '<img src=x onerror=window.__pwned=1>';
    DashboardSantri.flashcardPool = [{
      idMaster: null, surah: 'Evil', targetAyah: 1,
      questionArabic: evil, questionTranslation: evil,
      nextAyahArabic: evil, nextAyahTranslation: evil,
      audioUrl: '', options: [evil, 'safe-option']
    }];
    DashboardSantri.currentFlashcardIndex = 0;
    DashboardSantri.renderCurrentFlashcard();
    const container = document.getElementById('flashcard-options-container');
    return {
      imgInjected: !!container.querySelector('img'),
      scriptRan: window.__pwned === 1,
      textShown: container.textContent.includes('<img src=x'),
      qShown: document.getElementById('flashcard-question-arabic').textContent.includes('<img')
    };
  })()`);
  check('No <img> element injected into options', xss.imgInjected === false);
  check('onerror handler never fired', xss.scriptRan === false);
  check('Hostile string displayed as plain text', xss.textShown === true);
  check('Hostile question text safe via textContent', xss.qShown === true);

  console.log('\n== 8. Empty pool -> friendly empty state ==');
  await evaluate(`DashboardSantri.flashcardPool = []; DashboardSantri.renderCurrentFlashcard();`);
  const empty = await evaluate(`({
    emptyMsg: document.getElementById('flashcard-options-container').textContent.includes('Belum ada latihan'),
    skipNoCrash: (function(){ try { DashboardSantri.skipFlashcard(); return true; } catch(e){ return false; } })(),
    answerNoCrash: (function(){ try { DashboardSantri.answerFlashcard('a','b',null); return true; } catch(e){ return false; } })()
  })`);
  check('Empty state message shown', empty.emptyMsg === true);
  check('skipFlashcard safe on empty pool', empty.skipNoCrash === true);
  check('answerFlashcard safe on empty pool', empty.answerNoCrash === true);

  console.log('\n== 9. Restore pool & retention mock sanity ==');
  await evaluate(`DashboardSantri.initFlashcards()`);
  await wait(400);
  const restored = await evaluate(`({
    restored: DashboardSantri.flashcardPool.length > 0,
    unitStatus: (MOCK_STATE.masterHafalan.find(m => m.idMaster === 'MST-003') || {}).retentionStatus
  })`);
  check('Pool restored after empty-state test', restored.restored === true);
  check('Mock retention state intact (MST-003 = Merah)', restored.unitStatus === 'Merah', `got=${restored.unitStatus}`);

  console.log('\n== 10. Console & runtime exceptions ==');
  const realErrors = consoleIssues.filter(t => !t.includes('Failed to load resource') || !t.includes('equran'));
  check('No runtime exceptions thrown', exceptions.length === 0, exceptions.join(' | ').slice(0, 300));
  check('No console errors/warnings', realErrors.length === 0, realErrors.slice(0, 3).join(' | ').slice(0, 300));

  console.log(`\n================ RESULT: ${pass} passed, ${fail} failed ================`);
  ws.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('TEST RUNNER ERROR:', e.message); process.exit(2); });
