const STORAGE_KEY = 'ksb_assessment_v1';

function buildSections(items){
  const groups = { Knowledge: [], Skill: [], Behaviour: [] };
  items.forEach(it => {
    if(it.type === 'Knowledge') groups.Knowledge.push(it);
    else if(it.type === 'Skill') groups.Skill.push(it);
    else groups.Behaviour.push(it);
  });
  return groups;
}

function createElement(html){
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

function renderAssessment(){
  const container = document.getElementById('assessment');
  container.innerHTML = '';
  const groups = buildSections(window.KSB_ITEMS);

  Object.keys(groups).forEach(sectionName => {
    const card = createElement(`<div class="section-card"><div class="section-title"><h2>${sectionName}</h2><div class="muted">${groups[sectionName].length} items</div></div></div>`);
    groups[sectionName].forEach(item => {
      const saved = getSavedAnswer(item.id) || {};
      const rating = saved.rating || 3;
      const comment = saved.comment || '';

      // avoid duplicating the id if the title already begins with it (e.g. "K9 Evaluation...")
      const titleText = (item.title || '').trim();
      const titleStartsWithId = titleText.toLowerCase().startsWith(String(item.id).toLowerCase());
      const headerText = titleStartsWithId ? titleText : `${item.id} — ${titleText}`;

      const itemEl = createElement(`
        <div class="item" data-id="${item.id}">
          <div>
            <h4>${headerText}</h4>
            <div class="desc">${item.description}</div>
          </div>
          <div class="rating">
            <label>Rating: <span class="val">${rating}</span></label>
            <input type="range" min="1" max="5" value="${rating}" class="slider">
            <textarea class="comment" placeholder="Optional notes / development ideas">${comment}</textarea>
          </div>
        </div>
      `);

      const slider = itemEl.querySelector('.slider');
      const val = itemEl.querySelector('.val');
      slider.addEventListener('input', e => {
        val.textContent = e.target.value;
        if(window.ThreeScene && typeof window.ThreeScene.updateShape === 'function'){
          try{ window.ThreeScene.updateShape(item.id, parseInt(e.target.value,10)); }catch(e){}
        }
      });

      card.appendChild(itemEl);
    });
    container.appendChild(card);
  });
}

function getAllAnswers(){
  const rows = Array.from(document.querySelectorAll('.item'));
  const out = {};
  rows.forEach(row => {
    const id = row.dataset.id;
    const rating = parseInt(row.querySelector('.slider').value,10);
    const comment = row.querySelector('.comment').value.trim();
    out[id] = { rating, comment };
  });
  return out;
}

function saveProgress(){
  const data = getAllAnswers();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), answers: data }));
  alert('Progress saved locally in your browser.');
}

function loadProgress(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw){ alert('No saved progress found.'); return; }
  try{
    const parsed = JSON.parse(raw);
    const answers = parsed.answers || {};
    Object.keys(answers).forEach(id => {
      const node = document.querySelector(`.item[data-id="${id}"]`);
      if(node){
        const a = answers[id];
        node.querySelector('.slider').value = a.rating;
        node.querySelector('.val').textContent = a.rating;
        node.querySelector('.comment').value = a.comment || '';
      }
    });
    // update 3D scene to reflect loaded answers
    try{ window.ThreeScene && window.ThreeScene.updateAll && window.ThreeScene.updateAll(answers); }catch(e){console.warn('ThreeScene updateAll failed on load', e)}
    alert('Progress loaded.');
  }catch(e){ console.error(e); alert('Failed to load saved data.'); }
}

function clearAnswers(){
  if(!confirm('Clear all answers on this page? This will not delete saved local data.')) return;
  document.querySelectorAll('.item').forEach(node => {
    node.querySelector('.slider').value = 3;
    node.querySelector('.val').textContent = 3;
    node.querySelector('.comment').value = '';
  });
}

