(function(){
'use strict';
var CFG={owner:'vienthanhconstruction',repo:'vienthanhconstruction',branch:'main',site:'https://vienthanhconstruction.github.io/vienthanhconstruction/'};
var PAGES=[['Trang chủ','index.html'],['Giới thiệu','gioi-thieu.html'],['Dịch vụ','dich-vu.html'],['Công trình','cong-trinh.html'],['Tin tức','tin-tuc.html'],['Liên hệ','lien-he.html']];
var $=function(id){return document.getElementById(id)};
var token='',posts=[],editing=null,pend={},cover={path:'',data:''},imgN=0,dirty=false,slugTouched=false;

/* ---------- tiện ích ---------- */
function toast(m,bad){var t=$('toast');t.textContent=m;t.className='toast'+(bad?' bad':'');t.style.display='block';clearTimeout(toast.k);toast.k=setTimeout(function(){t.style.display='none'},bad?7000:3500)}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function lsGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function lsDel(k){try{localStorage.removeItem(k)}catch(e){}}
function slugify(s){return s.toLowerCase().replace(/đ/g,'d').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)}
function today(){var d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2)}
function fmtDate(d){var p=(d||'').split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:''}
function b64(text){var b=new TextEncoder().encode(text),s='';for(var i=0;i<b.length;i+=8192)s+=String.fromCharCode.apply(null,b.subarray(i,i+8192));return btoa(s)}
function unb64(c){var s=atob(c.replace(/\n/g,'')),a=new Uint8Array(s.length);for(var i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return new TextDecoder().decode(a)}
function show(v){['vLogin','vList','vEdit'].forEach(function(x){$(x).classList.toggle('on',x===v)});$('topnav').style.display=v==='vLogin'?'none':'flex';window.scrollTo(0,0)}

/* ---------- GitHub API ---------- */
function gh(path,opt){
  opt=opt||{};
  return fetch('https://api.github.com/repos/'+CFG.owner+'/'+CFG.repo+path,{method:opt.method||'GET',body:opt.body,cache:'no-store',headers:{'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json'}}).then(function(r){
    if(r.status===404&&opt.allow404)return null;
    if(!r.ok){var e=new Error('HTTP '+r.status);e.status=r.status;throw e}
    return r.status===204?null:r.json();
  });
}
function explain(e){
  if(e.status===401)return 'Mã truy cập sai hoặc đã hết hạn. Đăng xuất rồi nhập mã mới.';
  if(e.status===403||e.status===404)return 'Mã chưa đủ quyền ghi vào kho vienthanhconstruction (cần Contents: Read and write).';
  if(e.status===409||e.status===422)return 'Có người vừa sửa website cùng lúc. Bấm đăng lại lần nữa.';
  return 'Lỗi: '+e.message+'. Kiểm tra mạng rồi thử lại.';
}
function readFile(path){return gh('/contents/'+path+'?ref='+CFG.branch,{allow404:true}).then(function(j){return j&&j.content?unb64(j.content):null})}
function commit(files,msg){
  var head,baseTree;
  return gh('/git/ref/heads/'+CFG.branch).then(function(r){head=r.object.sha;return gh('/git/commits/'+head)}).then(function(c){
    baseTree=c.tree.sha;
    return Promise.all(files.map(function(f){
      if(f.del)return {path:f.path,mode:'100644',type:'blob',sha:null};
      return gh('/git/blobs',{method:'POST',body:JSON.stringify({content:f.b64||b64(f.text),encoding:'base64'})}).then(function(b){return {path:f.path,mode:'100644',type:'blob',sha:b.sha}});
    }));
  }).then(function(tree){return gh('/git/trees',{method:'POST',body:JSON.stringify({base_tree:baseTree,tree:tree})})})
  .then(function(t){return gh('/git/commits',{method:'POST',body:JSON.stringify({message:msg,tree:t.sha,parents:[head]})})})
  .then(function(c){return gh('/git/refs/heads/'+CFG.branch,{method:'PATCH',body:JSON.stringify({sha:c.sha})})});
}
function loadPosts(){return readFile('data/posts.json').then(function(t){posts=t?(JSON.parse(t).posts||[]):[];return posts})}

/* ---------- đăng nhập ---------- */
function login(){
  var t=$('tok').value.trim();if(!t){$('loginMsg').textContent='Hãy dán mã truy cập.';return}
  token=t;$('loginMsg').textContent='Đang kiểm tra…';
  gh('').then(function(r){
    if(!r.permissions||!r.permissions.push){$('loginMsg').textContent='Mã này chỉ đọc được, chưa ghi được. Tạo lại với quyền Contents: Read and write.';return}
    if($('rem').checked)lsSet('vt_token',t);else lsDel('vt_token');
    return loadPosts().then(function(){renderList();show('vList');$('loginMsg').textContent=''});
  }).catch(function(e){$('loginMsg').textContent=explain(e)});
}
$('doLogin').onclick=login;
$('tok').onkeydown=function(e){if(e.key==='Enter')login()};
$('logout').onclick=function(){lsDel('vt_token');token='';$('tok').value='';show('vLogin')};
$('goList').onclick=$('goNew').onclick=$('goNew2').onclick=null;
$('goList').onclick=function(){if(leave())refreshList()};
$('goNew').onclick=$('goNew2').onclick=function(){if(leave())newPost()};
function leave(){return !dirty||confirm('Bài đang soạn chưa đăng. Rời đi bây giờ? (Bản nháp vẫn được lưu trên máy này)')}
function refreshList(){loadPosts().then(function(){renderList();show('vList')}).catch(function(e){toast(explain(e),1)})}

/* ---------- danh sách ---------- */
function renderList(){
  var tb=$('rows');tb.innerHTML='';
  var l=posts.slice().sort(function(a,b){return (b.date||'').localeCompare(a.date||'')});
  $('noPosts').style.display=l.length?'none':'block';
  l.forEach(function(p){
    var tr=document.createElement('tr');
    tr.innerHTML='<td><b>'+esc(p.title)+'</b><div class="hint" style="margin:0">/bai-viet/'+esc(p.slug)+'.html</div></td><td>'+esc(p.category)+'</td><td>'+fmtDate(p.date)+'</td><td><div class="act"><a class="btn" target="_blank" href="'+CFG.site+'bai-viet/'+esc(p.slug)+'.html">Xem</a><button class="btn" data-e="'+esc(p.slug)+'">Sửa</button><button class="btn r" data-d="'+esc(p.slug)+'">Gỡ</button></div></td>';
    tb.appendChild(tr);
  });
}
$('rows').onclick=function(e){
  var s=e.target.getAttribute('data-e'),d=e.target.getAttribute('data-d');
  if(s)openPost(s);if(d)removePost(d);
};

/* ---------- làm sạch HTML ---------- */
var MAP={B:'STRONG',STRONG:'STRONG',I:'EM',EM:'EM',H1:'H2',H2:'H2',H3:'H3',H4:'H3',H5:'H3',H6:'H3',P:'P',DIV:'P',UL:'UL',OL:'OL',LI:'LI',BLOCKQUOTE:'BLOCKQUOTE',A:'A',IMG:'IMG',BR:'BR'};
var INLINE={STRONG:1,EM:1,A:1,BR:1};
function walk(src,dst){
  Array.prototype.forEach.call(src.childNodes,function(n){
    if(n.nodeType===3){dst.appendChild(document.createTextNode(n.nodeValue));return}
    if(n.nodeType!==1)return;
    var t=n.tagName;
    if(t==='SCRIPT'||t==='STYLE'||t==='META'||t==='LINK'||t==='NOSCRIPT')return;
    var m=MAP[t];
    if(!m){walk(n,dst);return}
    var el=document.createElement(m);
    if(m==='A'){var h=n.getAttribute('href')||'';if(!/^(https?:|mailto:|tel:|\.\.\/|[a-z0-9-]+\.html|#)/i.test(h)){walk(n,dst);return}el.setAttribute('href',h);if(/^https?:/i.test(h)&&h.indexOf(CFG.site)!==0)el.setAttribute('rel','noopener')}
    if(m==='IMG'){var s=n.getAttribute('src')||'';if(!s)return;el.setAttribute('src',s);el.setAttribute('alt',n.getAttribute('alt')||'');if(n.getAttribute('data-pend'))el.setAttribute('data-pend',n.getAttribute('data-pend'))}
    if(m!=='IMG'&&m!=='BR')walk(n,el);
    dst.appendChild(el);
  });
}
function sanitize(html){
  var d=new DOMParser().parseFromString('<body>'+html,'text/html'),out=document.createElement('div');
  walk(d.body,out);
  var res=document.createElement('div'),buf=null;
  Array.prototype.slice.call(out.childNodes).forEach(function(n){
    var inl=n.nodeType===3||INLINE[n.tagName];
    if(inl){if(!buf){buf=document.createElement('p');res.appendChild(buf)}buf.appendChild(n)}else{buf=null;res.appendChild(n)}
  });
  Array.prototype.forEach.call(res.querySelectorAll('p'),function(p){if(!p.textContent.trim()&&!p.querySelector('img'))p.remove()});
  Array.prototype.forEach.call(res.querySelectorAll('p>p'),function(p){while(p.firstChild)p.parentNode.parentNode.insertBefore(p.firstChild,p.parentNode);p.remove()});
  return res.innerHTML;
}
function toDisplay(h){return h.split('"../img/').join('"'+CFG.site+'img/')}
function toStore(h){return h.split('"'+CFG.site+'img/').join('"../img/')}

/* ---------- ảnh ---------- */
function resize(file,max){
  return new Promise(function(ok,no){
    var r=new FileReader();r.onerror=no;
    r.onload=function(){var im=new Image();im.onerror=no;im.onload=function(){
      var k=Math.min(1,max/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);
      var x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);ok(c.toDataURL('image/jpeg',.82));
    };im.src=r.result};
    r.readAsDataURL(file);
  });
}
$('coverBtn').onclick=function(){$('coverFile').click()};
$('coverFile').onchange=function(){var f=this.files[0];this.value='';if(!f)return;resize(f,1600).then(function(d){cover={path:'',data:d};setCover();touch()},function(){toast('Không đọc được ảnh này.',1)})};
$('coverDel').onclick=function(){cover={path:'',data:''};setCover();touch()};
function setCover(){var s=cover.data||(cover.path?CFG.site+cover.path:'');$('coverImg').style.display=s?'block':'none';$('coverImg').src=s||'';$('coverDel').style.display=s?'inline-block':'none';$('coverBtn').textContent=s?'Đổi ảnh bìa':'Chọn ảnh bìa'}

/* ---------- trình soạn ---------- */
var ed=$('editor');
try{document.execCommand('defaultParagraphSeparator',false,'p')}catch(e){}
var savedRange=null;
function keepSel(){var s=getSelection();if(s.rangeCount&&ed.contains(s.anchorNode))savedRange=s.getRangeAt(0).cloneRange()}
function restoreSel(){ed.focus();if(savedRange){var s=getSelection();s.removeAllRanges();s.addRange(savedRange)}}
['keyup','mouseup','blur'].forEach(function(ev){ed.addEventListener(ev,keepSel)});
function cmd(c,v){restoreSel();document.execCommand(c,false,v||null);touch()}
$('tb').addEventListener('mousedown',function(e){if(e.target.tagName!=='SELECT')e.preventDefault()});
$('tb').addEventListener('click',function(e){
  var c=e.target.getAttribute&&e.target.getAttribute('data-c');if(!c)return;
  if(c==='h2'||c==='h3'||c==='p')cmd('formatBlock','<'+c+'>');
  else if(c==='bold')cmd('bold');else if(c==='italic')cmd('italic');
  else if(c==='ul')cmd('insertUnorderedList');else if(c==='ol')cmd('insertOrderedList');
  else if(c==='quote')cmd('formatBlock','<blockquote>');
  else if(c==='clear'){cmd('removeFormat');cmd('formatBlock','<p>')}
  else if(c==='link'){keepSel();var u=prompt('Dán địa chỉ link (https://...):','https://');if(u&&u!=='https://')cmd('createLink',u)}
  else if(c==='img'){keepSel();$('imgFile').click()}
});
(function(){var s=$('intLink');PAGES.forEach(function(p){var o=document.createElement('option');o.value='../'+p[1];o.textContent=p[0];s.appendChild(o)})})();
function fillIntLinks(){var s=$('intLink');while(s.options.length>PAGES.length+1)s.remove(s.options.length-1);posts.forEach(function(p){if(editing&&p.slug===editing)return;var o=document.createElement('option');o.value=p.slug+'.html';o.textContent='Bài: '+p.title;s.appendChild(o)})}
$('intLink').onchange=function(){var v=this.value;this.selectedIndex=0;if(v){restoreSel();var sel=getSelection();if(sel.isCollapsed){toast('Hãy bôi đen chữ muốn gắn link trước.',1);return}cmd('createLink',v)}};
$('imgFile').onchange=function(){
  var f=this.files[0];this.value='';if(!f)return;
  resize(f,1600).then(function(d){
    var alt=prompt('Mô tả ảnh (alt) — ngắn gọn, nên có từ khoá. Ví dụ: "Biệt thự phố 3 tầng mặt tiền đá ốp":','')||'';
    var id='p'+(++imgN)+'_'+Date.now();pend[id]=d;
    restoreSel();document.execCommand('insertHTML',false,'<img src="'+d+'" alt="'+esc(alt)+'" data-pend="'+id+'"><p><br></p>');touch();
  },function(){toast('Không đọc được ảnh này.',1)});
};
ed.addEventListener('click',function(e){if(e.target.tagName==='IMG'){var a=prompt('Sửa mô tả ảnh (alt):',e.target.getAttribute('alt')||'');if(a!==null){e.target.setAttribute('alt',a);touch()}}});
ed.addEventListener('paste',function(e){
  var cd=e.clipboardData;if(!cd)return;var h=cd.getData('text/html');
  e.preventDefault();
  if(h){document.execCommand('insertHTML',false,sanitize(h).replace(/<img[^>]*>/g,''))}
  else{var t=cd.getData('text/plain');document.execCommand('insertHTML',false,t.split(/\n{1,}/).filter(Boolean).map(function(l){return '<p>'+esc(l)+'</p>'}).join(''))}
  touch();
});
ed.addEventListener('input',touch);

/* ---------- form + SEO ---------- */
var F={title:$('f_title'),slug:$('f_slug'),cat:$('f_cat'),kw:$('f_kw'),date:$('f_date'),desc:$('f_desc')};
function touch(){dirty=true;$('saveSt').textContent='Chưa đăng · đang soạn';analyze();clearTimeout(touch.k);touch.k=setTimeout(saveDraft,2500)}
F.title.oninput=function(){if(!slugTouched&&!editing)F.slug.value=slugify(F.title.value);touch()};
F.slug.oninput=function(){slugTouched=true;touch()};
F.slug.onblur=function(){F.slug.value=slugify(F.slug.value)};
[F.cat,F.kw,F.date,F.desc].forEach(function(x){x.oninput=touch});
function bodyDoc(){var d=document.createElement('div');d.innerHTML=sanitize(ed.innerHTML);return d}
function words(t){return (t.trim().match(/\S+/g)||[]).length}
function analyze(){
  var title=F.title.value.trim(),desc=F.desc.value.trim(),kw=F.kw.value.trim().toLowerCase(),b=bodyDoc(),txt=b.textContent,w=words(txt);
  $('cTitle').textContent=title.length+' / 60';$('cDesc').textContent=desc.length+' / 160';
  var first=txt.split(/\s+/).slice(0,100).join(' ').toLowerCase();
  var imgs=b.querySelectorAll('img'),noAlt=0;Array.prototype.forEach.call(imgs,function(i){if(!(i.getAttribute('alt')||'').trim())noAlt++});
  var h2=b.querySelectorAll('h2').length,links=b.querySelectorAll('a[href]'),internal=0;Array.prototype.forEach.call(links,function(a){var h=a.getAttribute('href');if(/^\.\.\//.test(h)||/\.html/.test(h)&&!/^https?:/.test(h)||h.indexOf(CFG.site)===0)internal++});
  var hasCover=!!(cover.data||cover.path);
  var C=[];
  function add(ok,txt,level){C.push({s:ok?'ok':(level||'bad'),t:txt})}
  add(title.length>=30&&title.length<=60,'Tiêu đề 30–60 ký tự (hiện '+title.length+')',title.length?'warn':'bad');
  add(desc.length>=120&&desc.length<=160,'Mô tả 120–160 ký tự (hiện '+desc.length+')',desc.length?'warn':'bad');
  add(!!kw,'Đã nhập từ khoá chính');
  if(kw){add(title.toLowerCase().indexOf(kw)>-1,'Từ khoá có trong tiêu đề');add(desc.toLowerCase().indexOf(kw)>-1,'Từ khoá có trong mô tả','warn');add(first.indexOf(kw)>-1,'Từ khoá có trong 100 chữ đầu','warn');add(F.slug.value.indexOf(slugify(kw))>-1,'Từ khoá có trong đường dẫn','warn')}
  add(w>=600,'Nội dung từ 600 chữ trở lên (hiện '+w+')',w>=300?'warn':'bad');
  add(h2>=2,'Có ít nhất 2 tiêu đề H2 (hiện '+h2+')','warn');
  add(hasCover,'Có ảnh bìa','warn');
  add(imgs.length>0&&noAlt===0,imgs.length?'Mọi ảnh đều có mô tả alt'+(noAlt?' (thiếu '+noAlt+')':''):'Có ít nhất 1 ảnh trong bài','warn');
  add(internal>=1,'Có link nội bộ (đến Dịch vụ, Công trình, Liên hệ…)','warn');
  var pts=C.reduce(function(a,c){return a+(c.s==='ok'?1:c.s==='warn'?.4:0)},0);
  $('score').textContent=Math.round(100*pts/C.length);
  $('checks').innerHTML=C.map(function(c){return '<li class="'+c.s+'">'+esc(c.t)+'</li>'}).join('');
  $('sU').textContent=CFG.site.replace('https://','')+'bai-viet/'+(F.slug.value||'…')+'.html';
  $('sT').textContent=title||'Tiêu đề bài viết';$('sD').textContent=desc||'Mô tả bài viết sẽ hiện ở đây.';
}

/* ---------- nháp ---------- */
function saveDraft(){
  if(!$('vEdit').classList.contains('on'))return;
  var d={f:{title:F.title.value,slug:F.slug.value,cat:F.cat.value,kw:F.kw.value,date:F.date.value,desc:F.desc.value},html:toStore(ed.innerHTML),editing:editing,cover:{path:cover.path},at:Date.now()};
  if(Object.keys(pend).length===0&&!cover.data)d.ok=1;
  lsSet('vt_draft',JSON.stringify(d));$('saveSt').textContent='Đã lưu nháp trên máy lúc '+new Date().toLocaleTimeString('vi-VN');
}
$('bDraft').onclick=function(){saveDraft();toast('Đã lưu nháp trên máy này. Muốn lên web thì bấm "Đăng bài".')};
function fill(p,html){
  F.title.value=p.title||'';F.slug.value=p.slug||'';F.cat.value=p.cat||F.cat.options[0].value;F.kw.value=p.kw||'';F.date.value=p.date||today();F.desc.value=p.desc||'';
  ed.innerHTML=toDisplay(html||'');analyze();
}
function newPost(){
  editing=null;pend={};cover={path:'',data:''};slugTouched=false;dirty=false;
  $('edTitle').textContent='Bài mới';fillIntLinks();setCover();
  var d=lsGet('vt_draft'),use=false;
  if(d){try{d=JSON.parse(d);if(d.ok&&d.html&&(d.f.title||d.html.length>20)&&confirm('Có bản nháp chưa đăng ('+(d.f.title||'chưa có tiêu đề')+'). Khôi phục nó?')){use=true}}catch(e){}}
  if(use){editing=d.editing;cover={path:d.cover&&d.cover.path||'',data:''};slugTouched=true;fill(d.f,d.html);$('edTitle').textContent=editing?'Sửa bài':'Bài mới (nháp)';setCover()}
  else fill({},'');
  dirty=false;$('saveSt').textContent='';show('vEdit');
}
function openPost(slug){
  var p=posts.filter(function(x){return x.slug===slug})[0];if(!p)return;
  toast('Đang mở bài…');
  readFile('bai-viet/'+slug+'.html').then(function(t){
    if(!t){toast('Không tìm thấy file bài viết trên web.',1);return}
    var d=new DOMParser().parseFromString(t,'text/html'),body=d.getElementById('post-body');
    editing=slug;pend={};cover={path:p.cover||'',data:''};slugTouched=true;fillIntLinks();
    fill({title:p.title,slug:p.slug,cat:p.category,kw:p.keyword,date:p.date,desc:p.description},body?body.innerHTML:'');
    $('edTitle').textContent='Sửa bài';setCover();dirty=false;$('saveSt').textContent='';show('vEdit');
  }).catch(function(e){toast(explain(e),1)});
}

/* ---------- tạo trang bài viết ---------- */
function postHtml(p,body){
  var url=CFG.site+'bai-viet/'+p.slug+'.html',img=CFG.site+(p.cover||'img/minhhoa-hero.jpg');
  var ld={'@context':'https://schema.org','@graph':[
    {'@type':'Article','headline':p.title,'description':p.description,'image':img,'datePublished':p.date,'dateModified':p.updated,'inLanguage':'vi','mainEntityOfPage':url,
     'author':{'@type':'Organization','name':'Công ty TNHH Kiến Trúc Xây Dựng Viên Thành'},
     'publisher':{'@type':'Organization','name':'Viên Thành','logo':{'@type':'ImageObject','url':CFG.site+'img/logo-vienthanh.png'}}},
    {'@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':1,'name':'Trang chủ','item':CFG.site},{'@type':'ListItem','position':2,'name':'Tin tức','item':CFG.site+'tin-tuc.html'},{'@type':'ListItem','position':3,'name':p.title,'item':url}]}]};
  return '<!doctype html>\n<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n'+
'<title>'+esc(p.title)+' · Viên Thành</title>\n<meta name="description" content="'+esc(p.description)+'">\n'+
(p.keyword?'<meta name="keywords" content="'+esc(p.keyword)+'">\n':'')+
'<link rel="canonical" href="'+url+'">\n'+
'<meta property="og:type" content="article"><meta property="og:locale" content="vi_VN"><meta property="og:site_name" content="Viên Thành">\n<meta property="og:title" content="'+esc(p.title)+'"><meta property="og:description" content="'+esc(p.description)+'"><meta property="og:url" content="'+url+'"><meta property="og:image" content="'+img+'">\n'+
'<meta name="twitter:card" content="summary_large_image">\n'+
'<script type="application/ld+json">'+JSON.stringify(ld).replace(/</g,'\\u003c')+'</script>\n'+
'<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'+
'<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Montserrat:wght@300;400;500;600&display=swap" rel="stylesheet">\n'+
'<link rel="icon" type="image/png" href="../img/favicon.png"><link rel="stylesheet" href="../css/style.css"></head><body>\n'+
'<div class="top"><span>HOTLINE 0901 988 179</span><span>12 ĐƯỜNG SỐ 3, BÌNH HƯNG HÒA, TP.HCM</span><span>VIE / ENG</span></div>\n'+
'<header class="solid"><a class="logo" href="../index.html"><img src="../img/logo-vienthanh.png" alt="Logo Viên Thành" width="52" height="54" style="height:62px;width:auto"><div><b>VIÊN THÀNH</b><small>KIẾN TRÚC · XÂY DỰNG</small></div></a>\n'+
'<nav id="nav"><ul><li><a href="../index.html">Trang chủ</a></li><li><a href="../gioi-thieu.html">Giới thiệu</a></li><li><a href="../dich-vu.html">Dịch vụ</a></li><li><a href="../cong-trinh.html">Công trình</a></li><li><a href="../tin-tuc.html" class=on>Tin tức</a></li><li><a href="../lien-he.html">Liên hệ</a></li></ul></nav>\n'+
'<button class="burger" aria-label="Mở menu" aria-expanded="false">☰</button></header>\n'+
'<div class="phead" style="padding-bottom:50px"><div class="wrap art"><div class="eyebrow">'+esc(p.category)+'</div><h1 style="font-size:clamp(34px,4.6vw,60px);line-height:1.1;margin-top:14px">'+esc(p.title)+'</h1></div></div>\n'+
'<section style="padding-top:20px"><article class="art"><div class="meta">Viên Thành · <time datetime="'+p.date+'">'+fmtDate(p.date)+'</time> · '+p.readMin+' phút đọc</div>\n'+
(p.cover?'<img class="cover" src="../'+esc(p.cover)+'" alt="'+esc(p.title)+'" width="1600" height="1000">\n':'')+
'<div class="prose" id="post-body">'+body+'</div>\n'+
'<div class="artcta"><h3>Cần tư vấn thiết kế<br><i style="color:var(--gold)">và thi công?</i></h3><a class="btn g" href="../lien-he.html">Nhận tư vấn</a></div>\n'+
'<a class="back" href="../tin-tuc.html">← Tất cả bài viết</a></article></section>\n'+
'<footer><div><a class="logo" href="../index.html" style="margin-bottom:18px"><img src="../img/logo-vienthanh.png" alt="Logo Viên Thành" width="52" height="54" style="height:62px;width:auto"><div><b>VIÊN THÀNH</b></div></a>Công ty TNHH Kiến Trúc Xây Dựng Viên Thành<br>Mã số thuế: 0318 245 2277<br>Trụ sở: 12 đường số 3, Bình Hưng Hòa, TP.HCM<br>Hotline: <a href="tel:0901988179">0901 988 179</a></div>\n'+
'<div><h6>Khám phá</h6><a href="../gioi-thieu.html">Giới thiệu</a><br><a href="../dich-vu.html">Dịch vụ</a><br><a href="../cong-trinh.html">Công trình</a><br><a href="../tin-tuc.html">Tin tức</a><br><a href="../lien-he.html">Liên hệ</a></div>\n'+
'<div><h6>Kết nối</h6><a href="../lien-he.html">Gửi yêu cầu tư vấn</a><br><a href="tel:0901988179">Gọi 0901 988 179</a></div>\n'+
'<div class="copy"><span>© VIÊN THÀNH · VẸN CHỮ TÂM, THÀNH CHỮ TÍN</span></div></footer>\n<script src="../js/main.js"></script></body></html>\n';
}
function sitemap(list){
  var u=PAGES.map(function(p){return [p[1]==='index.html'?'':p[1],today()]}).concat(list.map(function(p){return ['bai-viet/'+p.slug+'.html',p.updated||p.date]}));
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+u.map(function(x){return '<url><loc>'+CFG.site+x[0]+'</loc><lastmod>'+x[1]+'</lastmod></url>'}).join('\n')+'\n</urlset>\n';
}

/* ---------- xem trước ---------- */
function collect(){
  var p={slug:slugify(F.slug.value||F.title.value),title:F.title.value.trim(),description:F.desc.value.trim(),category:F.cat.value,keyword:F.kw.value.trim(),date:F.date.value||today(),updated:today()};
  var b=bodyDoc();p.readMin=Math.max(1,Math.ceil(words(b.textContent)/200));p.cover=cover.path||'';return {p:p,body:b};
}
$('bPrev').onclick=function(){
  var c=collect(),p=c.p,html=toStore(c.body.innerHTML);
  Object.keys(pend).forEach(function(id){html=html.split('data-pend="'+id+'"').join('data-pend="'+id+'"')});
  var pageHtml=postHtml(p,html);
  if(cover.data){pageHtml=pageHtml.replace('<img class="cover" src="../'+p.cover+'"','<img class="cover" src="'+cover.data+'"')}
  if(cover.data&&!p.cover){pageHtml=pageHtml.replace('<div class="prose"','<img class="cover" src="'+cover.data+'" alt="">\n<div class="prose"')}
  pageHtml=pageHtml.replace('<head>','<head><base href="'+CFG.site+'bai-viet/">');
  $('pvFrame').srcdoc=pageHtml;$('pv').classList.add('on');
};
$('pvClose').onclick=function(){$('pv').classList.remove('on')};

/* ---------- đăng bài ---------- */
$('bPub').onclick=function(){
  var c=collect(),p=c.p,miss=[];
  if(!p.title)miss.push('tiêu đề');if(!p.slug)miss.push('đường dẫn');if(!p.description)miss.push('mô tả');if(!c.body.textContent.trim())miss.push('nội dung');
  if(miss.length){toast('Còn thiếu: '+miss.join(', ')+'.',1);return}
  var sc=parseInt($('score').textContent,10);
  if(sc<60&&!confirm('Điểm SEO mới '+sc+'/100. Vẫn đăng?'))return;
  var btn=$('bPub');btn.disabled=true;btn.textContent='Đang đăng…';
  var files=[];
  loadPosts().then(function(){
    var clash=posts.filter(function(x){return x.slug===p.slug&&x.slug!==editing})[0];
    if(clash)throw {custom:'Đường dẫn "'+p.slug+'" đã có bài khác dùng. Hãy đổi slug.'};
    var old=posts.filter(function(x){return x.slug===editing})[0];
    if(old){p.date=F.date.value||old.date}
    // ảnh bìa
    if(cover.data){p.cover='img/blog/'+p.slug+'-cover.jpg';files.push({path:p.cover,b64:cover.data.split(',')[1]})}
    else if(cover.path&&editing&&editing!==p.slug&&cover.path.indexOf('img/blog/'+editing+'-')===0){var np='img/blog/'+p.slug+'-cover.jpg';files.push({path:np,b64:null,copyFrom:cover.path});p.cover=np}
    // ảnh trong bài
    var doc=c.body,n=0;
    Array.prototype.forEach.call(doc.querySelectorAll('img[data-pend]'),function(im){
      var id=im.getAttribute('data-pend'),d=pend[id];im.removeAttribute('data-pend');
      if(d){n++;var path='img/blog/'+p.slug+'-'+Date.now().toString(36)+n+'.jpg';files.push({path:path,b64:d.split(',')[1]});im.setAttribute('src','../'+path)}
    });
    var html=toStore(doc.innerHTML);
    // nếu đổi slug: xoá file cũ
    if(editing&&editing!==p.slug)files.push({path:'bai-viet/'+editing+'.html',del:true});
    files.push({path:'bai-viet/'+p.slug+'.html',text:postHtml(p,html)});
    var entry={slug:p.slug,title:p.title,description:p.description,category:p.category,keyword:p.keyword,cover:p.cover,date:p.date,updated:p.updated,readMin:p.readMin};
    var list=posts.filter(function(x){return x.slug!==editing&&x.slug!==p.slug});list.push(entry);
    list.sort(function(a,b){return (b.date||'').localeCompare(a.date||'')});
    files.push({path:'data/posts.json',text:JSON.stringify({posts:list},null,1)+'\n'});
    files.push({path:'sitemap.xml',text:sitemap(list)});
    p._list=list;
    // sao chép bìa cũ nếu đổi slug
    var cp=files.filter(function(f){return f.copyFrom})[0];
    if(cp)return gh('/contents/'+cp.copyFrom+'?ref='+CFG.branch).then(function(j){cp.b64=j.content.replace(/\n/g,'')});
  }).then(function(){return commit(files,(editing?'Sửa bài: ':'Đăng bài: ')+p.title)}).then(function(){
    posts=p._list;dirty=false;pend={};lsDel('vt_draft');editing=p.slug;
    btn.disabled=false;btn.textContent='Đăng bài';
    var u=CFG.site+'bai-viet/'+p.slug+'.html';
    toast('Đã đăng! Web cập nhật sau khoảng 1–2 phút.');
    renderList();$('saveSt').innerHTML='Đã đăng · <a target="_blank" href="'+u+'">mở bài</a> (đợi 1–2 phút nếu chưa thấy)';
    show('vList');
  }).catch(function(e){btn.disabled=false;btn.textContent='Đăng bài';toast(e&&e.custom?e.custom:explain(e||{}),1)});
};

/* ---------- gỡ bài ---------- */
function removePost(slug){
  var p=posts.filter(function(x){return x.slug===slug})[0];if(!p)return;
  if(!confirm('Gỡ bài "'+p.title+'" khỏi website? Bài sẽ mất khỏi Google sau một thời gian.'))return;
  var files=[{path:'bai-viet/'+slug+'.html',del:true}];
  readFile('bai-viet/'+slug+'.html').then(function(t){
    var re=/img\/blog\/[A-Za-z0-9._-]+/g,m,seen={};
    while(t&&(m=re.exec(t))){if(!seen[m[0]]&&m[0].indexOf('img/blog/'+slug+'-')===0){seen[m[0]]=1;files.push({path:m[0],del:true})}}
    var list=posts.filter(function(x){return x.slug!==slug});
    files.push({path:'data/posts.json',text:JSON.stringify({posts:list},null,1)+'\n'});
    files.push({path:'sitemap.xml',text:sitemap(list)});
    return commit(files,'Gỡ bài: '+p.title).then(function(){posts=list;renderList();toast('Đã gỡ bài. Web cập nhật sau 1–2 phút.')});
  }).catch(function(e){toast(explain(e),1)});
}

window.addEventListener('beforeunload',function(e){if(dirty){e.preventDefault();e.returnValue=''}});

/* ---------- khởi động ---------- */
var saved=lsGet('vt_token');
if(saved){$('tok').value=saved;login()}
})();
