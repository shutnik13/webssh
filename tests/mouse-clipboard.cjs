const path = require('node:path');
const root = path.resolve(__dirname, '..');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {setTimeout: pause} = require('node:timers/promises');
(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const context = await browser.newContext({permissions:['clipboard-read','clipboard-write']});
    const page = await context.newPage();
    await page.route('https://webssh.test/**', r => r.fulfill({contentType:'text/html', body:'<style>body{margin:24px}#term{width:800px;height:300px}</style><div id="term"></div><button id="outside">Outside terminal</button>'}));
    await page.goto('https://webssh.test/');
    await page.addStyleTag({content:fs.readFileSync(path.join(root, 'static/vendor/xterm/xterm.css'),'utf8')});
    await page.addScriptTag({content:fs.readFileSync(path.join(root, 'static/vendor/xterm/xterm.js'),'utf8')});
    await page.addScriptTag({content:fs.readFileSync(path.join(root, 'static/js/terminal-manager.js'),'utf8')});
    await page.evaluate(async () => {
      window.manager = TerminalManager;
      window.notifications=[];window.showNotification=msg=>notifications.push(msg);
      window.term=new Terminal({cols:80,rows:12,fontSize:16});
      manager.terminals.clipboardTest=term;
      manager.sessionTerminals.clipboardSession=['clipboardTest'];
      manager.attachTerminal('clipboardSession','term','clipboardTest');
      await new Promise(resolve=>setTimeout(resolve,120));
      window.received=[];term.onData(text=>received.push(text));
      window.disposeMouse=manager.mouseClipboardDisposers.clipboardTest;
      await new Promise(resolve=>term.write('COPY_ME text',resolve));
    });
    const geometry=await page.evaluate(()=>{const r=term.element.querySelector('.xterm-screen').getBoundingClientRect();return {x:r.x,y:r.y,...term._core._renderService.dimensions.css.cell}});
    await page.mouse.move(geometry.x+geometry.width*0.2,geometry.y+geometry.height*0.5);
    await page.mouse.down();
    await page.mouse.move(geometry.x+geometry.width*7.2,geometry.y+geometry.height*0.5,{steps:8});
    await page.mouse.up();
    for(let i=0;i<30;i++){
      const ok=await page.evaluate(async()=>term.getSelection() && await navigator.clipboard.readText()===term.getSelection());
      if(ok) break;
      await pause(50);
    }
    const selected=await page.evaluate(()=>term.getSelection());
    assert.equal(selected.trim(),'COPY_ME');
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),selected);
    console.log('PASS: real mouse selection copies to system clipboard');
    await page.evaluate(async()=>{await navigator.clipboard.writeText('echo safe\n');received=[];await new Promise(resolve=>term.write('\x1b[?2004h\x1b[?1000h',resolve))});
    await page.locator('.xterm-screen').click({button:'right',position:{x:30,y:30}});
    for(let i=0;i<30 && !(await page.evaluate(()=>received.length));i++)await pause(50);
    assert.equal(await page.evaluate(()=>received.join('')),'\x1b[200~echo safe\r\x1b[201~');
    console.log('PASS: right click pastes once through xterm bracketed paste');
    const checks=await page.evaluate(()=>{
      const el=document.querySelector('#term');received=[];
      const shift=new MouseEvent('contextmenu',{button:2,shiftKey:true,bubbles:true,cancelable:true});el.dispatchEvent(shift);
      const shiftNative=!shift.defaultPrevented;
      const outside=new MouseEvent('contextmenu',{button:2,bubbles:true,cancelable:true});document.querySelector('#outside').dispatchEvent(outside);
      const outsideNative=!outside.defaultPrevented;
      disposeMouse();
      const disposed=new MouseEvent('contextmenu',{button:2,bubbles:true,cancelable:true});el.dispatchEvent(disposed);
      return {shiftNative,outsideNative,disposedNative:!disposed.defaultPrevented,received:received.length};
    });
    assert.deepEqual(checks,{shiftNative:true,outsideNative:true,disposedNative:true,received:0});
    console.log('PASS: Shift+right click, outside controls, and cleanup preserve native behavior');
    await page.evaluate(()=>{
      disposeMouse=manager.setupMouseClipboard(term,document.querySelector('#term'));
      Object.defineProperty(navigator.clipboard,'readText',{configurable:true,value:()=>Promise.reject(new Error('denied'))});
      received=[];
    });
    await page.locator('.xterm-screen').click({button:'right',position:{x:30,y:30}});
    for(let i=0;i<30 && !(await page.evaluate(()=>notifications.length));i++)await pause(50);
    assert.equal(await page.evaluate(()=>received.length),0);
    assert.match(await page.evaluate(()=>notifications.at(-1)),/Clipboard access denied/);
    console.log('PASS: clipboard denial does not send terminal input');
    await context.close();
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
