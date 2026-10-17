const path = require('node:path');
const root = path.resolve(__dirname, '..');
const {chromium,firefox} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 for(const [name,engine] of [['Chromium',chromium],['Firefox',firefox]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage();
   await page.setContent('<div id="term" style="width:800px;height:300px"></div>');
   await page.addStyleTag({content:fs.readFileSync(path.join(root, 'static/vendor/xterm/xterm.css'),'utf8')});
   await page.addScriptTag({content:fs.readFileSync(path.join(root, 'static/vendor/xterm/xterm.js'),'utf8')});
   await page.addScriptTag({content:fs.readFileSync(path.join(root, 'static/js/terminal-manager.js'),'utf8')});
   const result=await page.evaluate(async()=>{
    window.manager=TerminalManager;
    window.term=new Terminal({cols:80,rows:12});term.open(document.querySelector('#term'));
    window.received=[];window.copied=[];window.notices=[];
    window.showNotification=s=>notices.push(s);
    manager.writeTextToClipboard=text=>{copied.push(text);return Promise.resolve()};
    term.attachCustomKeyEventHandler(e=>manager.handleClipboardKeyEvent(e,term,false));
    term.onData(text=>received.push(text));
    await new Promise(resolve=>term.write('COPY_ME text\x1b[?2004h',resolve));
    const cases=[];
    for(const [key,code,keyCode] of [['c','KeyC',67],['с','KeyC',67],['v','KeyV',86],['м','KeyV',86]]){
     term.focus();term.select(0,0,7);received=[];copied=[];
     for(const type of ['keydown','keypress'])term.textarea.dispatchEvent(new KeyboardEvent(type,{key,code,keyCode,which:keyCode,ctrlKey:true,bubbles:true,cancelable:true}));
     cases.push({key,received:received.slice(),copied:copied.slice()});
    }
    term.clearSelection();received=[];
    term.textarea.dispatchEvent(new KeyboardEvent('keydown',{key:'с',code:'KeyC',keyCode:67,which:67,ctrlKey:true,bubbles:true,cancelable:true}));
    const interrupt=received.join('');
    received=[];
    // Firefox strips data from untrusted ClipboardEvent objects. Supply the
    // clipboard payload explicitly to exercise xterm's DOM paste listener.
    const pasteEvent=new Event('paste',{bubbles:true,cancelable:true});
    Object.defineProperty(pasteEvent,'clipboardData',{value:{getData:type=>type==='text/plain'?'echo paste\n':''}});
    term.textarea.dispatchEvent(pasteEvent);
    const paste=received.join('');
    return {cases,interrupt,paste};
   });
   for(const c of result.cases){assert.deepEqual(c.received,[],name+' '+c.key+' leaked control characters');assert.deepEqual(c.copied,['c','с'].includes(c.key)?['COPY_ME']:[])}
   assert.equal(result.interrupt,'\x03');
   assert.equal(result.paste,'\x1b[200~echo paste\r\x1b[201~');
   console.log('PASS '+name+': EN/RU copy and paste, no control leakage, intentional interrupt without selection, DOM bracketed paste');
  }finally{await browser.close()}
 }
})().catch(e=>{console.error(e);process.exit(1)});
