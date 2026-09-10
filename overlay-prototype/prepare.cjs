'use strict';
const fs=require('node:fs');
const path=require('node:path');
// Preserve the renderer's complete DOM contract without maintaining a forked copy.
function buildEntry(){
 const source=fs.readFileSync(path.join(__dirname,'../visual-playground/index.html'),'utf8');
 const html=source
  .replace('<title>N.O.V.A. / Presence study II</title>','<title>N.O.V.A. Overlay Prototype</title>')
  .replace(/href="style\.css(?:\?[^\"]*)?"/, 'href="../../visual-playground/style.css"')
  .replace('</head>', '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:; connect-src \'none\'; object-src \'none\'; base-uri \'none\'">\n<link rel="stylesheet" href="../overlay.css">\n</head>')
  .replace('<body ', '<body data-surface="overlay" ')
  .replace(/<script src="app\.js(?:\?[^\"]*)?"><\/script>/, `<div id="core-menu" role="group" aria-label="University AI" hidden>
<div class="orbit" aria-hidden="true"></div>
<button type="button" data-command="open_documents">資料</button>
<button type="button" data-command="ask_ai">AI質問</button>
<button type="button" data-command="ask_region">範囲AI</button>
<button type="button" data-command="open_settings">設定</button>
</div><div id="move-grip" aria-hidden="true">MOVE</div><p id="command-status" role="status" aria-live="polite"></p>
<script src="../../visual-playground/app.js"></script>\n<script src="../renderer.js"></script>`);
 if(!html.includes('data-surface="overlay"')||!html.includes('../../visual-playground/app.js'))throw new Error('Visual entry contract changed; update overlay entry builder.');
 fs.mkdirSync(path.join(__dirname,'.generated'),{recursive:true});
 fs.writeFileSync(path.join(__dirname,'.generated/index.html'),html);
 return html;
}
if(require.main===module){buildEntry();console.log('Overlay entry generated from the existing Visual Playground.');}
module.exports={buildEntry};