function exportCSV(){
  const answers = getAllAnswers();
  const rows = [['id','type','title','rating','comment']];
  window.KSB_ITEMS.forEach(item => {
    const a = answers[item.id] || {};
    rows.push([item.id,item.type,escapeCsv(item.title),a.rating||'',escapeCsv(a.comment||'')]);
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'ksb_assessment.csv'; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function escapeCsv(s){
  if(!s) return '';
  return '"' + s.replace(/"/g,'""') + '"';
}

function getSavedAnswer(id){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) return null;
  try{ const parsed = JSON.parse(raw); return parsed.answers && parsed.answers[id] ? parsed.answers[id] : null; }catch(e){return null}
}

function showSummary(){
  const answers = getAllAnswers();
  const groups = { Knowledge: [], Skill: [], Behaviour: [] };
  window.KSB_ITEMS.forEach(item => {
    const a = answers[item.id] || { rating: null };
    groups[item.type === 'Knowledge' ? 'Knowledge' : item.type === 'Skill' ? 'Skill' : 'Behaviour'].push({ item, rating: a.rating, comment: a.comment });
  });

  const content = document.getElementById('summaryContent');
  content.innerHTML = '';

  Object.keys(groups).forEach(section => {
    const list = groups[section];
    const avg = (list.reduce((s,x)=>s+(x.rating||0),0) / list.length).toFixed(2);
    const secEl = document.createElement('div');
    secEl.innerHTML = `<h3>${section} — average rating: ${avg}</h3>`;

    // low items
    const low = list.filter(x => !x.rating || x.rating <= 3);
    if(low.length){
      const ul = document.createElement('ul');
      low.forEach(x => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${x.item.id}</strong> ${x.item.title} — current: ${x.rating||'n/a'}<div class="desc">${x.item.description}</div>`;
        const suggestion = generateSuggestion(x.item);
        const sug = document.createElement('div');
        sug.style.marginTop='6px';
        sug.innerHTML = `<em>Suggested development actions:</em><ol>${suggestion.map(s=>`<li>${s}</li>`).join('')}</ol>`;
        li.appendChild(sug);
        ul.appendChild(li);
      });
      secEl.appendChild(ul);
    } else {
      const p = document.createElement('p');
      p.textContent = 'No items requiring immediate development in this area (ratings > 3).';
      secEl.appendChild(p);
    }

    content.appendChild(secEl);
  });

  // Show full development plan suggestion (aggregate)
  const plan = document.createElement('div');
  plan.innerHTML = `<h3>Suggested development plan (starter)</h3>`;
  const planList = document.createElement('ol');
  // pick top 6 lowest-rated items
  const all = window.KSB_ITEMS.map(it => ({ it, rating: (answers[it.id] && answers[it.id].rating) || 0 })).sort((a,b)=>a.rating - b.rating);
  all.slice(0,6).forEach(x => {
    planList.appendChild(Object.assign(document.createElement('li'), { innerHTML: `<strong>${x.it.id}</strong> ${x.it.title} — goal: improve to 4 within 8 weeks. Actions: ${generateSuggestion(x.it).slice(0,3).join('; ')}` }));
  });
  plan.appendChild(planList);
  content.appendChild(plan);

  document.getElementById('summary').classList.remove('hidden');
  window.scrollTo({top: document.getElementById('summary').offsetTop, behavior:'smooth'});
}

function generateSuggestion(item){
  const suggestions = [];
  if(item.type === 'Knowledge'){
    suggestions.push('Read 1-2 short papers or summaries on the theory and write a 300-word reflection linking it to your practice.');
    suggestions.push('Attend a workshop or watch online course modules; identify 2 techniques to trial in next coaching session.');
  }
  if(item.type === 'Skill'){
    suggestions.push('Practice the skill in a low-risk setting (peer-coaching) and request structured feedback.');
    suggestions.push('Set a SMART goal for the skill and track 3 practice sessions with reflection notes.');
  }
  if(item.type === 'Behaviour'){
    suggestions.push('Create a personal development objective and log weekly reflections; consider supervision for support.');
    suggestions.push('Use a peer accountability partner and schedule short check-ins to review progress and resilience strategies.');
  }

  if(/contract/i.test(item.title)) suggestions.push('Draft a short contracting checklist and use it for your next 3 coaching relationships.');
  if(/feedback/i.test(item.title) || /listening/i.test(item.title)) suggestions.push('Use a listening-levels checklist and practise with role-play; collect feedback on listening from peers.');
  if(/diversity|inclusion|bias/i.test(item.title)) suggestions.push('Complete a bias-awareness exercise and reflect on adjustments to your practice to be more inclusive.');

  return Array.from(new Set(suggestions)).slice(0,6);
}

document.addEventListener('DOMContentLoaded', () => {
  renderAssessment();
  try{ window.ThreeScene && window.ThreeScene.init && window.ThreeScene.init(document.getElementById('sceneCanvas')); }catch(e){console.warn(e)}
  // ensure 3D shapes reflect the currently-rendered sliders (initial state)
  try{ window.ThreeScene && window.ThreeScene.updateAll && window.ThreeScene.updateAll(getAllAnswers()); }catch(e){console.warn('ThreeScene updateAll failed', e)}
  document.getElementById('saveBtn').addEventListener('click', saveProgress);
  document.getElementById('loadBtn').addEventListener('click', loadProgress);
  document.getElementById('clearBtn').addEventListener('click', clearAnswers);
  document.getElementById('exportCsvBtn').addEventListener('click', exportCSV);
  document.getElementById('summaryBtn').addEventListener('click', showSummary);
  try{ const raw = localStorage.getItem(STORAGE_KEY); if(raw){ const parsed = JSON.parse(raw); window.ThreeScene && window.ThreeScene.updateAll && window.ThreeScene.updateAll(parsed.answers || {}); } }catch(e){}
});
